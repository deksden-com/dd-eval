import { createHash, randomUUID } from "node:crypto";
import { chmod, copyFile, lstat, mkdir, open, readFile, rename, unlink, writeFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import net from "node:net";
import os from "node:os";
import path from "node:path";

import { AcpBridge } from "./dd-zcode.mjs";
import { cancelSessionWithBridge, createSessionWithBridge, doctor, forkSessionWithBridge, inspectSessionWithBridge, promptSessionWithBridge } from "./dd-grok.mjs";

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
function isolatedEnv(config) { return { ...process.env, HOME: config.grokHome, GROK_HOME: config.grokHome, ...(config.authPath ? { GROK_AUTH_PATH: config.authPath } : {}) }; }
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
  await writeFile(path.join(hookDir, "dd-flow.json"), `${JSON.stringify({ hooks: { PreToolUse: [{ matcher: "Bash", hooks: [{ type: "command", command, timeout: 30 }] }] } }, null, 2)}\n`, { mode: 0o600 });
}

async function copyAuth(paths, source) {
  const target = path.join(paths.home, "auth.json");
  try { await copyFile(source, target); await chmod(target, 0o600); return target; }
  catch (error) { if (error.code === "ENOENT") return null; throw error; }
}

export async function callDaemon(stateDir, operation, params = {}, timeoutMs = 30_000) {
  const { socket } = locations(stateDir); const request = { schema_id: REQUEST_SCHEMA, id: randomUUID(), operation, params };
  return await new Promise((resolve, reject) => {
    const client = net.createConnection(socket); let buffer = ""; let settled = false;
    const timer = setTimeout(() => finish(new DaemonError("daemon_timeout", `${operation} timed out`, true)), timeoutMs);
    const finish = (error, value) => { if (settled) return; settled = true; clearTimeout(timer); client.destroy(); error ? reject(error) : resolve(value); };
    client.setEncoding("utf8"); client.on("connect", () => client.write(`${JSON.stringify(request)}\n`)); client.on("data", (chunk) => { buffer += chunk; const newline = buffer.indexOf("\n"); if (newline < 0) return; try { const response = JSON.parse(buffer.slice(0, newline)); if (response.schema_id !== RESPONSE_SCHEMA || response.id !== request.id) return finish(new DaemonError("daemon_protocol_mismatch", "invalid daemon response")); if (!response.ok) return finish(new DaemonError(response.error?.code ?? "operation_failed", response.error?.message ?? "daemon operation failed", response.error?.retryable, response.error?.details)); finish(null, response.result); } catch (error) { finish(new DaemonError("daemon_protocol_mismatch", error.message)); } }); client.on("error", (error) => finish(new DaemonError("daemon_not_running", error.message, true)));
  });
}

