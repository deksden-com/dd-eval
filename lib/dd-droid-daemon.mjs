import { createHash, randomUUID } from "node:crypto";
import { chmod, lstat, mkdir, open, unlink, realpath } from "node:fs/promises";
import { spawn } from "node:child_process";
import net from "node:net";
import os from "node:os";
import { DroidError, DroidRuntime, absolute, droidPaths, droidVersion, prepareDroidHome, readJson, removeDroidAuth, processSnapshot } from "./dd-droid.mjs";
import { durableDaemonDispatch, inspectDaemonOperation } from "./daemon-operations.mjs";
import { observedTimeout } from "./observation-clock.mjs";
import { writeJsonAtomic } from "./runner-events.mjs";
import { errorRecord } from "./operation-errors.mjs";
import { cleanupFailedStart, confirmDaemonProcess, confirmDaemonStopped, finishDaemonProcess, heartbeatDaemonProcess, registerDaemonProcess } from "./managed-daemon.mjs";

const REQUEST = "dd-droid/daemon-request@1", RESPONSE = "dd-droid/daemon-response@1";
async function removeSocket(file) { try { if (!(await lstat(file)).isSocket()) throw new DroidError("unsafe_socket", "Refusing to replace non-socket daemon path"); await unlink(file); } catch (error) { if (error.code !== "ENOENT") throw error; } }
export async function callDaemon(stateDir, operation, params = {}, timeoutMs = 30_000, operationId = process.env.DD_EVAL_OPERATION_ID ?? randomUUID()) {
  const paths = droidPaths(stateDir), request = { schema_id: REQUEST, id: operationId, operation, params };
  return await new Promise((resolve, reject) => {
    const client = net.createConnection(paths.socket); let buffer = "", settled = false;
    const finish = (error, value) => { if (settled) return; settled = true; clearTimeout(timer); client.destroy(); error ? reject(error) : resolve(value); };
    const timer = operation === "session.prompt" ? null : observedTimeout(() => finish(new DroidError("daemon_timeout", `${operation} response was not observed`, { operation_id: operationId })), timeoutMs);
    client.setEncoding("utf8"); client.on("connect", () => client.write(`${JSON.stringify(request)}\n`));
    client.on("error", error => finish(new DroidError("daemon_not_running", error.message)));
    client.on("end", () => finish(new DroidError("daemon_connection_closed", "Droid daemon closed the connection before its reply")));
    client.on("close", () => finish(new DroidError("daemon_connection_closed", "Droid daemon connection closed")));
    client.on("data", chunk => { buffer += chunk; const index = buffer.indexOf("\n"); if (index < 0) return; try { const response = JSON.parse(buffer.slice(0, index)); if (response.schema_id !== RESPONSE || response.id !== operationId) throw new DroidError("daemon_protocol", "Droid daemon returned an unrelated response"); response.ok ? finish(null, response.result) : finish(Object.assign(new Error(response.error.message), response.error)); } catch (error) { finish(error); } });
  });
}
function sameConfig(a, b) { return ["cwd", "bin", "model", "reasoning", "mode", "provider", "ddFlowBin", "ddFlowHome", "resourceHome", "projectRoot", "noFlow"].every(key => a?.[key] === b[key]); }
export async function startDaemon(options) {
  const paths = droidPaths(options.stateDir), noFlow = options.noFlow === true || (!options.ddFlowBin && !options.ddFlowHome);
  const config = { stateDir: paths.dir, home: paths.home, bin: options.bin ?? process.env.DD_DROID_BIN ?? "droid", cwd: absolute(options.cwd, "--cwd"), projectRoot: absolute(options.projectRoot ?? options.cwd, "--project-root"), journal: absolute(options.journal ?? `${paths.dir}/events.jsonl`, "--journal"), entryPath: absolute(options.entryPath, "adapter entry"), authHome: absolute(options.authHome ?? os.homedir(), "auth home"), model: options.model ?? "gpt-5.6-sol", reasoning: options.reasoning ?? "high", mode: options.mode ?? "auto-high", provider: options.provider ?? "openai", noFlow, ddFlowBin: noFlow ? null : absolute(options.ddFlowBin, "--dd-flow-bin"), ddFlowHome: noFlow ? null : absolute(options.ddFlowHome, "--dd-flow-home"), resourceHome: noFlow ? null : process.env.DD_FLOW_RESOURCE_HOME ?? null, inactivityMs: options.timeoutMs ?? 600_000 };
  config.cwd = await realpath(config.cwd); config.projectRoot = await realpath(config.projectRoot);
  if (config.mode !== "auto-high") throw new DroidError("droid_mode_unsupported", "The qualified Droid profile requires auto-high");
  await mkdir(paths.dir, { recursive: true, mode: 0o700 }); await chmod(paths.dir, 0o700);
  try { const live = await callDaemon(paths.dir, "daemon.status", {}, 1_000); if (!sameConfig(live.config, config)) throw new DroidError("daemon_config_mismatch", "Droid daemon already uses another configuration"); return { ...live, already_running: true }; } catch (error) { if (!["daemon_not_running", "daemon_timeout"].includes(error.code)) throw error; }
  const previous = await readJson(paths.state);
  if (previous) {
    const rows = await processSnapshot();
    if (rows.some(row => !row.zombie && ([previous.pid, previous.provider_pid].includes(row.pid) || previous.owned_processes?.some(old => old.pid === row.pid && old.started === row.started)))) throw new DroidError("invalid_harness_crash", "Previous daemon or provider ownership remains; refusing another owner");
  }
  if (["clean", "unclean"].includes(previous?.shutdown_state)) throw new DroidError("daemon_state_terminal", "A cleanly stopped execution directory cannot be reused");
  if (previous && !["failed", "starting"].includes(previous.shutdown_state)) throw new DroidError("invalid_harness_crash", "Previous Droid ownership must be reconciled before another daemon starts");
  config.daemonId = randomUUID(); config.version = await droidVersion(config.bin);
  await removeSocket(paths.socket); const home = await prepareDroidHome(config); Object.assign(config, home);
  const resource = await registerDaemonProcess(config, { kind: "droid-daemon", owner: `droid:${config.daemonId}`, operation: `droid-daemon:${config.daemonId}`, stdout: paths.log, stderr: paths.log });
  await writeJsonAtomic(paths.state, { schema_id: "dd-droid/daemon-state@1", config, daemon_id: config.daemonId, shutdown_state: "starting", resource_process: resource });
  const log = await open(paths.log, "a", 0o600); const child = spawn(process.execPath, [config.entryPath, "daemon", "serve", "--state-dir", paths.dir], { cwd: config.cwd, detached: true, stdio: ["ignore", log.fd, log.fd] }); child.unref(); await log.close();
  try {
    await confirmDaemonProcess(config, resource, child);
    const deadline = Date.now() + 30_000;
    while (Date.now() < deadline) { await new Promise(resolve => setTimeout(resolve, 100)); const saved = await readJson(paths.state); if (saved?.startup_error) throw Object.assign(new Error(saved.startup_error.message), saved.startup_error); try { return await callDaemon(paths.dir, "daemon.status", {}, 1_000); } catch (error) { if (!["daemon_not_running", "daemon_timeout"].includes(error.code)) throw error; } }
    throw new DroidError("daemon_start_failed", "Droid daemon did not become ready");
  } catch (error) { await cleanupFailedStart(config, resource, child, error); throw error; }
}
export async function stopDaemon(options) { return await confirmDaemonStopped(() => callDaemon(options.stateDir, "daemon.stop", { cancelTree: options.cancelTree === true }, 30_000), droidPaths(options.stateDir).socket, 30_000); }
export async function serveDaemon(stateDir) {
  const paths = droidPaths(stateDir), state = await readJson(paths.state); if (!state?.config) throw new DroidError("daemon_state_missing", "Missing Droid daemon state");
  let saving = Promise.resolve(), busy = null, stopping = false;
  const save = patch => { Object.assign(state, patch, { pid: process.pid, updated_at: new Date().toISOString() }); const snapshot = structuredClone(state); saving = saving.then(() => writeJsonAtomic(paths.state, snapshot)); return saving; };
  const runtime = new DroidRuntime(state.config, state, save);
  const dispatch = async request => {
    const params = request.params ?? {}, operation = request.operation;
    if (operation === "daemon.status") { await runtime.refreshTopology(); return { daemon_id: state.daemon_id, pid: process.pid, config: state.config, shutdown_state: state.shutdown_state, provider_ready: Boolean(runtime.child && !runtime.closed), active_operation: busy, active_tree: Boolean(runtime.active || runtime.workingState !== "idle" || runtime.topologyIncomplete || [...runtime.topology.values()].some(child => !["completed", "cancelled", "failed"].includes(child.status))), sessions: runtime.rootId ? [runtime.rootId] : [], provider_pid: runtime.closed ? null : runtime.child?.pid }; }
    if (operation === "hook.observe") return await runtime.observeHook(params.payload, params.eventId);
    if (operation === "session.inspect") return await runtime.inspect(params.sessionId);
    if (operation === "session.cancel") { runtime.requireIdentity(params.sessionId); const cleanup = await runtime.closeTree(true); return { ...await runtime.inspect(params.sessionId, { ignoreActive: true }), cancelled: true, settled: cleanup.settled, cleanup }; }
    if (operation === "daemon.stop") {
      if (stopping) throw new DroidError("operation_busy", "Droid shutdown is already in progress");
      if (!params.cancelTree && (busy || (runtime.rootId && !(await runtime.inspect(runtime.rootId)).settled))) throw new DroidError("tree_not_settled", "Droid still owns unfinished work");
      stopping = true;
      try { const cleanup = await runtime.closeTree(params.cancelTree === true); if (runtime.rootId) await runtime.inspect(runtime.rootId, { ignoreActive: true }); await removeDroidAuth(state.config); await save({ shutdown_state: cleanup.forced ? "unclean" : "clean", active_tree: false, cleanup }); await finishDaemonProcess(state.config, state.resource_process); return { stopped: true, clean: !cleanup.forced, settled: true, _shutdown: true }; }
      catch (error) { stopping = false; await save({ shutdown_state: "cleanup_failed", cleanup_error: errorRecord(error) }); throw error; }
    }
    if (busy || stopping) throw new DroidError("operation_busy", "Another Droid operation is active");
    busy = operation; await save({ active_operation: busy });
    try {
      if (operation === "session.create") { if (params.prompt) throw new DroidError("invalid_create", "create does not execute a prompt"); return await runtime.create(request.id); }
      if (operation === "session.resume") return await runtime.resume(params.sessionId);
      if (["session.prompt", "session.start"].includes(operation)) return await runtime.prompt(params.sessionId, params.prompt, request.id);
      throw new DroidError("unknown_operation", `Unknown Droid operation: ${operation}`);
    } finally { busy = null; await save({ active_operation: null }); }
  };
  await removeSocket(paths.socket);
  const server = net.createServer(socket => { socket.setEncoding("utf8"); let buffer = "", consumed = false; socket.on("error", () => {}); socket.on("data", chunk => { if (consumed) return; buffer += chunk; const at = buffer.indexOf("\n"); if (at < 0) return; consumed = true;
    void (async () => { let request; try { request = JSON.parse(buffer.slice(0, at)); if (request.schema_id !== REQUEST || typeof request.id !== "string" || typeof request.operation !== "string") throw new DroidError("daemon_protocol", "Malformed Droid daemon request"); let result;
      if (request.operation === "operation.inspect") {
        result = await inspectDaemonOperation(paths.dir, request.params?.operationId);
        if (!["completed", "failed"].includes(result.state)) {
          const recovered = await runtime.recoverOperation(request.params.operationId);
          if (recovered) {
            const terminal = { state: "completed", finished_at: new Date().toISOString(), result: recovered };
            await writeJsonAtomic(`${paths.dir}/operations/${createHash("sha256").update(request.params.operationId).digest("hex")}/result.json`, terminal);
            result = { ...result, ...terminal };
          }
        }
      } else result = await durableDaemonDispatch(paths.dir, request, () => dispatch(request)); const { _shutdown, ...receipt } = result; socket.end(`${JSON.stringify({ schema_id: RESPONSE, id: request.id, ok: true, result: receipt })}\n`); if (_shutdown) { await removeSocket(paths.socket); server.close(); } } catch (error) { socket.end(`${JSON.stringify({ schema_id: RESPONSE, id: request?.id, ok: false, error: errorRecord(error) })}\n`); } })();
  }); });
  try { await runtime.start(); await heartbeatDaemonProcess(state.config, state.resource_process); await save({ shutdown_state: "running" }); await new Promise((resolve, reject) => { server.once("error", reject); server.listen(paths.socket, resolve); }); await chmod(paths.socket, 0o600); }
  catch (error) { let cleanup; try { cleanup = await runtime.closeTree(true); await removeDroidAuth(state.config); } catch (failure) { await save({ shutdown_state: "cleanup_failed", startup_error: errorRecord(error), cleanup_error: errorRecord(failure) }); throw error; } await save({ shutdown_state: "failed", startup_error: errorRecord(error), cleanup }); await finishDaemonProcess(state.config, state.resource_process, "failed", "startup_failed"); throw error; }
  await new Promise(resolve => server.once("close", resolve));
}
