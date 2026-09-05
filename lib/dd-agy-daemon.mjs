import { createHash, randomUUID } from "node:crypto";
import { appendFile, chmod, lstat, mkdir, open, readFile, realpath, rename, unlink, writeFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import net from "node:net";
import { durableDaemonDispatch } from "./daemon-operations.mjs";
import path from "node:path";
import { AgyError, assertProfile, executable, observedProfile, runAgy, usageSnapshot } from "./dd-agy.mjs";
import { confirmDaemonProcess, confirmDaemonStopped, finishDaemonProcess, heartbeatDaemonProcess, registerDaemonProcess, stopProcessGroup } from "./managed-daemon.mjs";

const REQUEST_SCHEMA = "dd-agy/daemon-request@1", RESPONSE_SCHEMA = "dd-agy/daemon-response@1", STATE_SCHEMA = "dd-agy/daemon-state@1";
class DaemonError extends AgyError {}
const absolute = (value, label) => { if (!value || !path.isAbsolute(value)) throw new DaemonError("invalid_path", `${label} must be an absolute path`); return path.resolve(value); };
function locations(stateDir) {
  const dir = absolute(stateDir, "--state-dir"), digest = createHash("sha256").update(dir).digest("hex").slice(0, 22), local = path.join(dir, "daemon.sock");
  // `tsx` creates Unix-domain sockets below TMPDIR.  An evaluation path is
  // intentionally descriptive and can exceed the platform's socket-path cap,
  // so provider temp files must not inherit that path.
  return { dir, socket: Buffer.byteLength(local) < 100 ? local : `/tmp/dd-agy-${digest}.sock`, state: path.join(dir, "daemon.json"), journal: path.join(dir, "events.jsonl"), log: path.join(dir, "daemon.log"), gemini: path.join(dir, "gemini"), runtime: path.join(dir, "gemini", "runtime"), config: path.join(dir, "gemini", "config"), temporary: `/tmp/dd-agy-tmp-${digest}` };
}
async function writeJson(file, value) { const temporary = `${file}.${process.pid}.${randomUUID()}.tmp`; await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 }); await rename(temporary, file); }
async function readState(dir) { try { return JSON.parse(await readFile(locations(dir).state, "utf8")); } catch (error) { if (error.code === "ENOENT") return null; throw error; } }
async function removeSocket(paths) { try { if (!(await lstat(paths.socket)).isSocket()) throw new DaemonError("unsafe_socket", "refusing to replace a non-socket daemon path"); await unlink(paths.socket); } catch (error) { if (error.code !== "ENOENT") throw error; } }
const shell = value => `'${String(value).replaceAll("'", `'"'"'`)}'`;
function sanitizedEnv(config) { const env = { ...process.env, TMPDIR: config.temporary }; for (const key of ["GEMINI_API_KEY","GOOGLE_API_KEY","ANTHROPIC_API_KEY","OPENAI_API_KEY"]) delete env[key]; return env; }
function errorPayload(error) { return { code: error.code ?? "operation_failed", message: error.message ?? String(error), retryable: error.retryable === true, ...(error.details === undefined ? {} : { details: error.details }) }; }
async function forwardUsage(config, sessionId, result, tools, descendants) {
  if (!config.ddFlowBin || !config.projectRoot) return;
  const snapshot = usageSnapshot(result, tools), hasChildren = descendants.length > 0;
  if (snapshot.total_tokens === null) return { status: "unavailable", reason: "provider_did_not_report_total_tokens" };
  const payload = { provider_session_id: sessionId, daemon_id: config.daemonId, observed_at: new Date().toISOString(), usage_scope: hasChildren ? "unknown" : "physical_session", completeness: hasChildren ? "partial" : "complete", usage: { inputTokens: snapshot.input_tokens, outputTokens: snapshot.output_tokens, reasoningTokens: snapshot.reasoning_tokens, cacheReadInputTokens: snapshot.cache_read_tokens, totalTokens: snapshot.total_tokens }, tool_calls: snapshot.tool_calls };
  const target = executable(config.ddFlowBin, ["agy", "usage", "ingest", "--project-root", config.projectRoot, "--json"]);
  await new Promise((resolve, reject) => { const child = spawn(target.command, target.args, { env: { ...process.env, DD_FLOW_HOME: config.ddFlowHome }, stdio: ["pipe", "ignore", "pipe"] }); let stderr = ""; child.stderr.setEncoding("utf8").on("data", chunk => stderr += chunk); child.on("error", reject); child.on("close", code => code === 0 ? resolve() : reject(new DaemonError("agy_usage_ingest_failed", stderr.trim() || "dd-flow rejected Antigravity usage"))); child.stdin.end(`${JSON.stringify(payload)}\n`); });
  return { status: "ingested" };
}

