import { spawn } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { chmod, lstat, mkdir, open, readFile, rename, unlink, writeFile } from "node:fs/promises";
import net from "node:net";
import path from "node:path";
import { commandJson } from "./process-json.mjs";

import {
  AcpBridge,
  cancelSessionWithBridge,
  cancelChildWithBridge,
  createSessionWithBridge,
  doctor,
  forkSessionWithBridge,
  inspectSessionWithBridge,
  promptProbeBatchWithBridge,
  promptSessionWithBridge,
} from "./dd-zcode.mjs";

const REQUEST_SCHEMA = "dd-zcode/daemon-request@1";
const RESPONSE_SCHEMA = "dd-zcode/daemon-response@1";
const STATE_SCHEMA = "dd-zcode/daemon-state@1";
// An agent can spend several minutes in a single tool operation or provider
// turn without emitting an ACP update.  This is an idle deadline, not a
// wall-clock cap: every observed update resets it.
export const DEFAULT_LIVENESS_TIMEOUT_MS = 600_000;

class DaemonError extends Error {
  constructor(code, message, retryable = false, details) {
    super(message); this.code = code; this.retryable = retryable; this.details = details;
  }
}

function absolute(value, label) {
  if (!value || !path.isAbsolute(value)) throw new DaemonError("invalid_path", `${label} must be an absolute path`);
  return path.resolve(value);
}

function locations(stateDir) {
  const dir = absolute(stateDir, "--state-dir");
  const localSocket = path.join(dir, "daemon.sock");
  const socket = Buffer.byteLength(localSocket) < 100
    ? localSocket
    : `/tmp/dd-zcode-${createHash("sha256").update(dir).digest("hex").slice(0, 24)}.sock`;
  return { dir, socket, state: path.join(dir, "daemon.json"), log: path.join(dir, "daemon.log") };
}

async function readState(stateDir) {
  const file = locations(stateDir).state;
  try { return JSON.parse(await readFile(file, "utf8")); }
  catch (error) { if (error.code === "ENOENT") return null; throw error; }
}

async function writeState(file, value) {
  const temporary = `${file}.${process.pid}.tmp`;
  await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
  await rename(temporary, file);
}

async function removeSocket(socket, dir) {
  if (socket !== locations(dir).socket) throw new DaemonError("unsafe_socket", "daemon socket does not match the exact state directory");
  try {
    const info = await lstat(socket);
    if (!info.isSocket()) throw new DaemonError("unsafe_socket", "refusing to remove a non-socket daemon path");
    await unlink(socket);
  } catch (error) { if (error.code !== "ENOENT") throw error; }
}

function errorPayload(error) {
  return {
    code: error.code ?? "operation_failed",
    message: error.message ?? String(error),
    retryable: error.retryable === true,
    ...(error.details === undefined ? {} : { details: error.details }),
  };
}

export async function callDaemon(stateDir, operation, params = {}, timeoutMs = 30_000) {
  const { socket } = locations(stateDir);
  const request = { schema_id: REQUEST_SCHEMA, id: randomUUID(), operation, params };
  return await new Promise((resolve, reject) => {
    const client = net.createConnection(socket);
    let buffer = ""; let settled = false;
    // A prompt has its own sliding ACP liveness deadline.  Do not add an
    // independent wall-clock deadline here: it can cut off an actively
    // producing Turn merely because it is long.
    const timer = Number.isFinite(timeoutMs) && timeoutMs > 0
      ? setTimeout(() => { client.destroy(); reject(new DaemonError("daemon_timeout", `${operation} timed out`, true)); }, timeoutMs)
      : null;
    const finish = (error, value) => {
      if (settled) return;
      settled = true; if (timer) clearTimeout(timer); client.destroy(); error ? reject(error) : resolve(value);
    };
    client.setEncoding("utf8");
    client.on("connect", () => client.write(`${JSON.stringify(request)}\n`));
    client.on("data", (chunk) => {
      buffer += chunk;
      const newline = buffer.indexOf("\n");
      if (newline < 0) return;
      try {
        const response = JSON.parse(buffer.slice(0, newline));
        if (response.schema_id !== RESPONSE_SCHEMA || response.id !== request.id) return finish(new DaemonError("daemon_protocol_mismatch", "invalid daemon response"));
        if (!response.ok) return finish(new DaemonError(response.error?.code ?? "operation_failed", response.error?.message ?? "daemon operation failed", response.error?.retryable, response.error?.details));
        finish(null, response.result);
      } catch (error) { finish(new DaemonError("daemon_protocol_mismatch", error.message)); }
    });
    client.on("error", (error) => finish(new DaemonError("daemon_not_running", error.message, true)));
    client.on("end", () => { if (!buffer.includes("\n")) finish(new DaemonError("daemon_protocol_mismatch", "daemon closed without a response")); });
    client.on("close", () => { if (!settled) finish(new DaemonError("daemon_not_running", "daemon closed without a response", true)); });
  });
}

