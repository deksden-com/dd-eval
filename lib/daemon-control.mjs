import { readFile, realpath } from "node:fs/promises";
import path from "node:path";
import { assertDaemonReplaceable } from "./driver-recovery.mjs";
import { runtimeProcess } from "./managed-daemon.mjs";
import { writeJsonAtomic } from "./runner-events.mjs";
import { errorRecord } from "./operation-errors.mjs";

const failure = (code, message, details) => Object.assign(new Error(message), { code, details });

/** Control never initializes a home, applies a profile or starts a provider.
 * Native cancellation owns the entire execution tree, including descendants. */
export async function cancelOwnedDaemon({ stateDir, projectRoot, sessionId, stop }) {
  const file = path.join(stateDir, "daemon.json");
  let state;
  try { state = JSON.parse(await readFile(file, "utf8")); }
  catch (error) { throw failure("cancellation_unconfirmed", "cannot establish daemon ownership", { error: errorRecord(error) }); }
  const ids = [...(state.sessions ?? []), ...(state.root_session_id ? [state.root_session_id] : [])]
    .map(item => typeof item === "string" ? item : item.provider_session_id);
  if ((sessionId !== null && !ids.includes(sessionId)) || !state.config?.cwd || await realpath(state.config.cwd) !== await realpath(projectRoot)) {
    throw failure("session_identity_mismatch", "cancellation target is outside this execution's daemon");
  }
  try {
    const result = await stop();
    return { ...result, cancelled: true, settled: result.settled === true || result.clean === true };
  } catch (error) {
    if (error.code !== "daemon_not_running") throw error;
  }
  // A disconnected socket is not permission to kill a live daemon by PID.
  // A live owner might be shutting down; let its durable receipt settle first.
  if (Number.isInteger(state.pid) && state.pid > 0) {
    try { process.kill(state.pid, 0); throw failure("cancellation_unconfirmed", "daemon is live but its control endpoint is unavailable"); }
    catch (error) { if (error.code !== "ESRCH") throw error; }
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
  try { await assertDaemonReplaceable(stateDir); }
  catch (error) { errors.push(errorRecord(error)); }
  const priorSettlement = state.cleanup?.settled === true || (state.shutdown_state === "clean" && state.active_tree !== true);
  if (errors.length || (!priorSettlement && !stopped.length)) throw failure("cancellation_unconfirmed", "provider settlement is not confirmed", { cleanup_errors: errors, stopped_processes: stopped });
  // Process cleanup does not prove remote provider work ended. Only an adapter
  // settlement receipt permits finalization; otherwise retain the partial cleanup.
  if (!priorSettlement) {
    await writeJsonAtomic(file, { ...state, control_cleanup: { stopped_processes: stopped, observed_at: new Date().toISOString() } });
    throw failure("cancellation_unconfirmed", "local processes stopped; native Session settlement remains unknown", { stopped_processes: stopped });
  }
  return { cancelled: true, settled: true, clean: state.shutdown_state === "clean", reason: "retained_adapter_settlement", stopped_processes: stopped };
}
