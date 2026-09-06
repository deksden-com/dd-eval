import { createHash, randomUUID } from "node:crypto";
import { appendFile, chmod, copyFile, mkdir, readFile, readdir, realpath, unlink, writeFile } from "node:fs/promises";
import { spawn, execFile } from "node:child_process";
import { promisify } from "node:util";
import os from "node:os";
import path from "node:path";
import { ObservationClock, observedTimeout } from "./observation-clock.mjs";
import { writeJsonAtomic } from "./runner-events.mjs";
import { errorRecord } from "./operation-errors.mjs";
import { confirmDaemonProcess, finishDaemonProcess, heartbeatDaemonProcess, registerDaemonProcess, stopProcessGroup } from "./managed-daemon.mjs";

const run = promisify(execFile);
export const DROID_CONTRACT = "dd-droid-harness@1";
export const DROID_PROTOCOL = "1.201.0";
export class DroidError extends Error {
  constructor(code, message, details) { super(message); this.code = code; if (details) this.details = details; }
}
export const absolute = (value, label) => { if (!value || !path.isAbsolute(value)) throw new DroidError("invalid_path", `${label} must be absolute`); return path.resolve(value); };
export const executable = (bin, args = []) => /\.[cm]?js$/.test(bin) ? { command: process.execPath, args: [bin, ...args] } : { command: bin, args };
const shell = value => `'${String(value).replaceAll("'", `'"'"'`)}'`;
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
export async function readJson(file) { try { return JSON.parse(await readFile(file, "utf8")); } catch (error) { if (error.code === "ENOENT") return null; throw error; } }
export function droidPaths(stateDir) {
  const dir = absolute(stateDir, "state directory"), digest = createHash("sha256").update(dir).digest("hex").slice(0, 24);
  const local = path.join(dir, "daemon.sock");
  return { dir, socket: Buffer.byteLength(local) < 100 ? local : `/tmp/dd-droid-${digest}.sock`, state: path.join(dir, "daemon.json"), log: path.join(dir, "daemon.log"), home: path.join(dir, "home"), factory: path.join(dir, "home", ".factory"), bindings: path.join(dir, "native-operations") };
}
export function droidEnvironment(config) {
  const env = { ...process.env, FACTORY_HOME_OVERRIDE: config.home, FACTORY_DROID_AUTO_UPDATE_ENABLED: "false", ...(config.ddFlowHome ? { DD_FLOW_HOME: config.ddFlowHome, DD_FLOW_BIN: config.ddFlowBin } : {}) };
  // This adapter deliberately uses the operator's existing Factory login.
  for (const key of Object.keys(env)) if (key.endsWith("API_KEY")) delete env[key];
  return env;
}
export async function prepareDroidHome(config) {
  const paths = droidPaths(config.stateDir);
  for (const dir of [paths.dir, paths.home, paths.factory, paths.bindings, path.join(paths.factory, "droids")]) { await mkdir(dir, { recursive: true, mode: 0o700 }); await chmod(dir, 0o700); }
  const auth = path.join(config.authHome ?? os.homedir(), ".factory");
  for (const name of ["auth.encrypted", "auth.v2.key", "auth.v2.file", "auth.json"]) {
    try { await copyFile(path.join(auth, name), path.join(paths.factory, name)); await chmod(path.join(paths.factory, name), 0o600); }
    catch (error) { if (error.code !== "ENOENT") throw error; }
  }
  await writeJsonAtomic(path.join(paths.factory, "settings.json"), { cloudSessionSync: false, enabledPlugins: {}, enableHooks: true, hooksDisabled: false, enableCustomDroids: true, ideAutoConnect: false, subagentAutonomyLevel: "inherit" });
  const command = `${shell(process.execPath)} ${shell(config.entryPath)} hook handle --state-dir ${shell(paths.dir)}`;
  const hooks = Object.fromEntries(["SessionStart", "PreToolUse", "PostToolUse", "Stop", "SessionEnd", "SubagentStop"].map(event => [event, [{ matcher: ["PreToolUse", "PostToolUse"].includes(event) ? "Execute" : "*", hooks: [{ type: "command", command, timeout: 30 }] }]]));
  await writeJsonAtomic(path.join(paths.factory, "hooks.json"), hooks);
  const worker = `---\nname: dd-flow-worker\ndescription: Execute one explicit dd-flow Work packet or a technical capacity marker\nmodel: ${config.model}\nreasoningEffort: ${config.reasoning}\nmcpServers: []\n---\nFor a Work assignment, your first technical action is the exact standalone work start command supplied by the coordinator. Follow its returned packet, invoke the exact finish or fail command, then stop. Do not create children or take another Work. For a technical capacity marker, only return the requested marker; do not read the project or call dd-flow.\n`;
  await writeFile(path.join(paths.factory, "droids", "dd-flow-worker.md"), worker, { mode: 0o600 });
  return { hooks_sha256: createHash("sha256").update(JSON.stringify(hooks)).digest("hex"), worker_sha256: createHash("sha256").update(worker).digest("hex") };
}
export async function removeDroidAuth(config) {
  for (const name of ["auth.encrypted", "auth.v2.key", "auth.v2.file", "auth.json"]) await unlink(path.join(config.home, ".factory", name)).catch(error => { if (error.code !== "ENOENT") throw error; });
}
export async function droidVersion(bin) { const target = executable(bin, ["--version"]); return (await run(target.command, target.args, { timeout: 10_000 })).stdout.trim(); }