async function prepare(paths, config) {
  for (const dir of [paths.dir, paths.gemini, paths.runtime, paths.config, paths.temporary]) { await mkdir(dir, { recursive: true, mode: 0o700 }); await chmod(dir, 0o700); }
  if (config.noFlow) return;
  const command = `${shell(process.execPath)} ${shell(config.entryPath)} hook handle --event __EVENT__ --state-dir ${shell(paths.dir)} --project-root ${shell(config.projectRoot)} --dd-flow-bin ${shell(config.ddFlowBin)} --dd-flow-home ${shell(config.ddFlowHome)} --json`;
  const hooks = { "dd-flow": {
    PreToolUse: [{ matcher: "*", hooks: [{ type: "command", command: command.replace("__EVENT__", "PreToolUse"), timeout: 30 }] }],
    PostToolUse: [{ matcher: "*", hooks: [{ type: "command", command: command.replace("__EVENT__", "PostToolUse"), timeout: 30 }] }],
    Stop: [{ type: "command", command: command.replace("__EVENT__", "Stop"), timeout: 30 }]
  } };
  await writeJson(path.join(paths.config, "hooks.json"), hooks);
  config.hooksSha256 = createHash("sha256").update(JSON.stringify(hooks)).digest("hex");
}

export async function callDaemon(stateDir, operation, params = {}, timeoutMs = 30_000) {
  const paths = locations(stateDir), request = { schema_id: REQUEST_SCHEMA, id: process.env.DD_EVAL_OPERATION_ID ?? randomUUID(), operation, params };
  return await new Promise((resolve, reject) => {
    const client = net.createConnection(paths.socket); let buffer = "", settled = false, timer, lastActivity = Date.now(), lastTick = Date.now(), observationGap = false;
    const observerClock = setInterval(() => { const now = Date.now(); if (now - lastTick > 60_000) observationGap = true; lastTick = now; }, Math.min(timeoutMs, 1_000));
    const finish = (error, result) => { if (settled) return; settled = true; if (timer) clearTimeout(timer); clearInterval(observerClock); client.destroy(); error ? reject(error) : resolve(result); };
    const arm = () => { timer = setTimeout(async () => {
      // Prompt RPCs return only at the end.  Native events update this durable
      // timestamp, so a moving timestamp proves productive provider activity.
      if (operation !== "session.prompt") return finish(new DaemonError("daemon_timeout", `${operation} timed out`, true));
      if (observationGap || Date.now() - lastTick > 60_000) return finish(new DaemonError("operation_observation_lost", "Host observation was interrupted; inspect the same daemon operation for its late result", true, { operation_id: request.id }));
      let status = null;
      try {
        status = await callDaemon(stateDir, "daemon.status", {}, Math.min(timeoutMs, 5_000));
        const observed = Date.parse(status.last_activity_at ?? "");
        if (status.active_tree && Number.isFinite(observed) && observed > lastActivity) { lastActivity = observed; return arm(); }
      } catch { /* The original RPC retains the authoritative failure. */ }
      finish(new DaemonError(status?.active_tree ? "subject_liveness_timeout" : "operation_observation_lost", `${operation} has no recent productive provider activity`, true, {
        operation_id: request.id,
        last_activity_at: status?.last_activity_at ?? null,
        active_tree: status?.active_tree === true
      }));
    }, timeoutMs); };
    arm(); client.setEncoding("utf8"); client.on("connect", () => client.write(`${JSON.stringify(request)}\n`)); client.on("data", chunk => { buffer += chunk; const index = buffer.indexOf("\n"); if (index < 0) return; try { const response = JSON.parse(buffer.slice(0, index)); response.ok ? finish(null, response.result) : finish(new DaemonError(response.error.code, response.error.message, response.error.retryable, response.error.details)); } catch (error) { finish(new DaemonError("daemon_protocol_mismatch", error.message)); } }); client.on("error", error => finish(new DaemonError("daemon_not_running", error.message, true))); client.on("end", () => finish(new DaemonError("daemon_connection_closed", `${operation} connection closed before a response`, true))); client.on("close", () => finish(new DaemonError("daemon_connection_closed", `${operation} connection closed before a response`, true)));
  });
}