function sameConfig(state, config) { return ["cwd", "journal", "bin", "authSource", "model", "reasoning", "mode", "ddFlowBin", "ddFlowHome", "projectRoot"].every((key) => (state.config?.[key] ?? null) === (config[key] ?? null)); }
export async function startDaemon(options) {
  const paths = locations(options.stateDir); const authSource = options.authPath ? absolute(options.authPath, "--auth-path") : path.join(os.homedir(), ".grok", "auth.json"); const config = { cwd: absolute(options.cwd, "--cwd"), journal: absolute(options.journal, "--journal"), bin: options.bin ?? null, authSource, authPath: path.join(paths.home, "auth.json"), model: String(options.model ?? ""), reasoning: String(options.reasoning ?? ""), mode: options.mode ?? "bypassPermissions", ddFlowBin: absolute(options.ddFlowBin, "--dd-flow-bin"), ddFlowHome: absolute(options.ddFlowHome, "--dd-flow-home"), projectRoot: absolute(options.projectRoot, "--project-root"), grokHome: paths.home };
  if (!config.model || !config.reasoning) throw new DaemonError("profile_required", "--model and --reasoning are required");
  await mkdir(paths.dir, { recursive: true, mode: 0o700 }); await chmod(paths.dir, 0o700);
  try { const status = await callDaemon(paths.dir, "daemon.status", {}, 1000); if (!sameConfig(status, config)) throw new DaemonError("daemon_config_mismatch", "a daemon is already running with different configuration"); return { ...status, already_running: true }; } catch (error) { if (error.code !== "daemon_not_running" && error.code !== "daemon_timeout") throw error; }
  const previous = await readState(paths.dir); if (previous?.shutdown_state === "clean") throw new DaemonError("daemon_state_terminal", "a cleanly stopped execution state directory cannot be reused"); if (previous?.shutdown_state === "running" && previous.active_tree) throw new DaemonError("invalid_harness_crash", "previous daemon died with an active or unproven Session tree", false, { daemon_id: previous.daemon_id });
  await removeSocket(paths.socket, paths.dir); await mkdir(paths.home, { recursive: true, mode: 0o700 }); const copiedAuth = await copyAuth(paths, authSource); await writeIsolatedConfig(paths); await writeHook(paths, config, absolute(options.entryPath, "dd-grok entry")); const versions = await doctor({ bin: config.bin }); const configIsolation = await inspectIsolatedConfig(config);
  const state = { schema_id: STATE_SCHEMA, daemon_id: randomUUID(), pid: null, socket: paths.socket, started_at: new Date().toISOString(), shutdown_state: "starting", active_tree: false, recovery_status: previous?.shutdown_state === "running" ? "recovered_idle" : "clean_start", auth_status: copiedAuth ? "copied" : "absent", versions: versions.versions, config_isolation: configIsolation, config, sessions: previous?.sessions ?? [] };
  await writeState(paths.state, state); const log = await open(paths.log, "a", 0o600); const child = spawn(process.execPath, [absolute(options.entryPath, "dd-grok entry"), "daemon", "serve", "--state-dir", paths.dir], { cwd: config.cwd, env: isolatedEnv(config), detached: true, stdio: ["ignore", log.fd, log.fd] }); child.unref(); await log.close();
  const deadline = Date.now() + 15_000; while (Date.now() < deadline) { await new Promise((resolve) => setTimeout(resolve, 100)); try { return await callDaemon(paths.dir, "daemon.status", {}, 1000); } catch (error) { if (error.code !== "daemon_not_running" && error.code !== "daemon_timeout") throw error; } } throw new DaemonError("daemon_start_failed", "daemon did not become ready", true);
}
export async function stopDaemon(options) { return await callDaemon(options.stateDir, "daemon.stop", { cancelTree: options.cancelTree === true }, options.timeoutMs ?? 30_000); }

class Runtime {
  constructor(paths, state, bridge, initialized) { this.paths = paths; this.state = state; this.bridge = bridge; this.initialized = initialized; this.sessions = new Map((state.sessions ?? []).map((item) => [item.provider_session_id, item])); this.toolUsage = new Map(); this.loadedSessionId = null; this.active = null; this.server = null; this.persisting = Promise.resolve(); }
  persist(patch = {}) { Object.assign(this.state, patch, { pid: process.pid, updated_at: new Date().toISOString(), sessions: [...this.sessions.values()] }); this.persisting = this.persisting.then(() => writeState(this.paths.state, this.state)); return this.persisting; }
  options(params) { const sessionId = params.sessionId; const root = sessionId ? (this.sessions.get(sessionId)?.root_provider_session_id ?? sessionId) : undefined; return { ...this.state.config, ...params, initialized: this.initialized, daemonId: this.state.daemon_id, rootProviderSessionId: root, toolUsage: this.toolUsage, allowBackground: true, liveSession: Boolean(sessionId && sessionId === this.loadedSessionId) }; }
  track(result) { if (!result?.provider_session_id) return; this.sessions.set(result.provider_session_id, { provider_session_id: result.provider_session_id, adapter_session_id: result.adapter_session_id ?? result.provider_session_id, parent_provider_session_id: result.parent_provider_session_id ?? null, root_provider_session_id: result.parent_provider_session_id ? (this.sessions.get(result.parent_provider_session_id)?.root_provider_session_id ?? result.parent_provider_session_id) : result.provider_session_id }); }
  async productive(name, task) { if (this.active) throw new DaemonError("operation_busy", `${this.active} is already running`, true); this.active = name; await this.persist({ active_tree: true, active_operation: name }); try { const result = await task(); this.track(result); await this.persist({ active_tree: false, active_operation: null }); return result; } catch (error) { await this.persist({ active_operation: null }); throw error; } finally { this.active = null; } }
  async dispatch(operation, params) {
    if (operation === "daemon.status") return { daemon_id: this.state.daemon_id, pid: process.pid, socket: this.paths.socket, versions: this.state.versions, config_isolation: this.state.config_isolation, shutdown_state: this.state.shutdown_state, recovery_status: this.state.recovery_status, auth_status: this.state.auth_status, active_tree: this.state.active_tree, active_operation: this.active, sessions: [...this.sessions.values()], config: this.state.config };
    if (operation === "hook.resolve") { const sessionId = String(params.sessionId ?? ""); if (!sessionId) throw new DaemonError("hook_identity_missing", "hook has no sessionId"); let session = this.sessions.get(sessionId); if (!session) { const roots = [...this.sessions.values()].filter((item) => !item.parent_provider_session_id); if (roots.length !== 1) throw new DaemonError("hook_identity_unknown", "unknown hook Session has no unique root"); session = { provider_session_id: sessionId, adapter_session_id: sessionId, parent_provider_session_id: roots[0].provider_session_id, root_provider_session_id: roots[0].provider_session_id }; this.sessions.set(sessionId, session); await this.persist(); } return { daemonId: this.state.daemon_id, rootProviderSessionId: session.root_provider_session_id, parentProviderSessionId: session.parent_provider_session_id ?? null, observedProfile: { provider: "xai", model: this.state.config.model, reasoning: this.state.config.reasoning, mode: this.state.config.mode } }; }
    if (operation === "session.create") return await this.productive(operation, async () => { const result = await createSessionWithBridge(this.bridge, this.options(params), this.initialized); this.loadedSessionId = result.provider_session_id; return result; });
    if (operation === "session.prompt") return await this.productive(operation, async () => { const result = await promptSessionWithBridge(this.bridge, this.options(params)); this.loadedSessionId = params.sessionId; return result; });
    if (operation === "session.fork") return await this.productive(operation, async () => { const result = await forkSessionWithBridge(this.bridge, this.options(params)); this.loadedSessionId = params.sessionId; return result; });
    if (operation === "session.inspect") { const result = await inspectSessionWithBridge(this.bridge, this.options(params)); this.loadedSessionId = params.sessionId; this.track(result); await this.persist(); return result; }
    if (operation === "session.cancel") { const result = await cancelSessionWithBridge(this.bridge, this.options(params)); this.loadedSessionId = params.sessionId; await this.persist({ active_tree: false }); return result; }
    if (operation === "daemon.stop") { if (this.active) throw new DaemonError("tree_not_settled", "productive operation is still running"); if (!params.cancelTree && this.state.active_tree) throw new DaemonError("tree_not_settled", "daemon still owns a running Session tree"); await this.persist({ active_tree: false, shutdown_state: "stopping" }); return { daemon_id: this.state.daemon_id, stopped: true, clean: true, _shutdown: true }; }
    throw new DaemonError("unknown_operation", `unknown daemon operation: ${operation}`);
  }
  async shutdown() { await this.bridge.close(); await this.persist({ shutdown_state: "clean", stopped_at: new Date().toISOString() }); await new Promise((resolve) => this.server.close(resolve)); await removeSocket(this.paths.socket, this.paths.dir); }
}