function sameConfig(state, config) {
  return ["cwd", "journal", "bin", "zcodePath", "ddFlowBin", "ddFlowHome", "projectRoot", "resourceHome", "livenessTimeoutMs", "probeMode"].every((key) => (state.config?.[key] ?? null) === (config[key] ?? null));
}

async function runtimeProcess(config, action, options = {}) {
  if (!config.resourceHome || !config.ddFlowHome || !config.ddFlowBin) return null;
  const args = ["runtime", "process", action];
  for (const [key, value] of Object.entries(options)) {
    if (value !== null && value !== undefined) args.push(`--${key}`, String(value));
  }
  return await commandJson(config.ddFlowBin, args, { cwd: config.cwd, env: { ...config.env, DD_FLOW_RESOURCE_HOME: config.resourceHome } });
}

export async function startDaemon(options) {
  const paths = locations(options.stateDir);
  const hasFlowContext = Boolean(options.ddFlowHome || options.projectRoot || options.ddFlowBin);
  if (hasFlowContext && (!options.ddFlowHome || !options.projectRoot)) {
    throw new DaemonError("flow_context_incomplete", "--dd-flow-home and --project-root must be provided together for ZCode lifecycle forwarding");
  }
  const config = {
    cwd: absolute(options.cwd, "--cwd"),
    journal: absolute(options.journal, "--journal"),
    bin: options.bin ?? null,
    zcodePath: options.zcodePath ?? null,
    // The worker itself invokes `dd-flow` from PATH.  Use that same executable
    // for the trusted event bridge unless a pinned executable was supplied.
    ddFlowBin: hasFlowContext ? (options.ddFlowBin ? absolute(options.ddFlowBin, "--dd-flow-bin") : "dd-flow") : null,
    ddFlowHome: options.ddFlowHome ? absolute(options.ddFlowHome, "--dd-flow-home") : null,
    projectRoot: options.projectRoot ? absolute(options.projectRoot, "--project-root") : null,
    resourceHome: process.env.DD_FLOW_RESOURCE_HOME ? absolute(process.env.DD_FLOW_RESOURCE_HOME, "DD_FLOW_RESOURCE_HOME") : null,
    env: options.ddFlowHome ? { DD_FLOW_HOME: absolute(options.ddFlowHome, "--dd-flow-home") } : {},
    livenessTimeoutMs: options.livenessTimeoutMs ?? DEFAULT_LIVENESS_TIMEOUT_MS,
    probeMode: options.probeMode === true,
  };
  await mkdir(paths.dir, { recursive: true, mode: 0o700 });
  await chmod(paths.dir, 0o700);
  try {
    const status = await callDaemon(paths.dir, "daemon.status", {}, 1000);
    if (!sameConfig(status, config)) throw new DaemonError("daemon_config_mismatch", "a daemon is already running with different configuration");
    return { ...status, already_running: true };
  } catch (error) { if (error.code !== "daemon_not_running" && error.code !== "daemon_timeout") throw error; }

  const previous = await readState(paths.dir);
  if (previous?.shutdown_state === "clean") {
    throw new DaemonError("daemon_state_terminal", "a cleanly stopped execution state directory cannot be reused; start the next execution with a new --state-dir");
  }
  if (previous?.shutdown_state === "running" && previous.active_tree) {
    throw new DaemonError("invalid_harness_crash", "the previous daemon died with an active or unproven Session tree", false, { daemon_id: previous.daemon_id });
  }
  await removeSocket(paths.socket, paths.dir);
  const versions = await doctor({ bin: config.bin, zcodePath: config.zcodePath });
  const registered = await runtimeProcess(config, "register", {
    kind: "zcode-daemon", owner: `zcode:${path.basename(paths.dir)}`, operation: `zcode-daemon:${path.basename(paths.dir)}`,
    stdout: paths.log, stderr: paths.log, "lease-ms": 300_000,
  });
  const resourceProcess = registered?.process ? { id: registered.process.id, lease_token: registered.process.lease_token } : null;
  const state = {
    schema_id: STATE_SCHEMA,
    daemon_id: randomUUID(),
    pid: null,
    socket: paths.socket,
    cwd: config.cwd,
    journal: config.journal,
    started_at: new Date().toISOString(),
    shutdown_state: "starting",
    active_tree: false,
    recovery_status: previous?.shutdown_state === "running" ? "recovered_idle" : "clean_start",
    versions: versions.versions,
    config,
    sessions: previous?.sessions ?? [],
    resource_process: resourceProcess,
  };
  await writeState(paths.state, state);
  const log = await open(paths.log, "a", 0o600);
  const child = spawn(process.execPath, [absolute(options.entryPath, "dd-zcode entry"), "daemon", "serve", "--state-dir", paths.dir], {
    cwd: config.cwd, detached: true, stdio: ["ignore", log.fd, log.fd],
  });
  child.unref();
  await log.close();
  try {
    if (resourceProcess && child.pid) await runtimeProcess(config, "confirm", { id: resourceProcess.id, "lease-token": resourceProcess.lease_token, pid: child.pid, "lease-ms": 300_000 });
    else if (resourceProcess) await runtimeProcess(config, "finish", { id: resourceProcess.id, "lease-token": resourceProcess.lease_token, state: "failed", reason: "daemon_spawn_missing_pid" });
  } catch (error) {
    child.kill("SIGTERM");
    throw error;
  }
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 100));
    try { return await callDaemon(paths.dir, "daemon.status", {}, 1000); }
    catch (error) { if (error.code !== "daemon_not_running" && error.code !== "daemon_timeout") throw error; }
  }
  throw new DaemonError("daemon_start_failed", "daemon did not become ready", true);
}