function sameConfig(state, config) { return ["cwd","bin","provider","model","reasoning","mode","projectRoot","ddFlowBin","ddFlowHome","resourceHome","noFlow"].every(key => (state.config?.[key] ?? null) === (config[key] ?? null)); }
export async function startDaemon(options) {
  const paths = locations(options.stateDir); await mkdir(paths.dir, { recursive: true, mode: 0o700 }); await chmod(paths.dir, 0o700);
  const previous = await readState(paths.dir), noFlow = options.noFlow === true, cwd = await realpath(absolute(options.cwd, "--cwd")), config = { cwd, bin: options.bin ?? process.env.DD_AGY_BIN ?? "agy", provider: String(options.provider ?? "google"), model: String(options.model ?? "gemini-3.1-pro-high"), reasoning: String(options.reasoning ?? "high"), mode: String(options.mode ?? "accept-edits"), projectRoot: noFlow ? cwd : await realpath(absolute(options.projectRoot, "--project-root")), ddFlowBin: noFlow ? null : absolute(options.ddFlowBin, "--dd-flow-bin"), ddFlowHome: noFlow ? null : absolute(options.ddFlowHome, "--dd-flow-home"), resourceHome: noFlow ? null : (process.env.DD_FLOW_RESOURCE_HOME ? absolute(process.env.DD_FLOW_RESOURCE_HOME, "DD_FLOW_RESOURCE_HOME") : null), env: noFlow ? {} : { DD_FLOW_HOME: absolute(options.ddFlowHome, "--dd-flow-home") }, entryPath: absolute(options.entryPath, "dd-agy entry"), daemonId: randomUUID(), geminiDir: paths.gemini, appDataDir: "runtime", temporary: paths.temporary, noFlow };
  try { const status = await callDaemon(paths.dir, "daemon.status", {}, 1000); if (!sameConfig(status, config)) throw new DaemonError("daemon_config_mismatch", "a daemon is already running with different configuration"); return { ...status, already_running: true }; } catch (error) { if (!["daemon_not_running","daemon_timeout"].includes(error.code)) throw error; }
  if (previous?.shutdown_state === "clean") throw new DaemonError("daemon_state_terminal", "a cleanly stopped execution state directory cannot be reused");
  if (previous?.shutdown_state === "running" && previous.active_tree) throw new DaemonError("invalid_harness_crash", "previous Antigravity daemon died with an active or unproven tree");
  await removeSocket(paths); await prepare(paths, config);
  const version = (await runAgy(config.bin, ["--version"], { cwd: config.cwd, env: sanitizedEnv(config), timeoutMs: 10_000 })).stdout.trim();
  const resourceProcess = await registerDaemonProcess(config, { kind: "agy-daemon", owner: `agy:${path.basename(paths.dir)}`, operation: `agy-daemon:${path.basename(paths.dir)}`, stdout: paths.log, stderr: paths.log });
  await writeJson(paths.state, { schema_id: STATE_SCHEMA, daemon_id: config.daemonId, shutdown_state: "starting", active_tree: false, versions: { agy: version }, config, sessions: [], resource_process: resourceProcess });
  const log = await open(paths.log, "a", 0o600), child = spawn(process.execPath, [config.entryPath, "daemon", "serve", "--state-dir", paths.dir], { cwd: config.cwd, env: sanitizedEnv(config), detached: true, stdio: ["ignore", log.fd, log.fd] }); child.unref(); await log.close();
  try {
    await confirmDaemonProcess(config, resourceProcess, child);
    const deadline = Date.now() + 30_000; while (Date.now() < deadline) { await new Promise(resolve => setTimeout(resolve, 100));
      const persisted = await readState(paths.dir);
      if (persisted?.shutdown_state === "failed") {
        const failure = persisted.startup_error ?? {};
        throw new DaemonError(failure.code ?? "daemon_start_failed", failure.message ?? "Antigravity daemon failed before becoming ready", failure.retryable === true, failure.details);
      }
      try { const status = await callDaemon(paths.dir, "daemon.status", {}, 1000); if (status.provider_ready) return status; } catch (error) { if (!["daemon_not_running","daemon_timeout"].includes(error.code)) throw error; }
    }
    throw new DaemonError("daemon_start_failed", "Antigravity daemon did not become ready", true);
  } catch (error) {
    await stopProcessGroup(child).catch(() => {});
    const persisted = await readState(paths.dir).catch(() => null);
    if (persisted?.provider_pid) await stopProcessGroup({ pid: persisted.provider_pid }).catch(() => {});
    await finishDaemonProcess(config, persisted?.provider_process, "failed", "daemon_start_failed").catch(() => {});
    await finishDaemonProcess(config, resourceProcess, "failed", error.code === "daemon_start_failed" ? "daemon_start_timeout" : "daemon_start_error").catch(() => {});
    throw error;
  }
}
export const stopDaemon = async options => { const timeoutMs = options.timeoutMs ?? 30_000; return await confirmDaemonStopped(() => callDaemon(options.stateDir, "daemon.stop", { cancelTree: options.cancelTree === true }, timeoutMs), locations(options.stateDir).socket, timeoutMs); };