export async function serveDaemon(stateDir) {
  const paths = locations(stateDir); const state = await readState(paths.dir); if (!state || state.schema_id !== STATE_SCHEMA) throw new DaemonError("daemon_state_missing", "daemon state is missing or incompatible"); const bridge = new AcpBridge({ ...state.config, commandArgs: ["agent", "--no-leader", "--always-approve", "--model", state.config.model, "--reasoning-effort", state.config.reasoning, "stdio"], env: isolatedEnv(state.config), clientInfo: { name: "dd-grok", version: "0.1.0" }, permission: "allow" }); const initialized = await bridge.start(); const runtime = new Runtime(paths, state, bridge, initialized);
  await removeSocket(paths.socket, paths.dir); const server = net.createServer((connection) => { connection.setEncoding("utf8"); let buffer = ""; connection.on("data", (chunk) => { buffer += chunk; const newline = buffer.indexOf("\n"); if (newline < 0) return; const line = buffer.slice(0, newline); buffer = buffer.slice(newline + 1); void (async () => { let request; try { request = JSON.parse(line); if (request.schema_id !== REQUEST_SCHEMA || !request.id || !request.operation) throw new DaemonError("daemon_protocol_mismatch", "invalid daemon request"); const result = await runtime.dispatch(request.operation, request.params ?? {}); connection.end(`${JSON.stringify({ schema_id: RESPONSE_SCHEMA, id: request.id, ok: true, result: { ...result, _shutdown: undefined } })}\n`); if (result?._shutdown) setImmediate(() => void runtime.shutdown().then(() => process.exit(0))); } catch (error) { connection.end(`${JSON.stringify({ schema_id: RESPONSE_SCHEMA, id: request?.id ?? null, ok: false, error: errorPayload(error) })}\n`); } })(); }); }); runtime.server = server; await new Promise((resolve, reject) => { server.once("error", reject); server.listen(paths.socket, resolve); }); await chmod(paths.socket, 0o600); await runtime.persist({ shutdown_state: "running", active_tree: false }); return await new Promise(() => {});
}