export async function stopDaemon(options) {
  const timeoutMs = options.timeoutMs ?? 30_000;
  const result = await callDaemon(options.stateDir, "daemon.stop", { cancelTree: options.cancelTree === true }, timeoutMs);
  const { socket } = locations(options.stateDir);
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try { await lstat(socket); }
    catch (error) {
      if (error.code === "ENOENT") return result;
      throw error;
    }
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new DaemonError("daemon_stop_incomplete", "daemon acknowledged stop but its socket remained live", true, { socket });
}

class DaemonRuntime {
  constructor(paths, state, bridge, initialized) {
    this.paths = paths; this.state = state; this.bridge = bridge; this.initialized = initialized;
    this.sessions = new Map((state.sessions ?? []).map((item) => [item.provider_session_id, item]));
    this.liveAdapters = new Set();
    this.activeProductive = null; this.server = null; this.persisting = Promise.resolve();
  }

  persist(patch = {}) {
    Object.assign(this.state, patch, { pid: process.pid, updated_at: new Date().toISOString(), sessions: [...this.sessions.values()] });
    this.persisting = this.persisting.then(() => writeState(this.paths.state, this.state));
    const resourceProcess = this.state.resource_process;
    if (resourceProcess?.id && resourceProcess.lease_token) {
      this.persisting = this.persisting.then(async () => {
        try { await runtimeProcess(this.state.config, "heartbeat", { id: resourceProcess.id, "lease-token": resourceProcess.lease_token, "lease-ms": 300_000 }); }
        catch { /* A crashed client is recovered through the durable lease. */ }
      });
    }
    return this.persisting;
  }

  options(params) {
    const known = this.sessions.get(params.sessionId);
    const adapter = params.adapterSessionId ?? known?.adapter_session_id ?? params.sessionId;
    return { ...this.state.config, ...params, adapterSessionId: adapter, daemonId: this.state.daemon_id, allowBackground: true, liveSession: this.liveAdapters.has(adapter) };
  }

  track(result, topology = result?.evidence?.subagents) {
    if (result?.provider_session_id) { const existing = this.sessions.get(result.provider_session_id); this.sessions.set(result.provider_session_id, {
      provider_session_id: result.provider_session_id,
      adapter_session_id: result.adapter_session_id ?? result.provider_session_id,
      parent_provider_session_id: result.parent_provider_session_id ?? null,
      topology: topology ?? null,
      completed_turns: existing?.completed_turns ?? 0,
    }); }
    if (result?.adapter_session_id) this.liveAdapters.add(result.adapter_session_id);
    for (const child of topology?.running ?? []) {
      const adapter = child.childSessionId ?? child.adapterSessionId ?? child.sessionId;
      if (typeof adapter === "string" && adapter) this.liveAdapters.add(adapter);
    }
  }