class Runtime {
  constructor(paths, state) { this.paths = paths; this.state = state; this.config = state.config; this.child = null; this.providerProcess = state.provider_process ?? null; this.buffer = ""; this.init = null; this.readyPromise = null; this.active = null; this.exited = false; this.toolCalls = new Map(); this.descendants = new Map(); this.lastResult = null; this.lastStop = null; this.transcriptPath = null; this.startupError = null; this.persisting = Promise.resolve(); this.draining = Promise.resolve(); this.lastActivityAt = state.last_activity_at ?? null; this.usageIngest = null; }
  persist(patch = {}) { Object.assign(this.state, patch, { pid: process.pid, updated_at: new Date().toISOString(), last_activity_at: this.lastActivityAt, sessions: this.init ? [{ provider_session_id: this.init.conversation_id, root_provider_session_id: this.init.conversation_id, cwd: this.config.cwd }] : [] }); const snapshot = structuredClone(this.state); this.persisting = this.persisting.then(() => writeJson(this.paths.state, snapshot)); for (const processRecord of [this.state.resource_process, this.providerProcess]) if (processRecord?.id && processRecord.lease_token) this.persisting = this.persisting.then(async () => { try { await heartbeatDaemonProcess(this.config, processRecord); } catch {} }); return this.persisting; }
  async journal(kind, payload = {}) { await appendFile(this.paths.journal, `${JSON.stringify({ schema_id: "dd-agy/daemon-event@1", event_id: randomUUID(), observed_at: new Date().toISOString(), kind, ...payload })}\n`, { mode: 0o600 }); }
  args(sessionId) { return ["--input-format", "stream-json", "--output-format", "stream-json", "--model", this.config.model, "--effort", this.config.reasoning, "--mode", this.config.mode, "--dangerously-skip-permissions", "--print-timeout", "6h", `--gemini_dir=${this.paths.gemini}`, "--app_data_dir=runtime", ...(sessionId ? ["--conversation", sessionId] : ["--new-project"])]; }
  markActivity() { this.lastActivityAt = new Date().toISOString(); }
  async start(sessionId = null) {
    if (this.child && !this.exited) return await this.readyPromise;
    const target = executable(this.config.bin, this.args(sessionId)); this.exited = false; this.buffer = ""; this.init = null;
    let readyResolve, readyReject; this.readyPromise = new Promise((resolve, reject) => { readyResolve = resolve; readyReject = reject; });
    // The provider can reject before durable registration finishes.  Keep a
    // handler attached during that small window; `start()` still returns the
    // original rejection below.
    void this.readyPromise.catch(() => {});
    this.providerProcess = await registerDaemonProcess(this.config, { kind: "agy-provider", owner: `agy:${path.basename(this.paths.dir)}`, operation: `agy-provider:${path.basename(this.paths.dir)}`, stdout: this.paths.log, stderr: this.paths.log });
    const providerProcess = this.providerProcess;
    this.child = spawn(target.command, target.args, { cwd: this.config.cwd, env: sanitizedEnv(this.config), detached: true, stdio: ["pipe", "pipe", "pipe"] });
    let allowProviderFinalization;
    const providerRegistered = new Promise(resolve => { allowProviderFinalization = resolve; });
    this.child.stdout.setEncoding("utf8").on("data", chunk => { this.buffer += chunk; this.draining = this.draining.then(() => this.drain(readyResolve)).catch(error => { readyReject(error); if (this.active) { this.active.reject(error); this.active = null; } }); });
    this.child.stderr.setEncoding("utf8").on("data", chunk => void this.journal("stderr", { text: String(chunk).slice(0, 4000) }));
    this.child.on("error", error => { readyReject(error); if (this.active) { this.active.reject(error); this.active = null; } });
    this.child.on("close", (code, signal) => { const interrupted = Boolean(this.active); this.exited = true; const beforeInit = !this.init;
      const error = this.startupError ?? new DaemonError(beforeInit ? "agy_init_missing" : "agy_terminal_result_missing", `Antigravity exited ${beforeInit ? "before init" : "before result"} (${code ?? signal})`);
      if (beforeInit) readyReject(error);
      if (this.active) { this.active.reject(error); this.active = null; }
      const patch = beforeInit ? { shutdown_state: "failed", startup_error: errorPayload(error), provider_exit: { code, signal }, active_tree: false } : { provider_exit: { code, signal }, active_tree: interrupted };
      void providerRegistered.then(() => this.persist(patch)).then(() => finishDaemonProcess(this.config, providerProcess, beforeInit || interrupted ? "failed" : "stopped", beforeInit || interrupted ? "provider_interrupted" : "provider_stopped").catch(() => {})).finally(() => { if (beforeInit) this.server?.close(); });
    });
    try { await confirmDaemonProcess(this.config, providerProcess, this.child); await this.persist({ provider_process: providerProcess, provider_pid: this.child.pid }); }
    catch (error) { await stopProcessGroup(this.child).catch(() => {}); await finishDaemonProcess(this.config, providerProcess, "failed", "provider_spawn_error").catch(() => {}); throw error; }
    finally { allowProviderFinalization(); }
    return await Promise.race([this.readyPromise, new Promise((_, reject) => setTimeout(() => reject(new DaemonError("agy_init_timeout", "Antigravity init timed out", true)), 30_000))]);
  }
  async drain(readyResolve) { let index; while ((index = this.buffer.indexOf("\n")) >= 0) { const line = this.buffer.slice(0, index).trim(); this.buffer = this.buffer.slice(index + 1); if (!line) continue; let event; try { event = JSON.parse(line); } catch { await this.journal("invalid_json", { line: line.slice(0, 1000) }); continue; }
    // Record an early provider rejection before journalling: a short-lived
    // child can close while the asynchronous write is still pending.
    if (!this.init && event.event === "result" && event.result?.status === "ERROR") this.startupError = new DaemonError("agy_provider_rejected", String(event.result.error ?? "Antigravity rejected the Session before initialization"), false, { provider_result: event.result });
    this.markActivity(); await this.journal("provider_event", { event }); if (event.event === "init") { this.init = { conversation_id: event.conversation_id, ...(event.init ?? {}) }; if (!this.init.conversation_id) throw new DaemonError("agy_init_missing", "Antigravity init has no conversation ID"); const requested = { provider: this.config.provider, model: this.config.model, reasoning: this.config.reasoning, mode: this.config.mode, permission_mode: "always-proceed" }; this.profile = assertProfile(requested, observedProfile(this.init, requested)); await this.persist({ shutdown_state: "running", active_tree: false }); readyResolve(this.init); } else if (event.event === "step_update") this.observeStep(event.step_update ?? {}); else if (event.event === "result") { if (this.startupError) throw this.startupError; await this.finishTurn(event.result ?? {}); } } }
  observeStep(step) { if (step.step_type === "tool" && ["DONE", "ERROR"].includes(step.state)) { const name = step.tool_name ?? step.tool_info?.name ?? "unknown", current = this.toolCalls.get(name) ?? { total: 0, failures: 0 }; current.total += 1; if (step.state === "ERROR" || step.tool_info?.error) current.failures += 1; this.toolCalls.set(name, current); } for (const child of step.subagent_info?.subagents ?? []) if (child.conversation_id) this.descendants.set(child.conversation_id, { provider_session_id: child.conversation_id, parent_provider_session_id: this.init?.conversation_id ?? null, role: child.role ?? null, subagent_type: child.type_name ?? null, log_uri: child.log_uri ?? null, workspace_uris: child.workspace_uris ?? [], status: step.state === "DONE" ? "completed" : "running" }); }
  toolSnapshot() { const byName = {}, failuresByName = {}; let total = 0, failures = 0; for (const [name, value] of this.toolCalls) { byName[name] = value.total; failuresByName[name] = value.failures; total += value.total; failures += value.failures; } return { total, failures, by_name: byName, failures_by_name: failuresByName }; }
  async finishTurn(result) {
    this.lastResult = result; const current = this.active; this.active = null; this.markActivity();
    await this.persist({ active_tree: result.status === "RUNNING" || this.lastStop?.fullyIdle === false, last_result: { status: result.status ?? null, error: result.error ?? null } });
    try { this.usageIngest = await forwardUsage(this.config, result.conversation_id ?? this.init.conversation_id, result, this.toolSnapshot(), [...this.descendants.values()]); }
    catch (error) { this.usageIngest = { status: "failed", error: error.message ?? String(error) }; await this.journal("usage_ingest_failed", this.usageIngest); }
    if (!current) return;
    if (result.status === "ERROR") return current.reject(new DaemonError("agy_provider_failed", String(result.error ?? "Antigravity returned ERROR"), false, { provider_result: result, usage_ingest: this.usageIngest }));
    current.resolve(this.receipt(result));
  }
  receipt(result = this.lastResult) {
    const assistantText = typeof result?.response === "string" ? result.response : typeof result?.text === "string" ? result.text : null;
    return { harness: "antigravity-cli", runtime_family: "antigravity", provider_session_id: this.init?.conversation_id ?? null, adapter_session_id: this.init?.conversation_id ?? null, cwd: this.config.cwd, profile: this.profile, result, ...(assistantText === null ? {} : { assistant_text: assistantText }), usage: usageSnapshot(result ?? {}, this.toolSnapshot()), usage_ingest: this.usageIngest, descendants: [...this.descendants.values()], transcript_path: this.transcriptPath, settled: Boolean(result && result.status !== "RUNNING" && this.lastStop?.fullyIdle !== false) };
  }
  async zeroUsage() { await forwardUsage(this.config, this.init.conversation_id, { usage: {} }, this.toolSnapshot(), []); }
  async prompt(text) { if (!text) throw new DaemonError("prompt_required", "prompt is required"); await this.start(); if (this.active) throw new DaemonError("operation_in_progress", "an Antigravity turn is already running"); if (this.lastResult && !this.receipt().settled) throw new DaemonError("tree_not_settled", "the prior Antigravity agent tree is not fully settled"); this.lastStop = null; await this.persist({ active_tree: true }); return await new Promise((resolve, reject) => { this.active = { resolve, reject }; this.child.stdin.write(`${JSON.stringify({ event: "user", message: { content: text } })}\n`, error => { if (error) { this.active = null; reject(error); } }); }); }
  async observeHook(event, payload) { this.markActivity(); const conversationId = payload.conversationId ?? this.init?.conversation_id; if (payload.transcriptPath) this.transcriptPath = payload.transcriptPath; if (event === "Stop") this.lastStop = { fullyIdle: payload.fullyIdle === true, terminationReason: payload.terminationReason ?? null, executionNum: payload.executionNum ?? null }; const parent = this.descendants.get(conversationId)?.parent_provider_session_id ?? null; const eventId = createHash("sha256").update(JSON.stringify({ daemon: this.config.daemonId, event, conversationId, step: payload.stepIdx ?? null, tool: payload.toolCall?.name ?? null, args: payload.toolCall?.args ?? null })).digest("hex"); await this.journal("hook", { hook_event: event, event_id: eventId, conversation_id: conversationId, fully_idle: payload.fullyIdle ?? null }); return { event_id: eventId, daemon_id: this.config.daemonId, parent_conversation_id: parent, profile: { provider: this.config.provider, model: this.config.model, reasoning: this.config.reasoning, mode: this.config.mode }, project_root: this.config.projectRoot, dd_flow_bin: this.config.ddFlowBin, dd_flow_home: this.config.ddFlowHome };
  }
  async cancel() { if (!this.child || this.exited) return { ...this.receipt(), settled: Boolean(this.exited) }; try { process.kill(-this.child.pid, "SIGINT"); } catch (error) { if (error.code !== "ESRCH") throw error; } const deadline = Date.now() + 5000; while (!this.exited && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 100)); if (!this.exited) await stopProcessGroup(this.child, 5_000); await this.persist({ active_tree: false }); return { ...this.receipt(), cancelled: true, settled: Boolean(this.exited) };
  }
  async close(cancelTree) { if (!cancelTree && (this.active || this.state.active_tree || (this.lastResult && !this.receipt().settled))) throw new DaemonError("tree_not_settled", "Antigravity root or child tree is still running"); if (cancelTree) await this.cancel(); else if (this.child && !this.exited) this.child.stdin.end(); const deadline = Date.now() + 5000; while (!this.exited && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 100)); if (!this.exited) await this.cancel(); }
  async abortProvider(reason) {
    const child = this.child, providerProcess = this.providerProcess;
    await stopProcessGroup(child).catch(() => {});
    await finishDaemonProcess(this.config, providerProcess, "failed", reason).catch(() => {});
  }
  async finishResource(state = "stopped", reason = "daemon_stopped") { try { await finishDaemonProcess(this.config, this.state.resource_process, state, reason); } catch {} }
}

