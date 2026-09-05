import { observedTimeout } from "./observation-clock.mjs";
import { createHash, randomUUID } from "node:crypto";
import { chmod, copyFile, cp, lstat, mkdir, open, readFile, readdir, rename, unlink, writeFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import net from "node:net";
import { durableDaemonDispatch } from "./daemon-operations.mjs";
import { waitForSettlement } from "./session-settlement.mjs";
import os from "node:os";
import path from "node:path";

import { AcpBridge } from "./dd-zcode.mjs";
import { cancelSessionWithBridge, createSessionWithBridge, doctor, forkSessionWithBridge, inspectSessionWithBridge, promptSessionWithBridge } from "./dd-grok.mjs";
import { cleanupFailedStart, confirmDaemonProcess, confirmDaemonStopped, finishDaemonProcess, heartbeatDaemonProcess, registerDaemonProcess, stopProcessGroup } from "./managed-daemon.mjs";

const REQUEST_SCHEMA = "dd-grok/daemon-request@1";
const RESPONSE_SCHEMA = "dd-grok/daemon-response@1";
const STATE_SCHEMA = "dd-grok/daemon-state@1";
class DaemonError extends Error { constructor(code, message, retryable = false, details) { super(message); this.code = code; this.retryable = retryable; this.details = details; } }
function absolute(value, label) { if (!value || !path.isAbsolute(value)) throw new DaemonError("invalid_path", `${label} must be an absolute path`); return path.resolve(value); }
function locations(stateDir) { const dir = absolute(stateDir, "--state-dir"); const localSocket = path.join(dir, "daemon.sock"); return { dir, socket: Buffer.byteLength(localSocket) < 100 ? localSocket : `/tmp/dd-grok-${createHash("sha256").update(dir).digest("hex").slice(0, 24)}.sock`, state: path.join(dir, "daemon.json"), log: path.join(dir, "daemon.log"), home: path.join(dir, "grok-home") }; }
async function readState(dir) { try { return JSON.parse(await readFile(locations(dir).state, "utf8")); } catch (error) { if (error.code === "ENOENT") return null; throw error; } }
async function writeState(file, value) { const temporary = `${file}.${process.pid}.tmp`; await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 }); await rename(temporary, file); }
async function removeSocket(socket, dir) { if (socket !== locations(dir).socket) throw new DaemonError("unsafe_socket", "daemon socket does not match its state directory"); try { const info = await lstat(socket); if (!info.isSocket()) throw new DaemonError("unsafe_socket", "refusing to remove a non-socket daemon path"); await unlink(socket); } catch (error) { if (error.code !== "ENOENT") throw error; } }
function errorPayload(error) { return { code: error.code ?? "operation_failed", message: error.message ?? String(error), retryable: error.retryable === true, ...(error.details === undefined ? {} : { details: error.details }) }; }
function shellQuote(value) { return `'${String(value).replace(/'/g, "'\\''")}'`; }

function executable(command, args = []) { const resolved = command ?? process.env.DD_GROK_BIN ?? "grok"; return /\.[cm]?js$/.test(resolved) ? { command: process.execPath, args: [resolved, ...args] } : { command: resolved, args }; }
function isolatedEnv(config) { return { ...process.env, HOME: config.grokHome, GROK_HOME: config.grokHome, ...(config.ddFlowHome ? { DD_FLOW_HOME: config.ddFlowHome } : {}), ...(config.resourceHome ? { DD_FLOW_RESOURCE_HOME: config.resourceHome } : {}), ...(config.authPath ? { GROK_AUTH_PATH: config.authPath } : {}) }; }
function within(candidate, root) { const resolved = path.resolve(candidate); const parent = path.resolve(root); return resolved === parent || resolved.startsWith(`${parent}${path.sep}`); }

async function writeIsolatedConfig(paths) {
  const disabled = ["skills", "rules", "agents", "mcps", "hooks", "sessions"].map((key) => `${key} = false`).join("\n");
  await writeFile(path.join(paths.home, "config.toml"), `# Managed by dd-grok. Do not add user configuration here.\n[cli]\nauto_update = false\n\n[compat.claude]\n${disabled}\n\n[compat.cursor]\n${disabled}\n\n[compat.codex]\nsessions = false\n`, { mode: 0o600 });
}