/** The qualified OpenAI profile reports uncached input separately from caches;
 * output already includes thinking. Keep native counters alongside normalization. */
export function physicalUsage(value) {
  if (!value || !["inputTokens", "outputTokens", "cacheReadTokens", "cacheCreationTokens", "thinkingTokens"].every(key => Number.isFinite(value[key]) && value[key] >= 0)) return null;
  const input = value.inputTokens + value.cacheReadTokens + value.cacheCreationTokens;
  return { totalTokens: input + value.outputTokens, inputTokens: input, uncachedInputTokens: value.inputTokens, cacheReadTokens: value.cacheReadTokens, cacheCreationTokens: value.cacheCreationTokens, outputTokens: value.outputTokens, reasoningTokens: value.thinkingTokens, native: value };
}
export function parseDroidTranscript(text, settings, expectedId) {
  const records = []; let complete = true;
  for (const line of text.split("\n")) { if (!line.trim()) continue; try { records.push(JSON.parse(line)); } catch { complete = false; } }
  const header = records.find(record => record.type === "session_start");
  if (!header || header.id !== expectedId) throw new DroidError("session_identity_mismatch", "Droid transcript has a different or missing native Session ID", { expected_session_id: expectedId, observed_session_id: header?.id ?? null });
  const calls = new Map(), failures = new Set();
  for (const record of records) for (const block of record.message?.content ?? []) {
    if (block.type === "tool_use" && typeof block.id === "string") calls.set(block.id, block.name);
    if (block.type === "tool_result" && block.is_error && typeof block.tool_use_id === "string") failures.add(block.tool_use_id);
  }
  const byTool = {}; for (const name of calls.values()) byTool[name] = (byTool[name] ?? 0) + 1;
  return { header, records, outcomes: records.filter(record => record.type === "agent_turn_outcome"), usage: physicalUsage(settings?.tokenUsage), settings, complete, tool_calls: { total: calls.size, failures: [...failures].filter(id => calls.has(id)).length, by_tool: byTool } };
}
async function nativeFiles(directory) {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true }).catch(error => { if (error.code === "ENOENT") return []; throw error; })) {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await nativeFiles(file));
    else if (entry.isFile() && entry.name.endsWith(".jsonl")) files.push(file);
  }
  return files;
}
export async function readDroidSession(factory, id) {
  for (const file of await nativeFiles(path.join(factory, "sessions"))) {
    if (path.basename(file) !== `${id}.jsonl`) continue;
    const text = await readFile(file, "utf8"); let settings = null, complete = true;
    try { settings = await readJson(file.replace(/\.jsonl$/, ".settings.json")); } catch (error) { if (!(error instanceof SyntaxError)) throw error; complete = false; }
    const parsed = parseDroidTranscript(text, settings, id);
    return { ...parsed, complete: parsed.complete && complete, transcript_path: file, source_sha256: createHash("sha256").update(text).digest("hex") };
  }
  return null;
}
const terminal = value => ["completed", "cancelled", "failed", "process_exit", "error"].includes(value);
const status = value => value === "completed" ? "completed" : ["cancelled", "process_exit"].includes(value) ? "cancelled" : ["failed", "error"].includes(value) ? "failed" : "unknown";

/** Inspect OS descendants without using process names as ownership. A start-time
 * identity prevents a later unrelated process with a recycled PID being killed. */