  async productive(name, task) {
    if (this.activeProductive) throw new DaemonError("operation_busy", `${this.activeProductive} is already running`, true);
    this.activeProductive = name;
    await this.persist({ active_tree: true, active_operation: name });
    try {
      const result = await task();
      this.track(result);
      const running = (result?.evidence?.subagents?.running ?? []).length > 0;
      await this.persist({ active_tree: running, active_operation: null });
      return result;
    } catch (error) {
      await this.persist({ active_operation: null });
      throw error;
    } finally { this.activeProductive = null; }
  }

  async requireSettled(params) {
    const known = this.sessions.get(params.sessionId);
    // A freshly created ZCode Session has no prior Turn and is not yet exposed
    // by the provider's subagent index. Its first prompt is therefore safe.
    if (known && (known.completed_turns ?? 0) === 0) return null;
    const observed = await inspectSessionWithBridge(this.bridge, this.options(params));
    const runningChildren = observed.subagents?.running ?? [];
    if (observed.read?.projection?.status === "running" || runningChildren.length > 0) {
      throw new DaemonError("tree_not_settled", "the prior ZCode agent tree is not fully settled", false, { session_id: params.sessionId, running_children: runningChildren.map((child) => child.sessionId ?? child.childSessionId ?? null) });
    }
    this.track(observed, observed.subagents);
    return observed;
  }

  async dispatch(operation, params) {
    if (operation === "daemon.status") return {
      daemon_id: this.state.daemon_id, pid: process.pid, socket: this.paths.socket,
      cwd: this.state.cwd, journal: this.state.journal, versions: this.state.versions,
      started_at: this.state.started_at, updated_at: this.state.updated_at,
      shutdown_state: this.state.shutdown_state, recovery_status: this.state.recovery_status,
      active_tree: this.state.active_tree, active_operation: this.activeProductive,
      sessions: [...this.sessions.values()], config: this.state.config,
    };
    if (operation === "session.create") return await this.productive(operation, async () => await createSessionWithBridge(this.bridge, this.options(params), this.initialized));
    if (operation === "session.prompt") {
      const result = await this.productive(operation, async () => { await this.requireSettled(params); return await promptSessionWithBridge(this.bridge, this.options(params)); });
      const session = this.sessions.get(result.provider_session_id); if (session) session.completed_turns = (session.completed_turns ?? 0) + 1;
      await this.persist(); return result;
    }
    if (operation === "session.probe-batch") {
      if (!this.state.config.probeMode) throw new DaemonError("probe_mode_required", "session.probe-batch is permitted only in a disposable probe daemon");
      return await this.productive(operation, async () => await promptProbeBatchWithBridge(this.bridge, this.options(params)));
    }
    if (operation === "session.fork") return await this.productive(operation, async () => { await this.requireSettled(params); return await forkSessionWithBridge(this.bridge, this.options(params)); });
    if (operation === "session.inspect") {
      const adapter = params.adapterSessionId ?? params.sessionId;
      if (!this.liveAdapters.has(adapter) && this.activeProductive) {
        throw new DaemonError(
          "child_inspection_unavailable",
          "cannot inspect an unregistered child while a daemon-owned turn is running; inspection would resume and mutate it",
          true,
          { session_id: params.sessionId },
        );
      }
      const result = await inspectSessionWithBridge(this.bridge, this.options(params));
      // A child can be inspected through its parent's live bridge, but is not
      // an independently daemon-owned root Session. Do not promote it into
      // `sessions`: daemon shutdown would then treat the child as a second
      // root and could reject an otherwise settled parent tree.
      if (this.sessions.has(result.provider_session_id)) this.track(result, result.subagents);
      else if (result.adapter_session_id) this.liveAdapters.add(result.adapter_session_id);
      await this.persist({ active_tree: (result.subagents?.running ?? []).length > 0 || Boolean(this.activeProductive) });
      return result;
    }
    if (operation === "session.cancel") {
      const result = await cancelSessionWithBridge(this.bridge, this.options(params));
      this.track(result, result.after);
      await this.persist({ active_tree: (result.after?.running ?? []).length > 0 || Boolean(this.activeProductive) });
      return result;
    }
    if (operation === "session.cancel-child") {
      const result = await cancelChildWithBridge(this.bridge, this.options(params));
      this.track(result, result.after);
      await this.persist({ active_tree: (result.after?.running ?? []).length > 0 || Boolean(this.activeProductive) });
      return result;
    }
    if (operation === "daemon.stop") return await this.prepareStop(params.cancelTree === true);
    throw new DaemonError("unknown_operation", `unknown daemon operation: ${operation}`);
  }