async function inspectIsolatedConfig(config) {
  const target = executable(config.bin, ["inspect", "--json"]);
  const raw = await new Promise((resolve, reject) => {
    const child = spawn(target.command, target.args, { cwd: config.cwd, env: isolatedEnv(config), stdio: ["ignore", "pipe", "pipe"] }); let stdout = ""; let stderr = "";
    child.stdout.setEncoding("utf8").on("data", (chunk) => (stdout += chunk)); child.stderr.setEncoding("utf8").on("data", (chunk) => (stderr += chunk));
    child.on("error", reject); child.on("close", (code) => code === 0 ? resolve(stdout) : reject(new DaemonError("grok_inspect_failed", stderr.trim() || `${target.command} exited ${code}`)));
  });
  let report; try { report = JSON.parse(raw); } catch (error) { throw new DaemonError("grok_inspect_invalid", `grok inspect did not return JSON: ${error.message}`); }
  const foreign = [];
  const checkSource = (kind, value, roots) => { const candidate = value?.source?.path ?? value?.path ?? value?.filePath; if (candidate && !roots.some((root) => within(candidate, root))) foreign.push({ kind, path: candidate }); };
  for (const layer of report.configSources?.layers ?? []) checkSource("config", layer, [config.grokHome]);
  for (const hook of report.hooks ?? []) checkSource("hook", hook, [config.grokHome]);
  for (const skill of report.skills ?? []) checkSource("skill", skill, [config.grokHome]);
  for (const agent of report.agents ?? []) checkSource("agent", agent, [config.grokHome]);
  for (const instruction of report.projectInstructions ?? []) checkSource("instruction", instruction, [config.cwd, config.projectRoot]);
  const compatEnabled = (report.externalCompat?.cells ?? []).filter((cell) => ["claude", "cursor", "codex"].includes(cell.vendor) && cell.enabled).map((cell) => `${cell.vendor}.${cell.surface}`);
  const violations = [
    ...(foreign.length ? [{ kind: "foreign_sources", foreign }] : []),
    ...((report.plugins ?? []).length ? [{ kind: "plugins_loaded", count: report.plugins.length }] : []),
    ...((report.mcpServers ?? []).length ? [{ kind: "mcp_loaded", count: report.mcpServers.length }] : []),
    ...((report.permissions?.sources ?? []).length ? [{ kind: "permission_sources", count: report.permissions.sources.length }] : []),
    ...(report.externalCompat?.remoteSettingsLoaded ? [{ kind: "remote_compat" }] : []),
    ...(compatEnabled.length ? [{ kind: "compat_enabled", values: compatEnabled }] : []),
    ...((report.configWarnings ?? []).length ? [{ kind: "config_warnings", warnings: report.configWarnings }] : [])
  ];
  if (violations.length) throw new DaemonError("grok_config_not_isolated", "Grok Build loaded configuration outside the managed isolation boundary", false, { violations });
  return { checked_at: new Date().toISOString(), config_path: path.join(config.grokHome, "config.toml"), hooks: (report.hooks ?? []).length, skills: (report.skills ?? []).length, agents: (report.agents ?? []).length, config_layers: (report.configSources?.layers ?? []).map((layer) => layer.path), compatibility: "disabled" };
}

async function writeHook(paths, config, entryPath) {
  const hookDir = path.join(paths.home, "hooks"); await mkdir(hookDir, { recursive: true, mode: 0o700 });
  const command = [shellQuote(process.execPath), shellQuote(entryPath), "hook", "handle", "--state-dir", shellQuote(paths.dir), "--project-root", shellQuote(config.projectRoot), "--dd-flow-bin", shellQuote(config.ddFlowBin), "--dd-flow-home", shellQuote(config.ddFlowHome)].join(" ");
  const hook = { type: "command", command, timeout: 30 };
  // ACP exposes the native terminal as run_terminal_command; interactive
  // Grok clients still use Bash. Register both rather than assuming one UI.
  await writeFile(path.join(hookDir, "dd-flow.json"), `${JSON.stringify({ hooks: { PreToolUse: ["Bash", "run_terminal_command"].map((matcher) => ({ matcher, hooks: [hook] })) } }, null, 2)}\n`, { mode: 0o600 });
}