export async function processSnapshot() {
  const { stdout } = await run("ps", ["-axo", "pid=,ppid=,pgid=,lstart=,stat="], { timeout: 5_000 });
  return stdout.trim().split("\n").flatMap(line => { const parts = line.trim().split(/\s+/); return parts.length >= 9 ? [{ pid: Number(parts[0]), ppid: Number(parts[1]), pgid: Number(parts[2]), started: parts.slice(3, 8).join(" "), zombie: parts[8].startsWith("Z") }] : []; });
}
function descendants(rows, rootPid) { const ids = new Set([rootPid]); for (;;) { const size = ids.size; for (const row of rows) if (ids.has(row.ppid)) ids.add(row.pid); if (size === ids.size) return rows.filter(row => ids.has(row.pid)); } }

export class DroidRuntime {
  constructor(config, state, persist) {
    this.config = config; this.state = state; this.paths = droidPaths(config.stateDir); this.persist = persist; this.pending = new Map(); this.active = null; this.child = null; this.closed = true; this.loaded = false; this.ownedProcesses = state.owned_processes ?? []; this.closing = false; this.workingState = "idle"; this.protocol = null; this.rootId = state.root_session_id ?? null; this.topology = new Map(state.descendants?.map(child => [child.provider_session_id, child]) ?? []); this.draining = Promise.resolve(); this.journalling = Promise.resolve(); this.activity = 0; this.providerProcess = null; this.cancelled = false; this.lastResult = state.last_result ?? null;
  }
  async journal(kind, payload) { const line = JSON.stringify({ schema_id: "dd-droid/event@1", observed_at: new Date().toISOString(), kind, ...payload }); this.journalling = this.journalling.then(() => appendFile(this.config.journal, `${line}\n`, { mode: 0o600 })); return await this.journalling; }
  async save(patch = {}) { return await this.persist({ root_session_id: this.rootId, descendants: [...this.topology.values()], working_state: this.workingState, last_activity: this.activity, ...patch }); }
  async start() {
    if (this.child && !this.closed) return;
    this.closed = false; this.loaded = false; this.closing = false; this.protocol = null; this.buffer = "";
    const args = ["exec", "--input-format", "stream-jsonrpc", "--output-format", "stream-jsonrpc"];
    const target = executable(this.config.bin, args);
    this.providerProcess = await registerDaemonProcess(this.config, { kind: "droid-provider", owner: `droid:${this.config.daemonId}`, operation: `droid-provider:${randomUUID()}`, stdout: this.paths.log, stderr: this.paths.log });
    this.child = spawn(target.command, target.args, { cwd: this.config.cwd, env: droidEnvironment(this.config), detached: true, stdio: ["pipe", "pipe", "pipe"] });
    this.child.stdout.setEncoding("utf8").on("data", chunk => { this.buffer += chunk; let at; while ((at = this.buffer.indexOf("\n")) >= 0) { const line = this.buffer.slice(0, at); this.buffer = this.buffer.slice(at + 1); this.draining = this.draining.then(async () => { if (!line.trim()) return; await this.event(JSON.parse(line)); }).catch(error => this.rejectPending(error)); } });
    this.child.stderr.setEncoding("utf8").on("data", chunk => { void this.journal("stderr", { text: chunk.slice(0, 4000) }).catch(() => {}); });
    this.child.on("error", error => this.rejectPending(error));
    this.child.on("close", (code, signal) => { this.closed = true; void this.draining.finally(() => { const error = new DroidError("operation_observation_lost", "Droid process exited before a confirmed reply", { code, signal }); this.rejectPending(error); }); });
    await this.captureProcesses(); await confirmDaemonProcess(this.config, this.providerProcess, this.child); await heartbeatDaemonProcess(this.config, this.providerProcess); await this.save({ provider_pid: this.child.pid, provider_process: this.providerProcess });
    clearInterval(this.processObserver);
    this.processObserver = setInterval(() => { if (!this.processObservation) this.processObservation = this.captureProcesses().catch(error => { this.ownershipError = error; }).finally(() => { this.processObservation = null; }); }, 1_000);
    this.processObserver.unref();
    const models = await this.request("droid.list_models", {});
    if (this.protocol !== DROID_PROTOCOL) throw new DroidError("droid_protocol_mismatch", "Unqualified Factory protocol", { expected: DROID_PROTOCOL, observed: this.protocol });
    this.models = models.models ?? [];
  }
  rejectPending(error) { for (const pending of this.pending.values()) { clearTimeout(pending.timer); pending.reject(error); } this.pending.clear(); if (this.active && !this.closing) this.active.reject(error); }
  async event(event) {
    await this.journal("native", { event });
    if (event.type === "response") {
      this.protocol ??= event.factoryProtocolVersion;
      const pending = this.pending.get(event.id); if (!pending) return;
      this.pending.delete(event.id); clearTimeout(pending.timer);
      event.error ? pending.reject(new DroidError("droid_rpc_error", event.error.message ?? "Droid rejected request", event.error)) : pending.resolve(event.result ?? {}); return;
    }
    if (event.method === "droid.request_permission" || event.method === "droid.ask_user") {
      const result = event.method === "droid.request_permission" ? { selectedOption: "cancel" } : { cancelled: true, answers: [] };
      this.child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", type: "response", factoryApiVersion: "1.0.0", factoryProtocolVersion: DROID_PROTOCOL, id: event.id, result })}\n`);
      await this.journal("unexpected_input_rejected", { method: event.method }); return;
    }
    if (event.method !== "droid.session_notification") return;
    const { sessionId, notification: n } = event.params ?? {}; if (!n) return;
    const fingerprint = createHash("sha256").update(JSON.stringify(event.params)).digest("hex");
    if (fingerprint !== this.lastEvent) { this.activity += 1; this.lastEvent = fingerprint; }
    if (sessionId && this.rootId && sessionId !== this.rootId && !this.topology.has(sessionId)) throw new DroidError("session_identity_mismatch", "Unrelated native Session notification");
    if (n.type === "droid_working_state_changed" && (!sessionId || sessionId === this.rootId)) this.workingState = n.newState;
    if (n.type === "child_session_available") {
      if (!this.rootId || sessionId !== this.rootId || !n.childSessionId || !n.toolUseId) throw new DroidError("droid_child_identity_invalid", "Native child event lacks physical parent or tool identity");
      this.topology.set(n.childSessionId, { provider_session_id: n.childSessionId, parent_provider_session_id: sessionId, tool_use_id: n.toolUseId, status: "running", source: "droid.child_session_available" }); await this.save();
    }
    const current = this.active;
    if (n.type === "create_message" && n.requestId === current?.requestId) {
      if (n.message?.id !== current.turnId) throw new DroidError("droid_turn_identity_mismatch", "Droid did not preserve the requested message ID");
      current.accepted = true; await this.saveBinding(current, { accepted: true });
    }
    if (n.type === "assistant_text_delta" && current) current.text += n.textDelta ?? "";
    if (n.type === "agent_turn_completed" && current && n.turnId === current.turnId && (!sessionId || sessionId === this.rootId)) {
      current.outcome = n; this.lastResult = n; await this.saveBinding(current, { native_outcome: n, assistant_text: current.text }); current.resolve(n);
    }
  }
  request(method, params, id = randomUUID(), timeoutMs = 30_000) {
    if (!this.child || this.closed) return Promise.reject(new DroidError("operation_observation_lost", "Droid runtime is not connected"));
    return new Promise((resolve, reject) => {
      const timer = observedTimeout(() => { this.pending.delete(id); reject(new DroidError("rpc_timeout", `${method} has no observed reply`, { request_id: id })); }, timeoutMs);
      this.pending.set(id, { resolve, reject, timer });
      this.child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", type: "request", factoryApiVersion: "1.0.0", factoryProtocolVersion: DROID_PROTOCOL, id, method, params })}\n`, error => { if (error) { clearTimeout(timer); this.pending.delete(id); reject(error); } });
    });
  }
  profile(settings) {
    const result = { provider: this.config.provider, model: settings?.modelId ?? settings?.model, reasoning: settings?.reasoningEffort, mode: settings?.autonomyMode ?? (settings?.autonomyLevel ? `auto-${settings.autonomyLevel}` : null) };
    for (const key of ["model", "reasoning", "mode"]) if (result[key] !== this.config[key]) throw new DroidError("profile_drift", `Droid ${key} does not match the profile`, { requested: this.config[key], observed: result[key] ?? null });
    return result;
  }
  async saveBinding(binding, patch = {}) { Object.assign(binding.saved, patch); await writeJsonAtomic(path.join(this.paths.bindings, `${createHash("sha256").update(binding.operationId).digest("hex")}.json`), binding.saved); }
  async create(operationId) {
    if (this.rootId) throw new DroidError("session_already_created", "This execution daemon already owns a root Session");
    await this.start(); const sessionId = randomUUID(); this.rootId = sessionId; const requestId = randomUUID();
    const binding = { operationId, saved: { operation: "session.create", provider_session_id: sessionId, request_id: requestId } }; await this.saveBinding(binding);
    const result = await this.request("droid.initialize_session", { machineId: "dd-eval", cwd: this.config.cwd, sessionId, modelId: this.config.model, reasoningEffort: this.config.reasoning, interactionMode: "auto", autonomyLevel: "high", autoRejectPermissionRequests: true, disableBuiltinSkills: true, disabledToolIds: ["AskUser"], mcpServers: [], systemPrompt: { type: "preset", preset: "droid", append: "For native delegation use Task with subagent_type dd-flow-worker, without a complexity override. Use the same worker for technical capacity markers and productive Work. Follow the supplied dd-flow packet; user clarification belongs to dd-flow stage pause, not native AskUser. Never use Missions." } }, requestId);
    if (result.sessionId !== sessionId) throw new DroidError("session_identity_mismatch", "Droid initialized a different Session");
    this.rootId = result.sessionId; this.loaded = true; this.observedProfile = this.profile(result.settings); this.workingState = "idle"; await this.save();
    return await this.inspect(sessionId);
  }
  requireIdentity(id) { if (!id || id !== this.rootId) throw new DroidError("session_identity_mismatch", "Requested root Session is not owned by this daemon", { requested: id ?? null, observed: this.rootId }); }
  async resume(id) {
    this.requireIdentity(id); if (this.state.cleanup?.forced) throw new DroidError("invalid_harness_crash", "Forced teardown is unclean; same-ID resume is not qualified for this execution"); if (this.closed && (await this.captureProcesses()).length) throw new DroidError("tree_not_settled", "Previous provider still owns processes; cancel the tree before resume"); if (!this.closed && this.loaded) return await this.inspect(id);
    await this.start(); const result = await this.request("droid.load_session", { sessionId: id, loadAllMessages: false, autoRejectPermissionRequests: true, disableBuiltinSkills: true, disabledToolIds: ["AskUser"], mcpServers: [] });
    const source = await readDroidSession(this.paths.factory, id); if (!source || path.resolve(source.header.cwd) !== this.config.cwd) throw new DroidError("session_identity_mismatch", "Resumed Session does not match its controlled workspace");
    this.loaded = true; this.observedProfile = this.profile(result.settings); this.workingState = result.workingState ?? (result.isAgentLoopInProgress ? "unknown" : "idle"); this.cancelled = false; await this.save(); return await this.inspect(id);
  }
  async prompt(id, prompt, operationId) {
    this.requireIdentity(id); if (!prompt) throw new DroidError("prompt_required", "prompt is required"); if (this.active) throw new DroidError("operation_busy", "Another Droid operation is active");
    if (this.closed || !this.loaded) await this.resume(id);
    if (this.ownershipError) throw new DroidError("process_ownership_unknown", "Owned process observation failed", { error: errorRecord(this.ownershipError) });
    const before = await this.inspect(id); if (!before.settled) throw new DroidError("tree_not_settled", "Prior Droid tree has not settled");
    let resolve, reject; const completed = new Promise((a, b) => { resolve = a; reject = b; }); void completed.catch(() => {});
    const requestId = randomUUID(), turnId = randomUUID();
    const current = { operationId, requestId, turnId, resolve, reject, text: "", saved: { operation: "session.prompt", provider_session_id: id, request_id: requestId, turn_id: turnId, accepted: false } };
    this.active = current; this.cancelled = false; await this.saveBinding(current); await this.save({ active_tree: true });
    const clock = new ObservationClock({ timeoutMs: this.config.inactivityMs ?? 600_000, onGap: gap => { void this.journal("observation_gap", { gap }).catch(() => {}); } });
    let checkingTerminal = false;
    const timer = setInterval(() => {
      if (!clock.sample(this.activity) || checkingTerminal) return;
      checkingTerminal = true;
      void this.recoverOperation(operationId).then(() => {
        if (!current.outcome) reject(new DroidError("subject_liveness_timeout", "Droid emitted no native progress within its inactivity window"));
      }).catch(error => reject(new DroidError("operation_observation_lost", "Cannot reconcile native outcome before declaring inactivity", { error: errorRecord(error) })));
    }, 1_000);
    try {
      await this.request("droid.add_user_message", { text: prompt, messageId: turnId }, requestId);
      const outcome = await completed; await this.draining;
      const receipt = await this.inspect(id, { ignoreActive: true });
      return { ...receipt, result: { ...outcome, status: status(outcome.reason) }, assistant_text: current.text, turn_id: turnId };
    } catch (error) {
      await this.journal("prompt_error", { operation_id: operationId, error: errorRecord(error) }); throw error;
    } finally { clearInterval(timer); if (this.active === current) this.active = null; await this.save({ active_tree: this.workingState !== "idle" }); }
  }
  async recoverOperation(operationId) {
    const binding = await readJson(path.join(this.paths.bindings, `${createHash("sha256").update(operationId).digest("hex")}.json`));
    if (!binding || binding.operation !== "session.prompt") return null;
    this.requireIdentity(binding.provider_session_id);
    const native = await readDroidSession(this.paths.factory, binding.provider_session_id);
    const outcome = native?.outcomes.find(item => item.turnId === binding.turn_id);
    if (!outcome || !terminal(outcome.reason)) return null;
    const receipt = await this.inspect(binding.provider_session_id, { ignoreActive: true });
    if (!receipt.settled) return null;
    if (this.active?.operationId === operationId && this.active.turnId === binding.turn_id) {
      this.active.outcome = outcome; this.lastResult = outcome;
      await this.saveBinding(this.active, { native_outcome: outcome });
      this.active.resolve(outcome);
      // Let the original dispatch persist its one terminal reply and release
      // daemon busy. The next inspection reads that receipt; do not race it
      // with a second writer or expose success while prompt still owns busy.
      return null;
    }
    return { ...receipt, result: { ...outcome, status: status(outcome.reason) }, assistant_text: binding.assistant_text ?? "", turn_id: binding.turn_id, recovered_from: "native.agent_turn_outcome" };
  }
  async refreshTopology() {
    let catalog;
    try { catalog = await readJson(path.join(this.paths.factory, "task-invocations.json")); }
    catch (error) { if (!(error instanceof SyntaxError)) throw error; this.topologyIncomplete = true; return [...this.topology.values()]; }
    this.topologyIncomplete = false;
    const invocations = catalog?.invocations ?? [];
    const root = this.rootId ? await readDroidSession(this.paths.factory, this.rootId) : null;
    const rootTools = new Map((root?.records ?? []).flatMap(record => record.message?.content ?? []).filter(block => block.type === "tool_use").map(block => [block.id, block]));
    const groups = new Map();
    for (const task of invocations) {
      if (task.parentSessionId !== this.rootId || !task.childSessionId || !task.parentToolUseId) continue;
      const tasks = groups.get(task.childSessionId) ?? []; tasks.push(task); groups.set(task.childSessionId, tasks);
    }
    for (const [id, tasks] of groups) {
      const native = await readDroidSession(this.paths.factory, id);
      if (!native || !native.settings) { this.topologyIncomplete = true; continue; }
      if (native.header.callingSessionId !== this.rootId) throw new DroidError("droid_child_identity_invalid", "Task invocation disagrees with physical child parent");
      const creationTool = native.header.callingToolUseId;
      for (const task of tasks) {
        if (task.parentToolUseId === creationTool) continue;
        const tool = rootTools.get(task.parentToolUseId);
        if (tool?.name !== "Task" || tool.input?.resume !== id) throw new DroidError("droid_child_identity_invalid", "Repeated child invocation has no matching native Task resume evidence");
      }
      this.profile(native.settings);
      const prior = this.topology.get(id);
      // Task resume adds a Turn to the same physical child, not another
      // Session. Its transcript retains the original creation edge. Work
      // reassignment is checked by dd-flow's physical Session binding.
      const ordered = tasks.toSorted((a, b) => (a.createdAt ?? 0) - (b.createdAt ?? 0));
      const latest = ordered.at(-1); const running = tasks.some(task => !terminal(task.status));
      const closed = running && prior?.source === "adapter.tree_closed";
      this.topology.set(id, { provider_session_id: id, parent_provider_session_id: this.rootId, tool_use_id: creationTool, latest_tool_use_id: latest.parentToolUseId, task_id: latest.taskInvocationId, task_invocation_ids: ordered.map(task => task.taskInvocationId), status: closed ? prior.status : running ? "running" : status(latest.status), source: closed ? prior.source : "droid.task_invocations", transcript_path: native.transcript_path });
    }
    return [...this.topology.values()];
  }
  async snapshotUsage(id) {
    const native = await readDroidSession(this.paths.factory, id); if (!native) return { status: "unavailable", provider_session_id: id };
    const measured = native.usage;
    const payload = { provider_session_id: id, daemon_id: this.config.daemonId, observed_at: new Date().toISOString(), usage_scope: "physical_session", completeness: native.complete && measured ? "complete" : "partial", usage: measured, tool_calls: native.tool_calls, source: { path: native.transcript_path, sha256: native.source_sha256 } };
    if (measured && this.config.ddFlowBin) await this.flow("usage", "ingest", payload);
    return { status: measured ? "measured" : "unavailable", ...payload };
  }
  async flow(family, command, payload) {
    const target = executable(this.config.ddFlowBin, ["droid", family, command, "--project-root", this.config.projectRoot, "--json"]);
    return await new Promise((resolve, reject) => {
      const child = spawn(target.command, target.args, { cwd: this.config.cwd, env: droidEnvironment(this.config), stdio: ["pipe", "pipe", "pipe"] }); let stdout = "", stderr = "";
      const timer = observedTimeout(() => { child.kill("SIGTERM"); reject(new DroidError("droid_flow_timeout", "dd-flow did not acknowledge Droid evidence")); }, 25_000);
      child.stdout.setEncoding("utf8").on("data", chunk => stdout += chunk); child.stderr.setEncoding("utf8").on("data", chunk => stderr += chunk);
      child.on("error", error => { clearTimeout(timer); reject(error); }); child.on("close", code => { clearTimeout(timer); if (code !== 0) return reject(new DroidError("droid_flow_rejected", stderr || "dd-flow rejected Droid evidence")); try { resolve(JSON.parse(stdout)); } catch (error) { reject(error); } }); child.stdin.end(`${JSON.stringify(payload)}\n`);
    });
  }
  async inspect(id, { ignoreActive = false } = {}) {
    this.requireIdentity(id); await this.captureProcesses(); const children = await this.refreshTopology(); const source = await readDroidSession(this.paths.factory, id);
    const usage = []; for (const sessionId of [id, ...children.map(child => child.provider_session_id)]) usage.push(await this.snapshotUsage(sessionId));
    const settled = !this.topologyIncomplete && (!this.active || ignoreActive) && (this.closed || this.workingState === "idle") && children.every(child => terminal(child.status));
    return { harness: "droid-cli", runtime_family: "droid", session: { harness_id: "droid-cli", session_id: id }, provider_session_id: id, adapter_session_id: id, cwd: this.config.cwd, observed_profile: source?.settings ? this.profile(source.settings) : this.observedProfile, observed_runtime: { droid: this.config.version, factory_protocol: this.protocol ?? DROID_PROTOCOL, dd_harness_contract: DROID_CONTRACT }, status: settled ? "idle" : "running", settled, descendants: children, transcript_path: source?.transcript_path ?? null, usage, result: this.lastResult, provider_pid: this.closed ? null : this.child?.pid ?? null };
  }
  async observeHook(payload, eventId) {
    const id = payload.session_id, event = payload.hook_event_name;
    if (!id || !event || !eventId) throw new DroidError("droid_hook_invalid", "Hook lacks native identity or event ID");
    // Hooks can precede the root initialize response or the child notification.
    const deadline = Date.now() + 3_000; let native;
    do { native = await readDroidSession(this.paths.factory, id); if (native) break; await sleep(25); } while (Date.now() < deadline);
    if (!native || path.resolve(native.header.cwd) !== this.config.cwd || path.resolve(payload.cwd) !== this.config.cwd || await realpath(payload.transcript_path) !== await realpath(native.transcript_path)) throw new DroidError("droid_hook_identity_invalid", "Hook is outside its controlled native Session/workspace");
    const parent = native.header.callingSessionId ?? null;
    if (parent && parent !== this.rootId) throw new DroidError("droid_hook_identity_invalid", "Hook child belongs to another root");
    if (!parent && this.rootId && id !== this.rootId) throw new DroidError("droid_hook_identity_invalid", "Hook came from an unrelated root");
    if (parent && !terminal(this.topology.get(id)?.status)) this.topology.set(id, { ...(this.topology.get(id) ?? {}), provider_session_id: id, parent_provider_session_id: parent, tool_use_id: native.header.callingToolUseId, status: "running", source: "droid.session_start" });
    this.activity += 1; await this.journal("hook", { event_id: eventId, event, session_id: id, parent_session_id: parent }); await this.save();
    if (!this.config.ddFlowBin || !["PreToolUse", "PostToolUse"].includes(event)) return {};
    const profile = this.profile(native.settings); await this.snapshotUsage(id);
    return await this.flow("event", "handle", { schema_id: "dd-flow/droid-tool-event@1", phase: event === "PreToolUse" ? "before" : "after", event_id: eventId, daemon_id: this.config.daemonId, session: { provider_session_id: id, parent_provider_session_id: parent, directory: this.config.cwd }, tool: payload.tool_name, input: payload.tool_input, profile, transcript_path: native.transcript_path, outcome: { status: payload.tool_response?.is_error ? "error" : "completed" } });
  }
  async captureProcesses() {
    const rows = await processSnapshot();
    const roots = this.ownedProcesses.filter(old => rows.some(row => row.pid === old.pid && row.started === old.started));
    if (this.child && !this.closed) roots.push({ pid: this.child.pid });
    for (const root of roots) for (const row of descendants(rows, root.pid)) if (!this.ownedProcesses.some(old => old.pid === row.pid && old.started === row.started)) this.ownedProcesses.push(row);
    await this.save({ owned_processes: this.ownedProcesses });
    return rows.filter(row => !row.zombie && this.ownedProcesses.some(old => old.pid === row.pid && old.started === row.started));
  }
  async closeTree(cancel = false) {
    await this.captureProcesses();
    this.closing = true; this.cancelled = cancel;
    if (cancel && !this.closed) { try { await this.request("droid.interrupt_session", {}, randomUUID(), 5_000); } catch (error) { await this.journal("interrupt_unobserved", { error: errorRecord(error) }); } }
    let forced = this.state.cleanup?.forced === true;
    try { if (!this.closed && this.rootId) await this.request("droid.close_session", { reason: "other" }, randomUUID(), 10_000); else if (!this.closed) this.child.stdin.end(); } catch (error) { await this.journal("close_unobserved", { error: errorRecord(error) }); }
    const alive = () => this.captureProcesses();
    const deadline = Date.now() + 8_000; while ((!this.closed || (await alive()).length) && Date.now() < deadline) await sleep(100);
    if (!this.closed || (await alive()).length) {
      forced = true; if (!this.closed) await stopProcessGroup(this.child, 2_000).catch(error => this.journal("group_stop_unconfirmed", { error: errorRecord(error) }));
      // Execute can own a separate process group. Kill only still-matching
      // observed descendants; never use a process-name search or broad pkill.
      for (const row of await alive()) { try { process.kill(row.pid, "SIGTERM"); } catch (error) { if (error.code !== "ESRCH") throw error; } }
      await sleep(1_000);
      for (const row of await alive()) { try { process.kill(row.pid, "SIGKILL"); } catch (error) { if (error.code !== "ESRCH") throw error; } }
      await sleep(200);
    }
    const survivors = await alive(); if (!this.closed || survivors.length) throw new DroidError("tree_not_settled", "Droid cleanup did not settle its owned process tree", { survivors });
    clearInterval(this.processObserver); await this.processObservation;
    await this.draining; this.workingState = "idle";
    if (this.active && !this.active.outcome) this.active.reject(new DroidError(cancel ? "operation_cancelled" : "operation_observation_lost", "Droid runtime closed before a native terminal reply"));
    await finishDaemonProcess(this.config, this.providerProcess, forced ? "failed" : "stopped", forced ? "forced_tree_shutdown" : "native_tree_closed");
    let topologyError = null;
    try { await this.refreshTopology(); }
    catch (error) { topologyError = errorRecord(error); await this.journal("closed_tree_topology_error", { error: topologyError }); }
    for (const [id, child] of this.topology) if (!terminal(child.status)) this.topology.set(id, { ...child, status: "cancelled", source: "adapter.tree_closed", native_status: child.status });
    const cleanup = { settled: true, forced, observed_processes: this.ownedProcesses.length, ...(topologyError ? { topology_error: topologyError } : {}) };
    await this.save({ active_tree: false, cleanup });
    return cleanup;
  }
}