  async prepareStop(cancel) {
    const unsettled = [];
    for (const session of this.sessions.values()) {
      const options = this.options({ sessionId: session.provider_session_id, adapterSessionId: session.adapter_session_id });
      const observed = await inspectSessionWithBridge(this.bridge, options);
      if ((observed.subagents?.running ?? []).length || observed.read?.projection?.status === "running") {
        if (!cancel) unsettled.push(session.provider_session_id);
        else await cancelSessionWithBridge(this.bridge, options);
      }
    }
    if (unsettled.length) throw new DaemonError("tree_not_settled", "daemon still owns running Sessions", false, { sessions: unsettled });
    const deadline = Date.now() + 5000;
    while (this.activeProductive && Date.now() < deadline) await new Promise((resolve) => setTimeout(resolve, 50));
    if (this.activeProductive) throw new DaemonError("tree_not_settled", "productive operation did not settle after cancellation");
    await this.persist({ active_tree: false, shutdown_state: "stopping", active_operation: null });
    return { daemon_id: this.state.daemon_id, stopped: true, clean: true, _shutdown: true };
  }

  async shutdown() {
    await this.bridge.close();
    await this.persist({ active_tree: false, shutdown_state: "clean", stopped_at: new Date().toISOString() });
    const resourceProcess = this.state.resource_process;
    if (resourceProcess?.id && resourceProcess.lease_token) {
      try { await runtimeProcess(this.state.config, "finish", { id: resourceProcess.id, "lease-token": resourceProcess.lease_token, state: "stopped", reason: "daemon_stopped" }); }
      catch { /* Keep the state; the next reconciler owns stale processes. */ }
    }
    await new Promise((resolve) => this.server.close(resolve));
    await removeSocket(this.paths.socket, this.paths.dir);
  }
}

export async function serveDaemon(stateDir) {
  const paths = locations(stateDir);
  const state = await readState(paths.dir);
  if (!state || state.schema_id !== STATE_SCHEMA) throw new DaemonError("daemon_state_missing", "daemon state is missing or incompatible");
  const bridge = new AcpBridge(state.config);
  const initialized = await bridge.start();
  const runtime = new DaemonRuntime(paths, state, bridge, initialized);
  await removeSocket(paths.socket, paths.dir);
  const server = net.createServer((connection) => {
    connection.setEncoding("utf8"); let buffer = "";
    connection.on("data", (chunk) => {
      buffer += chunk;
      const newline = buffer.indexOf("\n");
      if (newline < 0) return;
      const line = buffer.slice(0, newline); buffer = buffer.slice(newline + 1);
      void (async () => {
        let request;
        try {
          request = JSON.parse(line);
          if (request.schema_id !== REQUEST_SCHEMA || !request.id || !request.operation) throw new DaemonError("daemon_protocol_mismatch", "invalid daemon request");
          const result = await runtime.dispatch(request.operation, request.params ?? {});
          connection.end(`${JSON.stringify({ schema_id: RESPONSE_SCHEMA, id: request.id, ok: true, result: { ...result, _shutdown: undefined } })}\n`);
          if (result?._shutdown) setImmediate(() => void runtime.shutdown().then(() => process.exit(0)));
        } catch (error) {
          connection.end(`${JSON.stringify({ schema_id: RESPONSE_SCHEMA, id: request?.id ?? null, ok: false, error: errorPayload(error) })}\n`);
        }
      })();
    });
  });
  runtime.server = server;
  await new Promise((resolve, reject) => { server.once("error", reject); server.listen(paths.socket, resolve); });
  await chmod(paths.socket, 0o600);
  await runtime.persist({ shutdown_state: "running", active_tree: false });
  let shuttingDown = false;
  const onSignal = () => {
    if (shuttingDown) return;
    shuttingDown = true;
    void runtime.shutdown().catch(async () => { await runtime.persist({ shutdown_state: "running" }); }).finally(() => process.exit(1));
  };
  process.on("SIGTERM", onSignal);
  process.on("SIGINT", onSignal);
  return await new Promise(() => {});
}