export async function serveDaemon(stateDir) {
  const paths = locations(stateDir), state = await readState(paths.dir); if (!state?.config) throw new DaemonError("daemon_state_missing", "Antigravity daemon state is missing");
  const runtime = new Runtime(paths, state); await removeSocket(paths); const server = net.createServer(socket => { let buffer = ""; socket.setEncoding("utf8"); socket.on("data", chunk => { buffer += chunk; const index = buffer.indexOf("\n"); if (index < 0) return; let request; try { request = JSON.parse(buffer.slice(0, index)); } catch (error) { socket.end(`${JSON.stringify({ schema_id: RESPONSE_SCHEMA, ok: false, error: errorPayload(error) })}\n`); return; } void durableDaemonDispatch(paths.dir, request, () => dispatch(runtime, request)).then(result => socket.end(`${JSON.stringify({ schema_id: RESPONSE_SCHEMA, id: request.id, ok: true, result })}\n`), error => socket.end(`${JSON.stringify({ schema_id: RESPONSE_SCHEMA, id: request.id, ok: false, error: errorPayload(error) })}\n`)); }); }); runtime.server = server;
  await new Promise((resolve, reject) => { server.once("error", reject); server.listen(paths.socket, resolve); }); await chmod(paths.socket, 0o600);
  try { await runtime.start(); }
  catch (error) {
    await runtime.abortProvider("daemon_start_failed");
    await runtime.persist({ shutdown_state: "failed", startup_error: errorPayload(error), active_tree: false }); await runtime.finishResource("failed", "daemon_start_failed");
    await new Promise(resolve => server.close(resolve));
    throw error;
  }
  await new Promise(resolve => server.once("close", resolve));
}

