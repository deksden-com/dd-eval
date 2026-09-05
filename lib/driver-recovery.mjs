import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { inspectDaemonOperation } from "./daemon-operations.mjs";
import { writeJsonAtomic } from "./runner-events.mjs";
import { reportedError } from "./operation-errors.mjs";
import { ObservationClock } from "./observation-clock.mjs";

export async function assertDaemonReplaceable(root) {
  let state;
  try { state = JSON.parse(await readFile(path.join(root, "daemon.json"), "utf8")); }
  catch (error) { if (error.code === "ENOENT") return; throw error; }
  if (!Number.isInteger(state.pid) || state.pid <= 0) throw Object.assign(new Error("original daemon ownership is unknown"), { code: "operation_observation_lost", details: { state_dir: root } });
  try { process.kill(state.pid, 0); }
  catch (error) { if (error.code === "ESRCH") return; }
  throw Object.assign(new Error("original daemon is live or its ownership is unconfirmed; do not create a competing bridge"), { code: "operation_observation_lost", details: { state_dir: root, pid: state.pid } });
}

/** Observe the original operation; never re-send its parameters. */
export async function recoverDriverReply(root, id, { timeoutMs = 30_000, pollMs = 250 } = {}) {
  const clock = new ObservationClock({ timeoutMs });
  do {
    let receipt;
    try { receipt = await inspectDaemonOperation(root, id); }
    catch (error) { if (error.code !== "operation_not_found") throw error; }
    if (receipt?.state === "completed") return receipt.result;
    if (receipt?.state === "failed") throw reportedError(receipt.error, "provider operation failed");
    if (clock.sample()) break;
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
