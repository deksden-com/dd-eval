import { createHash, randomUUID } from "node:crypto";
import { chmod, lstat, mkdir, open, readFile, rename, unlink, writeFile } from "node:fs/promises";
import net from "node:net";
import path from "node:path";
import { spawn } from "node:child_process";
import { CodexBridge, cancelSessionWithBridge, createSessionWithBridge, inspectSessionWithBridge, promptSessionWithBridge, startSessionWithBridge } from "./dd-codex.mjs";
import { confirmDaemonProcess, confirmDaemonStopped, finishDaemonProcess, heartbeatDaemonProcess, registerDaemonProcess, stopProcessGroup } from "./managed-daemon.mjs";

const requestSchema = "dd-codex/daemon-request@1";
const responseSchema = "dd-codex/daemon-response@1";
const stateSchema = "dd-codex/daemon-state@1";
const absolute = (value, label) => { if (!value || !path.isAbsolute(value)) throw Object.assign(new Error(`${label} must be an absolute path`), { code: "invalid_path" }); return path.resolve(value); };
function locations(stateDir) { const dir = absolute(stateDir, "--state-dir"); const local = path.join(dir, "daemon.sock"); return { dir, socket: Buffer.byteLength(local) < 100 ? local : `/tmp/dd-codex-${createHash("sha256").update(dir).digest("hex").slice(0, 24)}.sock`, state: path.join(dir, "daemon.json"), log: path.join(dir, "daemon.log") }; }
async function readState(file) { try { return JSON.parse(await readFile(file, "utf8")); } catch (error) { if (error.code === "ENOENT") return null; throw error; } }
async function writeState(file, value) { const temp = `${file}.${process.pid}.tmp`; await writeFile(temp, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 }); await rename(temp, file); }
async function removeSocket(socket) { try { const info = await lstat(socket); if (!info.isSocket()) throw Object.assign(new Error("refusing to remove non-socket daemon path"), { code: "unsafe_socket" }); await unlink(socket); } catch (error) { if (error.code !== "ENOENT") throw error; } }
const errorPayload = (error) => ({ code: error.code ?? "operation_failed", message: error.message ?? String(error), retryable: error.retryable === true });

export async function callDaemon(stateDir, operation, params = {}, timeoutMs = 30_000) {
  const target = locations(stateDir); const request = { schema_id: requestSchema, id: randomUUID(), operation, params };
  return await new Promise((resolve, reject) => {
    const client = net.createConnection(target.socket); let buffer = ""; let settled = false; const timer = setTimeout(() => finish(Object.assign(new Error(`${operation} timed out`), { code: "daemon_timeout", retryable: true })), timeoutMs);
    const finish = (error, value) => { if (settled) return; settled = true; clearTimeout(timer); client.destroy(); error ? reject(error) : resolve(value); };
    client.setEncoding("utf8"); client.on("connect", () => client.write(`${JSON.stringify(request)}\n`)); client.on("error", (error) => finish(Object.assign(error, { code: "daemon_not_running", retryable: true })));
    client.on("end", () => finish(Object.assign(new Error("daemon closed the request without a response"), { code: "daemon_connection_closed", retryable: true })));
    client.on("close", () => finish(Object.assign(new Error("daemon connection closed without a response"), { code: "daemon_connection_closed", retryable: true })));
    client.on("data", (chunk) => { buffer += chunk; const at = buffer.indexOf("\n"); if (at < 0) return; try { const response = JSON.parse(buffer.slice(0, at)); if (response.schema_id !== responseSchema || response.id !== request.id) throw new Error("invalid daemon response"); response.ok ? finish(null, response.result) : finish(Object.assign(new Error(response.error?.message ?? "daemon error"), response.error)); } catch (error) { finish(Object.assign(error, { code: "daemon_protocol" })); } });
  });
}

export async function startDaemon(options) {
  const paths = locations(options.stateDir); const cwd = absolute(options.cwd, "--cwd"); const config = { cwd, journal: absolute(options.journal, "--journal"), bin: options.bin ?? null, ddFlowBin: options.ddFlowBin ? absolute(options.ddFlowBin, "--dd-flow-bin") : null, ddFlowHome: options.ddFlowHome ? absolute(options.ddFlowHome, "--dd-flow-home") : null, projectRoot: options.projectRoot ? absolute(options.projectRoot, "--project-root") : cwd, resourceHome: process.env.DD_FLOW_RESOURCE_HOME ? absolute(process.env.DD_FLOW_RESOURCE_HOME, "DD_FLOW_RESOURCE_HOME") : null, env: options.ddFlowHome ? { DD_FLOW_HOME: absolute(options.ddFlowHome, "--dd-flow-home") } : {} };
  await mkdir(paths.dir, { recursive: true, mode: 0o700 }); await chmod(paths.dir, 0o700);
  try { const status = await callDaemon(paths.dir, "daemon.status", {}, 1_000); if (JSON.stringify(status.config) !== JSON.stringify(config)) throw Object.assign(new Error("running daemon has a different configuration"), { code: "daemon_config_mismatch" }); return { ...status, already_running: true }; } catch (error) { if (!["daemon_not_running", "daemon_timeout"].includes(error.code)) throw error; }
  const previous = await readState(paths.state); if (previous?.shutdown_state === "running") throw Object.assign(new Error("previous dd-codex daemon died; do not reuse its state directory"), { code: "invalid_harness_crash" });
  await removeSocket(paths.socket); const resourceProcess = await registerDaemonProcess(config, { kind: "codex-daemon", owner: `codex:${path.basename(paths.dir)}`, operation: `codex-daemon:${path.basename(paths.dir)}`, stdout: paths.log, stderr: paths.log }); const state = { schema_id: stateSchema, daemon_id: randomUUID(), pid: null, cwd: config.cwd, journal: config.journal, config, socket: paths.socket, started_at: new Date().toISOString(), shutdown_state: "starting", sessions: [], resource_process: resourceProcess }; await writeState(paths.state, state);
  const log = await open(paths.log, "a", 0o600); const child = spawn(process.execPath, [options.entryPath, "daemon", "serve", "--state-dir", paths.dir], { cwd: config.cwd, detached: true, stdio: ["ignore", log.fd, log.fd] }); child.unref(); await log.close();
  try { await confirmDaemonProcess(config, resourceProcess, child); const deadline = Date.now() + 15_000; while (Date.now() < deadline) { await new Promise((resolve) => setTimeout(resolve, 100)); try { return await callDaemon(paths.dir, "daemon.status", {}, 1_000); } catch (error) { if (!["daemon_not_running", "daemon_timeout"].includes(error.code)) throw error; } } throw Object.assign(new Error("daemon did not become ready"), { code: "daemon_start_failed" }); }
  catch (error) { await stopProcessGroup(child).catch(() => {}); await finishDaemonProcess(config, resourceProcess, "failed", error.code === "daemon_start_failed" ? "daemon_start_timeout" : "daemon_start_error").catch(() => {}); throw error; }
}
export async function stopDaemon(options) { const timeoutMs = options.timeoutMs ?? 30_000; return await confirmDaemonStopped(() => callDaemon(options.stateDir, "daemon.stop", { cancelTree: options.cancelTree === true }, timeoutMs), locations(options.stateDir).socket, timeoutMs); }

