import { readFile, realpath } from "node:fs/promises";
import path from "node:path";
import { assertDaemonReplaceable } from "./driver-recovery.mjs";
import { runtimeProcess } from "./managed-daemon.mjs";
import { writeJsonAtomic } from "./runner-events.mjs";
import { errorRecord } from "./operation-errors.mjs";
import { processRetired } from "./process-snapshot.mjs";
import { setTimeout as delay } from "node:timers/promises";
import { ObservationClock } from "./observation-clock.mjs";

const failure = (code, message, details) => Object.assign(new Error(message), { code, details });

/** Control never initializes a home, applies a profile or starts a provider.
 * Native cancellation owns the entire execution tree, including descendants. */
export async function cancelOwnedDaemon({ stateDir, projectRoot, sessionId, stop, inspect, nativeContracts, wait = delay }) {
  const file = path.join(stateDir, "daemon.json");
  let state;
  try { state = JSON.parse(await readFile(file, "utf8")); }
  catch (error) { throw failure("cancellation_unconfirmed", "cannot establish daemon ownership", { error: errorRecord(error) }); }
  const ids = [...(state.sessions ?? []), ...(state.root_session_id ? [state.root_session_id] : [])]
    .map(item => typeof item === "string" ? item : item.provider_session_id);
  if ((sessionId !== null && !ids.includes(sessionId)) || !state.config?.cwd || await realpath(state.config.cwd) !== await realpath(projectRoot)) {
    throw failure("session_identity_mismatch", "cancellation target is outside this execution's daemon");
  }
  const daemonId = state.daemon_id ?? state.config.daemonId;
  let fence;
  try { fence = JSON.parse(await readFile(path.join(stateDir, "operation-fence.json"), "utf8")); }
  catch (error) { if (error.code !== "ENOENT") throw failure("cancellation_unconfirmed", "shutdown generation cannot be observed", { error: errorRecord(error) }); }
  const boundShutdown = () => typeof daemonId === "string" && daemonId.length > 0
    && fence?.daemon_id === daemonId && Number.isSafeInteger(fence.generation) && fence.generation >= 0
    && nativeContracts?.nativeShutdownConfirmed?.(state.shutdown, { daemonId, generation: fence.generation }) === true;
  try {
    const result = await stop();
    const retained = JSON.parse(await readFile(file, "utf8"));
    if ((retained.daemon_id ?? retained.config?.daemonId) !== daemonId || retained.config?.cwd !== state.config.cwd) throw failure("cancellation_unconfirmed", "daemon incarnation changed during cancellation");
    state = retained;
    try { fence = JSON.parse(await readFile(path.join(stateDir, "operation-fence.json"), "utf8")); }
    catch (error) { if (error.code !== "ENOENT") throw error; fence = null; }
    // Stop ACK and execution readiness are not resource retirement. Only the
    // pinned validator's complete same-generation durable proof can be clean.
    const clean = boundShutdown() && state.shutdown_state === "clean" && state.active_tree === false
      && result.clean === true && result.native_settled !== false && result.settled !== false && result.native_settlement?.confirmed !== false;
    let nativeSettled = clean;
    let observation;
    const metadata = state.last_terminal_metadata, proof = metadata?.request_proof;
    const operationId = proof?.operation_id ?? metadata?.operation_id;
    if (!nativeSettled && inspect && nativeContracts?.nativeTreeReadiness && typeof operationId === "string") {
      let observer;
      try {
        for (;;) {
          observation = await inspect();
          const readiness = nativeContracts.nativeTreeReadiness(observation, { sessionId, operationId,
            ...(proof?.kind === "stream_request" ? { requestProof: proof } : { turnId: metadata?.turn_id }) });
          if (readiness === "ready") { nativeSettled = true; break; }
          if (readiness !== "inspection_pending") break;
          const snapshot = observation.native_settlement.observation_clock;
          observer ??= new ObservationClock({ timeoutMs: snapshot.timeout_ms, saved: snapshot, snapshotIsLive: true });
          if (observer.startedWall !== snapshot.started_at || observer.timeoutMs !== snapshot.timeout_ms) break;
          if (observer.sample(snapshot.cursor, snapshot.observed_at) || snapshot.elapsed_ms >= snapshot.timeout_ms) break;
          await wait(Math.min(250, Math.max(1, snapshot.timeout_ms - Math.max(observer.elapsed, snapshot.elapsed_ms))));
        }
      } catch (error) { observation = { observation_error: errorRecord(error) }; }
    }
    const physicalStopped = result.physical_stopped === true && typeof daemonId === "string" && result.daemon_id === daemonId;
    return { ...result, cancelled: true, physical_stopped: physicalStopped,
      clean: clean && physicalStopped, native_settled: nativeSettled, settled: clean && physicalStopped,
      ...(observation ? { native_outcome: observation } : {}),
      ...(!(clean && physicalStopped) ? { cleanup_blocked: true, code: "cancellation_unconfirmed", native_settlement: {
        ...(observation?.native_settlement ?? result.native_settlement), confirmed: nativeSettled,
        reason: observation?.native_settlement?.reason ?? result.native_settlement?.reason ?? observation?.observation_error?.code ?? (nativeSettled ? "owned_resource_retirement_unconfirmed" : "native_cancellation_unconfirmed")
      } } : {}) };
  } catch (error) {
    if (error.code !== "daemon_not_running") throw error;
  }
  // The endpoint may retire between our first read and its stop ACK. A fresh
  // same-incarnation durable proof may close that race; a new owner may not.
  const retained = JSON.parse(await readFile(file, "utf8"));
  if ((retained.daemon_id ?? retained.config?.daemonId) !== daemonId
    || retained.config?.cwd !== state.config.cwd) throw failure("cancellation_unconfirmed", "daemon incarnation changed during cancellation");
  state = retained;
  try { fence = JSON.parse(await readFile(path.join(stateDir, "operation-fence.json"), "utf8")); }
  catch (error) { if (error.code !== "ENOENT") throw error; fence = null; }
  // A disconnected socket is not permission to kill a live daemon by PID.
  // A live owner might be shutting down; let its durable receipt settle first.
  if (Number.isInteger(state.pid) && state.pid > 0) {
    const settled = boundShutdown() && state.shutdown_state === "clean" && state.active_tree === false && state.shutdown?.result?.clean === true;
    let retired;
    try { retired = processRetired(state.pid, settled ? state.stopped_at : undefined); }
    catch (error) { throw failure("cancellation_unconfirmed", "daemon exit cannot be observed", { observation_error: errorRecord(error) }); }
    if (!retired) throw failure("cancellation_unconfirmed", "daemon is live but its control endpoint is unavailable");
  } else throw failure("cancellation_unconfirmed", "daemon process identity is missing");

  const errors = [], stopped = [];
  if (state.config.resourceHome && state.config.ddFlowHome && state.config.ddFlowBin) {
    const registry = await runtimeProcess(state.config, "status");
    const records = registry?.processes;
    if (!Array.isArray(records)) throw failure("cancellation_unconfirmed", "managed process inventory is unavailable");
    const owned = records.filter(record => [record.stdout_path, record.stderr_path].some(file => typeof file === "string" && path.resolve(file).startsWith(`${path.resolve(stateDir)}${path.sep}`)));
    for (const record of owned) {
      try {
        const result = await runtimeProcess(state.config, "stop", { id: record.id, "lease-token": record.lease_token });
        if (result?.ok === false) throw failure("cancellation_unconfirmed", "managed process stop was rejected");
        stopped.push(record.id);
      } catch (error) { errors.push({ process_id: record.id, ...errorRecord(error) }); }
    }
  }
  try { await assertDaemonReplaceable(stateDir, { nativeContracts }); }
  catch (error) { errors.push(errorRecord(error)); }
  const priorSettlement = boundShutdown() && state.active_tree === false && state.shutdown_state === "clean";
  if (errors.length || (!priorSettlement && !stopped.length)) throw failure("cancellation_unconfirmed", "provider settlement is not confirmed", { cleanup_errors: errors, stopped_processes: stopped });
  // Process cleanup does not prove remote provider work ended. Only an adapter
  // settlement receipt permits finalization; otherwise retain the partial cleanup.
  if (!priorSettlement) {
    await writeJsonAtomic(file, { ...state, control_cleanup: { stopped_processes: stopped, observed_at: new Date().toISOString() } });
    throw failure("cancellation_unconfirmed", "local processes stopped; native Session settlement remains unknown", { stopped_processes: stopped });
  }
  return { cancelled: true, settled: true, native_settled: true, physical_stopped: true, clean: true, reason: "retained_adapter_settlement", stopped_processes: stopped };
}
