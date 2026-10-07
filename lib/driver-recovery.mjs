import { processSnapshot, processRetired } from "./process-snapshot.mjs";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { inspectDaemonOperation } from "./daemon-operations.mjs";
import { writeJsonAtomic } from "./runner-events.mjs";
import { reportedError } from "./operation-errors.mjs";
import { ObservationClock } from "./observation-clock.mjs";
import { createHash } from "node:crypto";
import { withRunnerLock } from "./runner-lock.mjs";

/** Qualification cancellation must follow actual native dispatch, not a sleep
 * or the creation of requested.json before admission. Never dispatches work. */
export async function waitForNativeDispatch({ journal, operationId, sessionId, timeoutMs = 30_000,
  settled = () => false, pollMs = 25 }) {
  const clock = new ObservationClock({ timeoutMs });
  for (;;) {
    let source;
    try { source = await readFile(journal, "utf8"); }
    catch (error) { if (error.code !== "ENOENT") throw error; source = ""; }
    if (settled()) throw Object.assign(new Error("native prompt settled before cancellation could be qualified"), { code: "live_cancel_not_exercised" });
    for (const line of source.split("\n")) {
      let record; try { record = JSON.parse(line); } catch { continue; }
      const value = record.payload ?? record;
      if (record.kind === "native_dispatch" && value.operation_id === operationId
        && (value.provider_session_id ?? value.session_id) === sessionId) return value;
    }
    if (clock.sample()) throw Object.assign(new Error("native dispatch was not confirmed; cancellation test was not exercised"), { code: "operation_observation_lost", details: { operation_id: operationId, session_id: sessionId } });
    await new Promise(resolve => setTimeout(resolve, pollMs));
  }
}



export async function assertDaemonReplaceable(root) {
  let state;
  try { state = JSON.parse(await readFile(path.join(root, "daemon.json"), "utf8")); }
  catch (error) { if (error.code === "ENOENT") return; throw error; }
  if (!Number.isInteger(state.pid) || state.pid <= 0) throw Object.assign(new Error("original daemon ownership is unknown"), { code: "operation_observation_lost", details: { state_dir: root } });
  const pids = new Set([state.pid, state.provider_pid, ...(state.owned_processes ?? []).map(process => process.pid)].filter(pid => Number.isInteger(pid) && pid > 0));
  for (const pid of pids) {
    const settled = state.shutdown_state === "clean" && state.active_tree === false && state.shutdown?.result?.clean === true;
    try { if (processRetired(pid, settled ? state.stopped_at : undefined)) continue; }
    catch { /* Unknown observation retains the existing ownership fence below. */ }
    const retained = state.owned_processes?.filter(record => record.pid === pid && typeof record.started === "string" && record.started.trim());
    if (retained?.length) {
      const observed = (await processSnapshot()).find(record => record.pid === pid);
      if (!observed || retained.every(record => record.started !== observed.started)) continue;
    }
    throw Object.assign(new Error("original daemon/provider is live or its ownership is unconfirmed; do not create a competing bridge"), { code: "operation_observation_lost", details: { state_dir: root, pid } });
  }
}

/** Observe the original operation; never re-send its parameters. */
export async function recoverDriverReply(root, id, { timeoutMs = 30_000, pollMs = 250 } = {}) {
  const clientFile = path.join(root, "client-operations", `${createHash("sha256").update(id).digest("hex")}.json`);
  let client;
  try { client = JSON.parse(await readFile(clientFile, "utf8")); } catch (error) { if (error.code !== "ENOENT") throw error; }
  const clock = new ObservationClock({ timeoutMs, saved: client?.recovery_observation_clock ?? null });
  const persist = async () => {
    if (client?.operation_id !== id) return;
    await withRunnerLock(path.join(root, "client-ledger"), async () => {
      const current = JSON.parse(await readFile(clientFile, "utf8"));
      if (current.operation_id === id && !["completed", "failed"].includes(current.state)) await writeJsonAtomic(clientFile, { ...current, recovery_observation_clock: clock.state() });
    });
  };
  await persist(); // A crash before the first read cannot restore an unused grant.
  do {
    let receipt;
    try { receipt = await inspectDaemonOperation(root, id); }
    catch (error) { if (error.code !== "operation_not_found") throw error; }
    if (receipt?.state === "completed") return receipt.result;
    if (receipt?.state === "failed") throw reportedError(receipt.error, "provider operation failed");
    const expired = clock.sample();
    await persist(); // Replacement reads remaining observation, not a new grant.
    if (expired) break;
    await new Promise(resolve => setTimeout(resolve, pollMs));
  } while (true);
  throw Object.assign(new Error("original provider operation has no confirmed reply; reconcile it before starting another Turn"), {
    code: "operation_observation_lost", details: { operation_id: id, state_dir: root }
  });
}

/** Crash recovery barrier. Import late replies into the client ledger before
 * any subsequent productive call, even when a new runner process is used. */
export async function reconcileDriverReplies(root) {
  const directory = path.join(root, "client-operations");
  let entries;
  try { entries = await readdir(directory); } catch (error) { if (error.code === "ENOENT") return; throw error; }
  for (const entry of entries.filter(name => name.endsWith(".json"))) {
    const file = path.join(directory, entry), record = JSON.parse(await readFile(file, "utf8"));
    if (["completed", "failed"].includes(record.state)) continue;
    let receipt;
    try { receipt = await inspectDaemonOperation(root, record.operation_id); }
    catch (error) { if (error.code !== "operation_not_found") throw error; }
    if (!["completed", "failed"].includes(receipt?.state)) throw Object.assign(new Error("a previous driver request has an unknown outcome; no new productive request was sent"), {
      code: "operation_observation_lost", details: { operation_id: record.operation_id, state_dir: root }
    });
    await writeJsonAtomic(file, { ...record, state: receipt.state, result: receipt.result, error: receipt.error, reconciled_at: new Date().toISOString() });
  }
}