export async function serveDaemon(stateDir) {
  const paths = locations(stateDir); const state = await readState(paths.state); if (!state || state.schema_id !== stateSchema) throw Object.assign(new Error("daemon state missing"), { code: "daemon_state_missing" });
  const bridge = new CodexBridge(state.config); await bridge.start(); const sessions = new Set(state.sessions ?? []); let active = null; let server; let persist = Promise.resolve();
  const save = (patch = {}) => { Object.assign(state, patch, { pid: process.pid, updated_at: new Date().toISOString(), sessions: [...sessions] }); persist = persist.then(() => writeState(paths.state, state)).then(() => heartbeatDaemonProcess(state.config, state.resource_process).catch(() => {})); return persist; };
  const dispatch = async (operation, params) => {
    if (operation === "daemon.status") return { daemon_id: state.daemon_id, pid: process.pid, cwd: state.cwd, journal: state.journal, config: state.config, sessions: [...sessions], active_operation: active, shutdown_state: state.shutdown_state };
    // The runner may need to retire an orphaned daemon after its caller was
    // interrupted. `daemon.stop` is the one control operation that remains
    // available while a request is marked active; callers must first prove the
    // provider Session itself is idle.
    if (operation === "daemon.stop") return { stopped: true, _shutdown: true };
    if (active && !["session.inspect", "session.cancel"].includes(operation)) throw Object.assign(new Error(`${active} is in progress`), { code: "operation_busy", retryable: true });
    if (operation === "session.create") { active = operation; await save({ active_operation: active }); try { const result = await createSessionWithBridge(bridge, { ...state.config, ...params }); sessions.add(result.provider_session_id); return result; } finally { active = null; await save({ active_operation: null }); } }
    if (operation === "session.prompt") { active = operation; await save({ active_operation: active }); try { return await promptSessionWithBridge(bridge, { ...state.config, ...params }); } finally { active = null; await save({ active_operation: null }); } }
    if (operation === "session.start") { active = operation; await save({ active_operation: active }); try { return await startSessionWithBridge(bridge, { ...state.config, ...params }); } finally { active = null; await save({ active_operation: null }); } }
    if (operation === "session.inspect") return await inspectSessionWithBridge(bridge, { ...state.config, ...params });
    if (operation === "session.cancel") return await cancelSessionWithBridge(bridge, { ...state.config, ...params });
    throw Object.assign(new Error(`unknown operation: ${operation}`), { code: "unknown_operation" });
  };
  await removeSocket(paths.socket); server = net.createServer((connection) => { connection.setEncoding("utf8"); let buffer = ""; connection.on("data", (chunk) => { buffer += chunk; const at = buffer.indexOf("\n"); if (at < 0) return; const line = buffer.slice(0, at); buffer = buffer.slice(at + 1); void (async () => { let request; try { request = JSON.parse(line); if (request.schema_id !== requestSchema || !request.id || !request.operation) throw Object.assign(new Error("invalid daemon request"), { code: "daemon_protocol" }); const result = await dispatch(request.operation, request.params ?? {}); connection.end(`${JSON.stringify({ schema_id: responseSchema, id: request.id, ok: true, result: { ...result, _shutdown: undefined } })}\n`); if (result._shutdown) { await bridge.close(); await save({ shutdown_state: "clean", stopped_at: new Date().toISOString() }); await finishDaemonProcess(state.config, state.resource_process).catch(() => {}); server.close(() => process.exit(0)); await removeSocket(paths.socket); } } catch (error) { connection.end(`${JSON.stringify({ schema_id: responseSchema, id: request?.id ?? null, ok: false, error: errorPayload(error) })}\n`); } })(); }); });
  await new Promise((resolve, reject) => { server.once("error", reject); server.listen(paths.socket, resolve); }); await chmod(paths.socket, 0o600); await save({ shutdown_state: "running", active_operation: null }); return await new Promise(() => {});
}