async function dispatch(runtime, request) {
  if (request.schema_id !== REQUEST_SCHEMA) throw new DaemonError("daemon_protocol_mismatch", "unsupported dd-agy request schema"); const params = request.params ?? {};
  if (request.operation === "daemon.status") return { daemon_id: runtime.config.daemonId, shutdown_state: runtime.state.shutdown_state, active_tree: runtime.state.active_tree, last_activity_at: runtime.lastActivityAt, provider_ready: Boolean(runtime.init && !runtime.exited), pid: process.pid, provider_pid: runtime.child?.pid ?? null, versions: runtime.state.versions, config: runtime.config, sessions: runtime.state.sessions ?? [], receipt: runtime.receipt() };
  if (request.operation === "session.create") { if (params.sessionId) throw new DaemonError("invalid_create", "create does not accept a Session ID"); if (params.prompt) throw new DaemonError("invalid_create", "create does not execute a prompt; use session.prompt"); await runtime.start(); await runtime.zeroUsage(); return runtime.receipt(); }
  if (request.operation === "session.prompt") { if (params.sessionId && params.sessionId !== runtime.init?.conversation_id) throw new DaemonError("session_not_found", "Antigravity Session is not controlled by this daemon"); return await runtime.prompt(params.prompt); }
  if (request.operation === "session.inspect") return runtime.receipt();
  if (request.operation === "session.resume") { await runtime.start(params.sessionId ?? runtime.init?.conversation_id ?? null); return runtime.receipt(); }
  if (request.operation === "session.cancel") return await runtime.cancel();
  if (request.operation === "hook.observe") return await runtime.observeHook(params.event, params.payload ?? {});
  if (request.operation === "daemon.stop") { await runtime.close(params.cancelTree === true); await runtime.persist({ shutdown_state: "clean", active_tree: false }); await runtime.finishResource(); setImmediate(() => runtime.server?.close()); return { stopped: true, daemon_id: runtime.config.daemonId }; }
  throw new DaemonError("unknown_operation", `unknown dd-agy daemon operation: ${request.operation}`);
}
