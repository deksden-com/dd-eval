import { readdir, readFile, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { inspectDaemonOperation } from "./daemon-operations.mjs";
import { writeJsonAtomic } from "./runner-events.mjs";
import { reportedError } from "./operation-errors.mjs";
import { ObservationClock } from "./observation-clock.mjs";
import { runtimeProcess } from "./managed-daemon.mjs";

/** Explicit same-Session restart retains native stores and the old daemon
 * receipt; it does not turn a terminal directory into a new execution. */
export async function authorizeRetainedDaemonResume(root, previous, sessionId, config) {
  const sessions = previous.sessions ?? [];
  if (previous.shutdown_state !== "clean" || previous.active_tree === true || typeof sessionId !== "string" || !sessions.some(session => (typeof session === "string" ? session : session.provider_session_id) === sessionId)) throw Object.assign(new Error("terminal daemon restart requires a retained, settled Session identity"), { code: "daemon_state_terminal" });
  for (const key of ["cwd", "projectRoot", "ddFlowHome", "ddFlowBin", "provider", "model", "reasoning", "mode", "variant", "agent", "bin", "noFlow"]) {
    if ((previous.config?.[key] ?? null) !== (config[key] ?? null)) throw Object.assign(new Error(`retained daemon configuration changed: ${key}`), { code: "daemon_config_mismatch" });
  }
  await assertDaemonReplaceable(root);
  await reconcileDriverReplies(root);
  if (!/^[a-zA-Z0-9-]+$/.test(previous.daemon_id ?? "")) throw Object.assign(new Error("original daemon identity is invalid"), { code: "daemon_state_terminal" });
  const directory = path.join(root, "daemon-history"); await mkdir(directory, { recursive: true, mode: 0o700 });
  const file = path.join(directory, `${previous.daemon_id}.json`), bytes = `${JSON.stringify(previous, null, 2)}\n`;
  try { await writeFile(file, bytes, { flag: "wx", mode: 0o600 }); }
  catch (error) { if (error.code !== "EEXIST" || await readFile(file, "utf8") !== bytes) throw error; }
}

/** A dead bridge alone does not prove its provider tree was stopped. Require
 * the adapter's durable clean-shutdown receipt as well, for every bridge. */
export async function recoverySettlement(driversRoot) {
  const daemons = [];
  const registries = new Map();
  async function visit(directory) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const file = path.join(directory, entry.name);
      if (entry.isSymbolicLink()) throw Object.assign(new Error("driver evidence contains a symbolic link"), { code: "recovery_settlement_unconfirmed" });
      if (entry.isDirectory()) await visit(file);
      else if (entry.name === "daemon.json") {
        const state = JSON.parse(await readFile(file, "utf8"));
        if (state.shutdown_state !== "clean" || state.active_tree === true) throw Object.assign(new Error("provider tree has no clean shutdown receipt"), { code: "recovery_settlement_unconfirmed" });
        await assertDaemonReplaceable(directory);
        await reconcileDriverReplies(directory);
        if (state.config?.resourceHome && state.resource_process?.id) {
          const key = state.config.resourceHome;
          if (!registries.has(key)) registries.set(key, await runtimeProcess(state.config, "status"));
          const processes = registries.get(key)?.processes;
          if (!Array.isArray(processes) || !processes.some(record => record.id === state.resource_process.id)) throw Object.assign(new Error("managed daemon registration is missing"), { code: "recovery_settlement_unconfirmed" });
          const attemptRoot = path.dirname(path.resolve(driversRoot));
          for (const record of processes.filter(record => record.id === state.resource_process.id || [record.stdout_path, record.stderr_path].some(file => typeof file === "string" && path.resolve(file).startsWith(`${attemptRoot}${path.sep}`)))) {
            if (!["stopped", "failed"].includes(record.state)) throw Object.assign(new Error("a retained managed process has not settled"), { code: "recovery_settlement_unconfirmed", details: { process_id: record.id, state: record.state } });
            if (Number.isInteger(record.pid) && record.pid > 0) {
              try { process.kill(record.pid, 0); }
              catch (error) { if (error.code === "ESRCH") continue; }
              throw Object.assign(new Error("a retained managed process is still live or unconfirmed"), { code: "recovery_settlement_unconfirmed", details: { process_id: record.id } });
            }
          }
        }
        daemons.push({ state_file: file, daemon_id: state.daemon_id, shutdown_state: state.shutdown_state, pid: state.pid });
      }
    }
  }
  await visit(driversRoot);
  if (!daemons.length) throw Object.assign(new Error("no provider shutdown evidence found"), { code: "recovery_settlement_unconfirmed" });
  return { settled: true, reason: "observed_clean_adapter_shutdown", observed_at: new Date().toISOString(), daemons };
}

export async function assertDaemonReplaceable(root) {
  let state;
  try { state = JSON.parse(await readFile(path.join(root, "daemon.json"), "utf8")); }
  catch (error) { if (error.code === "ENOENT") return; throw error; }
  if (!Number.isInteger(state.pid) || state.pid <= 0) throw Object.assign(new Error("original daemon ownership is unknown"), { code: "operation_observation_lost", details: { state_dir: root } });
  const pids = new Set([state.pid, state.provider_pid, ...(state.owned_processes ?? []).map(process => process.pid)].filter(pid => Number.isInteger(pid) && pid > 0));
  for (const pid of pids) {
    try { process.kill(pid, 0); }
    catch (error) { if (error.code === "ESRCH") continue; }
    throw Object.assign(new Error("original daemon/provider is live or its ownership is unconfirmed; do not create a competing bridge"), { code: "operation_observation_lost", details: { state_dir: root, pid } });
  }
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