async function observeAcpToolCall(config, identity, message) {
  if (!config.ddFlowBin) return;
  const update = message?.params?.update;
  const sessionId = message?.params?.sessionId;
  const command = update?.rawInput?.command ?? update?.rawInput?.cmd;
  if (update?.sessionUpdate !== "tool_call" || !sessionId || typeof command !== "string" || !command.includes("dd-flow")) return;
  const eventId = update?._meta?.eventId ?? `${sessionId}:${update.toolCallId ?? createHash("sha256").update(command).digest("hex")}`;
  const payload = {
    hook_event_name: "PreToolUse",
    tool_name: update?._meta?.["x.ai/tool"]?.name ?? "run_terminal_command",
    tool_input: { command }, session_id: sessionId, event_id: eventId,
    _meta: { ddGrok: identity }
  };
  const target = executable(config.ddFlowBin, ["grok", "event", "handle", "--project-root", config.projectRoot, "--json"]);
  await new Promise((resolve, reject) => {
    const child = spawn(target.command, target.args, { env: { ...process.env, DD_FLOW_HOME: config.ddFlowHome }, stdio: ["pipe", "ignore", "pipe"] }); let stderr = "";
    child.stderr.setEncoding("utf8").on("data", (chunk) => (stderr += chunk)); child.on("error", reject);
    child.on("close", (code) => code === 0 ? resolve() : reject(new DaemonError("grok_hook_failed", stderr || "dd-flow rejected Grok ACP tool event")));
    child.stdin.end(`${JSON.stringify(payload)}\n`);
  });
}

async function copyAuth(paths, source) {
  const target = path.join(paths.home, "auth.json");
  try { await copyFile(source, target); await chmod(target, 0o600); return target; }
  catch (error) { if (error.code === "ENOENT") return null; throw error; }
}

const ARCHIVE_SCHEMA = "dd-grok/session-archive@1";
function sessionDirectory(home, sourceCwd, sessionId) {
  if (!/^[A-Za-z0-9-]+$/.test(String(sessionId))) throw new DaemonError("invalid_session_id", "Grok Build session id is unsafe");
  return path.join(home, "sessions", encodeURIComponent(absolute(sourceCwd, "Grok Build source cwd")), String(sessionId));
}
async function privateTree(root) {
  const info = await lstat(root);
  if (info.isSymbolicLink()) throw new DaemonError("unsafe_session_archive", "session archive must not contain symbolic links");
  if (info.isDirectory()) {
    await chmod(root, 0o700);
    for (const entry of await readdir(root)) await privateTree(path.join(root, entry));
  } else if (info.isFile()) await chmod(root, 0o600);
  else throw new DaemonError("unsafe_session_archive", "session archive contains an unsupported filesystem entry");
}
async function mustNotExist(target, code, message) {
  try { await lstat(target); throw new DaemonError(code, message); }
  catch (error) { if (error.code === "ENOENT") return; throw error; }
}
async function exportSessionArchive(paths, sessionId, sourceCwd, archiveDir, versions) {
  const destination = absolute(archiveDir, "--archive-dir");
  await mustNotExist(destination, "archive_exists", "session archive directory already exists");
  const source = sessionDirectory(paths.home, sourceCwd, sessionId);
  const sourceInfo = await lstat(source);
  if (!sourceInfo.isDirectory()) throw new DaemonError("session_archive_missing", "Grok Build session files are unavailable for export");
  await privateTree(source);
  await mkdir(destination, { recursive: false, mode: 0o700 });
  await cp(source, path.join(destination, "session"), { recursive: true, errorOnExist: true });
  const manifest = { schema_id: ARCHIVE_SCHEMA, provider_session_id: sessionId, source_cwd: sourceCwd, grok_version: versions.grok, exported_at: new Date().toISOString() };
  await writeFile(path.join(destination, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`, { mode: 0o600 });
  await privateTree(destination);
  return { archive_dir: destination, ...manifest };
}
async function readSessionArchiveManifest(archiveDir) {
  const source = absolute(archiveDir, "--session-archive");
  let manifest;
  try { manifest = JSON.parse(await readFile(path.join(source, "manifest.json"), "utf8")); }
  catch (error) { throw new DaemonError("invalid_session_archive", `cannot read session archive manifest: ${error.message}`); }
  if (manifest?.schema_id !== ARCHIVE_SCHEMA || !manifest.provider_session_id || !manifest.source_cwd) throw new DaemonError("invalid_session_archive", "session archive manifest is incompatible");
  return { source, manifest };
}
async function materializeSessionArchive(paths, archiveDir) {
  if (!archiveDir) return null;
  const { source, manifest } = await readSessionArchiveManifest(archiveDir);
  const target = sessionDirectory(paths.home, manifest.source_cwd, manifest.provider_session_id);
  await mustNotExist(target, "session_archive_collision", "managed Grok home already contains this session");
  const archiveSession = path.join(source, "session");
  const sourceInfo = await lstat(archiveSession);
  if (!sourceInfo.isDirectory()) throw new DaemonError("invalid_session_archive", "session archive payload is missing");
  await privateTree(archiveSession);
  await mkdir(path.dirname(target), { recursive: true, mode: 0o700 });
  await cp(archiveSession, target, { recursive: true, errorOnExist: true });
  await privateTree(target);
  return { schema_id: ARCHIVE_SCHEMA, provider_session_id: manifest.provider_session_id, source_cwd: manifest.source_cwd, grok_version: manifest.grok_version ?? null, archive_dir: source };
}

export async function callDaemon(stateDir, operation, params = {}, timeoutMs = 30_000) {
  const { socket } = locations(stateDir); const request = { schema_id: REQUEST_SCHEMA, id: process.env.DD_EVAL_OPERATION_ID ?? randomUUID(), operation, params };
  return await new Promise((resolve, reject) => {
    const client = net.createConnection(socket); let buffer = ""; let settled = false;
    const timer = operation === "session.prompt" ? null : observedTimeout(() => finish(new DaemonError("daemon_timeout", `${operation} timed out`, true)), timeoutMs);
    const finish = (error, value) => { if (settled) return; settled = true; clearTimeout(timer); client.destroy(); error ? reject(error) : resolve(value); };
    client.setEncoding("utf8"); client.on("connect", () => client.write(`${JSON.stringify(request)}\n`)); client.on("data", (chunk) => { buffer += chunk; const newline = buffer.indexOf("\n"); if (newline < 0) return; try { const response = JSON.parse(buffer.slice(0, newline)); if (response.schema_id !== RESPONSE_SCHEMA || response.id !== request.id) return finish(new DaemonError("daemon_protocol_mismatch", "invalid daemon response")); if (!response.ok) return finish(new DaemonError(response.error?.code ?? "operation_failed", response.error?.message ?? "daemon operation failed", response.error?.retryable, response.error?.details)); finish(null, response.result); } catch (error) { finish(new DaemonError("daemon_protocol_mismatch", error.message)); } }); client.on("error", (error) => finish(new DaemonError("daemon_not_running", error.message, true))); client.on("end", () => finish(new DaemonError("daemon_connection_closed", `${operation} connection closed before a response`, true))); client.on("close", () => finish(new DaemonError("daemon_connection_closed", `${operation} connection closed before a response`, true)));
  });
}

function sameConfig(state, config) { return ["cwd", "journal", "bin", "authSource", "model", "reasoning", "mode", "ddFlowBin", "ddFlowHome", "projectRoot", "sessionArchive", "resourceHome", "noFlow"].every((key) => (state.config?.[key] ?? null) === (config[key] ?? null)); }
export async function startDaemon(options) {
  const paths = locations(options.stateDir); const archive = options.sessionArchive ? await readSessionArchiveManifest(options.sessionArchive) : null; const archiveCwd = archive ? absolute(archive.manifest.source_cwd, "Grok Build archive source cwd") : null; const cwd = options.cwd ? absolute(options.cwd, "--cwd") : archiveCwd; if (!cwd) throw new DaemonError("invalid_path", "--cwd must be an absolute path when no session archive is supplied"); if (archiveCwd && cwd !== archiveCwd) throw new DaemonError("session_archive_cwd_mismatch", "Grok Build session archives must start from their recorded source cwd", false, { archive_cwd: archiveCwd, requested_cwd: cwd }); const noFlow = options.noFlow === true; const authSource = options.authPath ? absolute(options.authPath, "--auth-path") : path.join(os.homedir(), ".grok", "auth.json"); const config = { cwd, journal: absolute(options.journal, "--journal"), bin: options.bin ?? process.env.DD_GROK_BIN ?? "grok", authSource, authPath: path.join(paths.home, "auth.json"), model: String(options.model ?? ""), reasoning: String(options.reasoning ?? ""), mode: options.mode ?? "bypassPermissions", ddFlowBin: noFlow ? null : absolute(options.ddFlowBin, "--dd-flow-bin"), ddFlowHome: noFlow ? null : absolute(options.ddFlowHome, "--dd-flow-home"), projectRoot: noFlow ? cwd : absolute(options.projectRoot, "--project-root"), resourceHome: noFlow ? null : (process.env.DD_FLOW_RESOURCE_HOME ? absolute(process.env.DD_FLOW_RESOURCE_HOME, "DD_FLOW_RESOURCE_HOME") : null), env: noFlow ? {} : { DD_FLOW_HOME: absolute(options.ddFlowHome, "--dd-flow-home") }, sessionArchive: archive?.source ?? null, grokHome: paths.home, noFlow };
  if (!config.model || !config.reasoning) throw new DaemonError("profile_required", "--model and --reasoning are required");
  await mkdir(paths.dir, { recursive: true, mode: 0o700 }); await chmod(paths.dir, 0o700);
  try { const status = await callDaemon(paths.dir, "daemon.status", {}, 1000); if (!sameConfig(status, config)) throw new DaemonError("daemon_config_mismatch", "a daemon is already running with different configuration"); return { ...status, already_running: true }; } catch (error) { if (error.code !== "daemon_not_running" && error.code !== "daemon_timeout") throw error; }
  const previous = await readState(paths.dir); if (previous?.shutdown_state === "clean") throw new DaemonError("daemon_state_terminal", "a cleanly stopped execution state directory cannot be reused"); if (previous?.shutdown_state === "running" && previous.active_tree) throw new DaemonError("invalid_harness_crash", "previous daemon died with an active or unproven Session tree", false, { daemon_id: previous.daemon_id });
  await removeSocket(paths.socket, paths.dir); await mkdir(paths.home, { recursive: true, mode: 0o700 }); const importedSession = await materializeSessionArchive(paths, config.sessionArchive); const copiedAuth = await copyAuth(paths, authSource); await writeIsolatedConfig(paths); if (!noFlow) await writeHook(paths, config, absolute(options.entryPath, "dd-grok entry")); const versions = await doctor({ bin: config.bin }); if (importedSession && importedSession.grok_version !== versions.versions.grok) throw new DaemonError("session_archive_version_mismatch", "Grok Build session archive was created by a different CLI version", false, { archive_version: importedSession.grok_version, current_version: versions.versions.grok }); const configIsolation = await inspectIsolatedConfig(config);
  const resourceProcess = await registerDaemonProcess(config, { kind: "grok-daemon", owner: `grok:${path.basename(paths.dir)}`, operation: `grok-daemon:${path.basename(paths.dir)}`, stdout: paths.log, stderr: paths.log });
  const state = { schema_id: STATE_SCHEMA, daemon_id: randomUUID(), pid: null, socket: paths.socket, started_at: new Date().toISOString(), shutdown_state: "starting", active_tree: false, recovery_status: previous?.shutdown_state === "running" ? "recovered_idle" : "clean_start", auth_status: copiedAuth ? "copied" : "absent", ...(importedSession ? { imported_session: importedSession } : {}), versions: versions.versions, config_isolation: configIsolation, config, sessions: importedSession ? [{ provider_session_id: importedSession.provider_session_id, adapter_session_id: importedSession.provider_session_id, parent_provider_session_id: null, root_provider_session_id: importedSession.provider_session_id, cwd: importedSession.source_cwd }] : (previous?.sessions ?? []), resource_process: resourceProcess };
  await writeState(paths.state, state); const log = await open(paths.log, "a", 0o600); const child = spawn(process.execPath, [absolute(options.entryPath, "dd-grok entry"), "daemon", "serve", "--state-dir", paths.dir], { cwd: config.cwd, env: isolatedEnv(config), detached: true, stdio: ["ignore", log.fd, log.fd] }); child.unref(); await log.close();
  try { await confirmDaemonProcess(config, resourceProcess, child); const deadline = Date.now() + 15_000; while (Date.now() < deadline) { await new Promise((resolve) => setTimeout(resolve, 100)); try { return await callDaemon(paths.dir, "daemon.status", {}, 1000); } catch (error) { if (error.code !== "daemon_not_running" && error.code !== "daemon_timeout") throw error; } } throw new DaemonError("daemon_start_failed", "daemon did not become ready", true); }
  catch (error) { await cleanupFailedStart(config, resourceProcess, child, error); throw error; }
}
export async function stopDaemon(options) { const timeoutMs = options.timeoutMs ?? 30_000; return await confirmDaemonStopped(() => callDaemon(options.stateDir, "daemon.stop", { cancelTree: options.cancelTree === true }, timeoutMs), locations(options.stateDir).socket, timeoutMs); }

export class Runtime {
  constructor(paths, state, bridge, initialized) { this.paths = paths; this.state = state; this.bridge = bridge; this.initialized = initialized; this.sessions = new Map((state.sessions ?? []).map((item) => [item.provider_session_id, item])); this.descendants = new Map(); this.toolUsage = new Map(); this.loadedSessionId = null; this.active = null; this.server = null; this.persisting = Promise.resolve(); }
  persist(patch = {}) { Object.assign(this.state, patch, { pid: process.pid, updated_at: new Date().toISOString(), sessions: [...this.sessions.values()] }); this.persisting = this.persisting.then(() => writeState(this.paths.state, this.state)); if (this.state.resource_process) this.persisting = this.persisting.then(() => heartbeatDaemonProcess(this.state.config, this.state.resource_process).catch(() => {})); return this.persisting; }
  options(params) { const sessionId = params.sessionId; const session = sessionId ? this.sessions.get(sessionId) : null; const root = session?.root_provider_session_id ?? sessionId; return { ...this.state.config, ...params, cwd: params.cwd ?? session?.cwd ?? this.state.config.cwd, initialized: this.initialized, daemonId: this.state.daemon_id, rootProviderSessionId: root, toolUsage: this.toolUsage, allowBackground: true, liveSession: params.liveSession ?? Boolean(sessionId && sessionId === this.loadedSessionId) }; }
  track(result) { if (!result?.provider_session_id) return; const session = this.sessions.get(result.provider_session_id); const root = result.parent_provider_session_id ? (this.sessions.get(result.parent_provider_session_id)?.root_provider_session_id ?? result.parent_provider_session_id) : (session?.root_provider_session_id ?? result.provider_session_id); this.sessions.set(result.provider_session_id, { provider_session_id: result.provider_session_id, adapter_session_id: result.adapter_session_id ?? result.provider_session_id, parent_provider_session_id: result.parent_provider_session_id ?? session?.parent_provider_session_id ?? null, root_provider_session_id: root, cwd: result.cwd ?? result.target?.newCwd ?? result.info?.cwd ?? session?.cwd ?? null }); for (const child of this.running(result)) this.recordDescendant(child, root, "x.ai/subagent/list_running", "running"); for (const child of result.descendants ?? []) this.recordDescendant(child, root, child.source ?? "x.ai/subagent/event", child.status ?? "unknown"); }
  recordDescendant(value, root, source, fallback) { const id = value?.provider_session_id ?? value?.session_id ?? value?.sessionId ?? value?.childSessionId ?? value?.subagentId; const parent = value?.parent_provider_session_id ?? value?.parentSessionId ?? root; if (typeof id !== "string" || !id || typeof parent !== "string" || !parent) return; const prior = this.descendants.get(id); this.descendants.set(id, { provider_session_id: id, parent_provider_session_id: parent, status: value?.status ?? value?.state ?? (fallback === "unknown" ? prior?.status ?? fallback : fallback), source }); }
  observeSubagentEvent(message) {
    const root = message?.params?.sessionId, update = message?.params?.update;
    const kind = String(update?.sessionUpdate ?? update?.type ?? message?.method ?? "");
    if (!root) return;
    if (/subagent/i.test(kind)) {
      for (const value of [update?.subagent, update?.subagentInfo, update?.child, update?.result, update]) this.recordDescendant(value, root, "x.ai/subagent/event", /fail|error/i.test(kind) ? "failed" : /cancel/i.test(kind) ? "cancelled" : /complete|finish|done/i.test(kind) ? "completed" : "running");
    }
    // list_running omits completed children. Retain native tool receipts, never
    // extract identities from the model's prose or from arbitrary shell output.
    this.subagentCalls ??= new Map();
    const key = `${root}:${update?.toolCallId}`;
    const tool = update?._meta?.["x.ai/tool"]?.name ?? (kind === "tool_call" ? update.title : null);
    if (tool) this.subagentCalls.set(key, tool);
    const name = this.subagentCalls.get(key), output = update?.rawOutput;
    if (kind !== "tool_call_update" || update.status !== "completed") return;
    if (name === "spawn_subagent" && output?.type === "Text") {
      const id = /^subagent_id:\s*(\S+)\s*$/m.exec(output.text ?? "")?.[1];
      if (id) this.recordDescendant({ session_id: id }, root, "x.ai/tool/spawn_subagent", "running");
    }
    if (name === "get_command_or_subagent_output" && output?.type === "TaskOutput") {
      const result = output.Result;
      if (this.descendants.has(result?.task_id)) this.recordDescendant({ session_id: result.task_id, status: result.status }, root, "x.ai/tool/TaskOutput", "unknown");
    }
  }
  topology(root) { return [...this.descendants.values()].filter((child) => child.parent_provider_session_id === root); }
  observeToolCall(message) { const sessionId = message?.params?.sessionId; const update = message?.params?.update; const id = update?.toolCallId; if (!sessionId || !id) return; this.toolEvents ??= new Map(); const events = this.toolEvents.get(sessionId) ?? { calls: new Map(), failed: new Set() }; if (update.sessionUpdate === "tool_call") events.calls.set(id, update?._meta?.["x.ai/tool"]?.name ?? update?._meta?.claudeCode?.toolName ?? update.title?.split(":", 1)[0] ?? "unknown"); if (update.sessionUpdate === "tool_call_update" && ["failed", "error"].includes(update.status)) events.failed.add(id); this.toolEvents.set(sessionId, events); const by_tool = {}; for (const name of events.calls.values()) by_tool[name] = (by_tool[name] ?? 0) + 1; this.toolUsage.set(sessionId, { total: events.calls.size, failures: events.failed.size, by_tool }); }
  running(result) { return result?.evidence?.subagents?.subagents ?? result?.subagents?.subagents ?? []; }
  async refreshTree(cancel = false) {
    const running = [];
    for (const session of [...this.sessions.values()].filter(item => !item.parent_provider_session_id)) {
      const id = session.provider_session_id;
      let observed = await inspectSessionWithBridge(this.bridge, this.options({ sessionId: id, liveSession: true }));
      this.track(observed);
      const rootActive = Boolean(this.active);
      if (cancel && (rootActive || this.running(observed).length)) {
        await cancelSessionWithBridge(this.bridge, this.options({ sessionId: id, liveSession: true }));
        observed = await inspectSessionWithBridge(this.bridge, this.options({ sessionId: id, liveSession: true }));
        this.track(observed);
      }
      if (this.active || this.running(observed).length) running.push(id);
    }
    await this.persist({ active_tree: running.length > 0 || Boolean(this.active) });
    return running;
  }
  async requireSettled() { const running = await this.refreshTree(); if (running.length) throw new DaemonError("tree_not_settled", "daemon still owns a running Session tree", false, { sessions: running }); }
  async productive(name, task) { if (this.active) throw new DaemonError("operation_busy", `${this.active} is already running`, true); this.active = name; await this.persist({ active_tree: true, active_operation: name }); try { const result = await task(); this.track(result); await this.persist({ active_tree: this.running(result).length > 0, active_operation: null }); return { ...result, descendants: this.topology(result.provider_session_id) }; } catch (error) { await this.persist({ active_tree: true, active_operation: null }); throw error; } finally { this.active = null; } }
  async dispatch(operation, params) {
    if (operation === "daemon.status") { if (!this.active) await this.refreshTree(); return { daemon_id: this.state.daemon_id, pid: process.pid, socket: this.paths.socket, versions: this.state.versions, config_isolation: this.state.config_isolation, shutdown_state: this.state.shutdown_state, recovery_status: this.state.recovery_status, auth_status: this.state.auth_status, active_tree: this.state.active_tree, active_operation: this.active, sessions: [...this.sessions.values()], config: this.state.config }; }
    if (operation === "hook.resolve") { const sessionId = String(params.sessionId ?? ""); if (!sessionId) throw new DaemonError("hook_identity_missing", "hook has no sessionId"); let session = this.sessions.get(sessionId); if (!session) { const roots = [...this.sessions.values()].filter((item) => !item.parent_provider_session_id); if (roots.length !== 1) throw new DaemonError("hook_identity_unknown", "unknown hook Session has no unique root"); session = { provider_session_id: sessionId, adapter_session_id: sessionId, parent_provider_session_id: roots[0].provider_session_id, root_provider_session_id: roots[0].provider_session_id }; this.sessions.set(sessionId, session); await this.persist(); await inspectSessionWithBridge(this.bridge, this.options({ sessionId, liveSession: true })); } return { daemonId: this.state.daemon_id, rootProviderSessionId: session.root_provider_session_id, parentProviderSessionId: session.parent_provider_session_id ?? null, observedProfile: { provider: "xai", model: this.state.config.model, reasoning: this.state.config.reasoning, mode: this.state.config.mode } }; }
    if (operation === "session.create") return await this.productive(operation, async () => { const result = await createSessionWithBridge(this.bridge, { ...this.options(params), onSessionCreated: async (session) => { this.track(session); this.loadedSessionId = session.provider_session_id; await this.persist(); } }, this.initialized); this.loadedSessionId = result.provider_session_id; return result; });
    if (operation === "session.prompt") { await this.requireSettled(); return await this.productive(operation, async () => { const result = await promptSessionWithBridge(this.bridge, this.options(params)); this.loadedSessionId = params.sessionId; return result; }); }
    if (operation === "session.fork") { await this.requireSettled(); return await this.productive(operation, async () => { const result = await forkSessionWithBridge(this.bridge, this.options(params)); this.loadedSessionId = params.sessionId; return result; }); }
    if (operation === "session.inspect") { const result = await inspectSessionWithBridge(this.bridge, this.options({ ...params, liveSession: true })); this.track(result); await this.persist(); return { ...result, descendants: this.topology(result.provider_session_id) }; }
    if (operation === "session.cancel") { const result = await cancelSessionWithBridge(this.bridge, this.options({ ...params, liveSession: true })); await this.persist({ active_tree: Boolean(this.active) || !result.settled }); return result; }
    if (operation === "session.archive") { await this.requireSettled(); return await this.productive(operation, async () => { let session = this.sessions.get(params.sessionId); if (!session?.cwd) { const result = await inspectSessionWithBridge(this.bridge, this.options({ ...params, liveSession: true })); this.track(result); session = this.sessions.get(result.provider_session_id); } return await exportSessionArchive(this.paths, session.provider_session_id, absolute(session.cwd, "Grok Build session cwd"), params.archiveDir, this.state.versions); }); }
    if (operation === "daemon.stop") {
      await waitForSettlement({
        observe: async () => ({ sessions: await this.refreshTree(), active: Boolean(this.active), active_operation: this.active }),
        ...(params.cancelTree ? { cancel: id => cancelSessionWithBridge(this.bridge, this.options({ sessionId: id, liveSession: true })) } : {})
      });
      await this.persist({ active_tree: false, shutdown_state: "stopping" });
      return { daemon_id: this.state.daemon_id, stopped: true, clean: true, _shutdown: true };
    }
    throw new DaemonError("unknown_operation", `unknown daemon operation: ${operation}`);
  }
  async shutdown() { await this.bridge.close(); await finishDaemonProcess(this.state.config, this.state.resource_process); await this.persist({ shutdown_state: "clean", stopped_at: new Date().toISOString() }); await new Promise((resolve) => this.server.close(resolve)); await removeSocket(this.paths.socket, this.paths.dir); }
}

export async function serveDaemon(stateDir) {
  const paths = locations(stateDir); const state = await readState(paths.dir); if (!state || state.schema_id !== STATE_SCHEMA) throw new DaemonError("daemon_state_missing", "daemon state is missing or incompatible"); let runtime;
  const bridge = new AcpBridge({ ...state.config, commandArgs: ["agent", "--no-leader", "--always-approve", "--model", state.config.model, "--reasoning-effort", state.config.reasoning, "stdio"], env: isolatedEnv(state.config), clientInfo: { name: "dd-grok", version: "0.1.0" }, permission: "allow", onNotification: async (message) => {
    const sessionId = message?.params?.sessionId;
    if (!runtime || !sessionId) return;
    runtime.observeToolCall(message); runtime.observeSubagentEvent(message);
    const session = runtime.sessions.get(sessionId);
    const rootProviderSessionId = session?.root_provider_session_id ?? sessionId;
    await observeAcpToolCall(state.config, { daemonId: state.daemon_id, rootProviderSessionId, parentProviderSessionId: session?.parent_provider_session_id ?? null, observedProfile: { provider: "xai", model: state.config.model, reasoning: state.config.reasoning, mode: state.config.mode } }, message);
  } }); const initialized = await bridge.start(); runtime = new Runtime(paths, state, bridge, initialized);
  await removeSocket(paths.socket, paths.dir); const server = net.createServer((connection) => { connection.setEncoding("utf8"); let buffer = ""; connection.on("data", (chunk) => { buffer += chunk; const newline = buffer.indexOf("\n"); if (newline < 0) return; const line = buffer.slice(0, newline); buffer = buffer.slice(newline + 1); void (async () => { let request; try { request = JSON.parse(line); if (request.schema_id !== REQUEST_SCHEMA || !request.id || !request.operation) throw new DaemonError("daemon_protocol_mismatch", "invalid daemon request"); const result = await durableDaemonDispatch(paths.dir, request, () => runtime.dispatch(request.operation, request.params ?? {})); connection.end(`${JSON.stringify({ schema_id: RESPONSE_SCHEMA, id: request.id, ok: true, result: { ...result, _shutdown: undefined } })}\n`); if (result?._shutdown) setImmediate(() => void runtime.shutdown().then(() => process.exit(0)).catch(error => runtime.persist({ shutdown_state: "cleanup_failed", cleanup_error: errorPayload(error) }))); } catch (error) { connection.end(`${JSON.stringify({ schema_id: RESPONSE_SCHEMA, id: request?.id ?? null, ok: false, error: errorPayload(error) })}\n`); } })(); }); }); runtime.server = server; await new Promise((resolve, reject) => { server.once("error", reject); server.listen(paths.socket, resolve); }); await chmod(paths.socket, 0o600); await runtime.persist({ shutdown_state: "running", active_tree: false }); return await new Promise(() => {});
}
