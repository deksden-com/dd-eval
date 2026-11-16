import { spawn } from "node:child_process";
import { mkdir, open } from "node:fs/promises";
import { once } from "node:events";
import { fileURLToPath } from "node:url";
import { processSnapshot } from "../process-snapshot.mjs";
import { writeJsonAtomic } from "../runner-events.mjs";
import { withRunnerLock } from "../runner-lock.mjs";
import { ownerEnvironment } from "../semantic-decisions.mjs";
import { maintenanceEnvironment } from "../eval-retirement.mjs";
import { workerLiveness } from "./eval-worker-status.mjs";

import path from "node:path";
import { readFile } from "node:fs/promises";
import { errorRecord } from "../operation-errors.mjs";
import { sha256 } from "../runner-events.mjs";

const fail = (message, code) => { throw Object.assign(new Error(message), { code }); };

/** Resolve the retained operator-resume record for a request identity. */
export const evalResumeWorkerFile = (root, requestId) => path.join(path.resolve(root), "control-resumes", `${sha256(requestId)}.json`);

/** Read the retained manifest and its exact bytes without creating a RUN. */
export async function preparedManifest(root) {
  const file = path.join(root, "manifest.json");
  let bytes, manifest;
  try { bytes = await readFile(file, "utf8"); manifest = JSON.parse(bytes); }
  catch (error) { fail(`Cannot read EVAL manifest: ${error instanceof Error ? error.message : String(error)}`, "control_input_invalid"); }
  if (!manifest || typeof manifest !== "object" || !/^(EVAL|QUAL)-[A-Za-z0-9-]+$/.test(manifest.run_id ?? "")) fail("EVAL manifest has no valid run_id", "control_input_invalid");
  return { bytes, manifest };
}

/** Resolve the owned directory of a stable continuation request. */
export const attemptRoot = (root, requestId) => path.join(path.resolve(root), "runner-attempts", sha256(requestId));
/** Resolve the durable attempt record for a stable request. */
export const runnerFile = (root, requestId) => path.join(attemptRoot(root, requestId), "attempt.json");

/** A completed observer awaiting provider reconciliation is not terminal. */
export const continuationTerminal = saved => ["superseded", "recovery_blocked", "failed"].includes(saved.status)
  || saved.status === "completed" && saved.result?.state !== "awaiting_provider";

/** Preserve a primary worker failure when cleanup itself also fails. */
export function workerCleanupFailure(saved, error) {
  return saved.error || ["recovery_blocked", "failed", "waiting_for_user", "superseded"].includes(saved.status)
    ? { cleanup_error: errorRecord(error) }
    : { status: "failed", error: errorRecord(error) };
}

// Physical retirement does not imply that a failed Subject's capture is ready.
const captureReady = result => ["ready", "not_applicable"].includes(result?.cleanup_observation?.capture);
/** Require capture reconciliation before accepting a terminal failed execution. */
export function needsFailureReconciliation(result) {
  return result?.execution_state === "failed" && allExecutionsTerminal(result) && !captureReady(result);
}
const allExecutionsTerminal = result => !["awaiting_provider", "awaiting_native_children", "cancelling"].includes(result?.state)
  && (result?.executions ?? []).every(execution => ["candidate_ready", "failed", "cancelled"].includes(execution.state));

/** Check the distinct completion criteria for retirement and reconciliation. */
export function cleanupGoalComplete(goal, result) {
  return goal === "local_retirement" ? result?.physical_stopped === true
    : result?.cleanup_state === "settled" && captureReady(result);
}

const entrypoint = fileURLToPath(new URL("../eval-resume-worker.mjs", import.meta.url));
const read = async file => JSON.parse(await readFile(file, "utf8"));

async function spawnWorker(file, root, requestId, env) {
  const directory = attemptRoot(root, requestId);
  await mkdir(directory, { recursive: true });
  const stdout = await open(path.join(directory, "stdout.log"), "a", 0o600);
  const stderr = await open(path.join(directory, "stderr.log"), "a", 0o600);
  try {
    const { manifest } = await preparedManifest(root);
    const saved = await read(file);
    const childEnv = saved.intent?.kind === "cleanup" ? maintenanceEnvironment(env) : ownerEnvironment(manifest.profile?.semantic_decisions, manifest.profile?.interaction_judge?.coverage_policy, env);
    const child = spawn(process.execPath, [entrypoint, file], { cwd: root, env: childEnv, detached: true, stdio: ["ignore", stdout.fd, stderr.fd] });
    await once(child, "spawn");
    const identity = (await processSnapshot()).find(item => item.pid === child.pid && !item.zombie);
    await writeJsonAtomic(file, { ...await read(file), owner_pid: child.pid, owner_started_at: identity?.started ?? null,
      spawn_unconfirmed: !identity, spawned_at: new Date().toISOString() });
    child.once("exit", (code, signal) => {
      // Only a surviving parent can know the exit reason. Status never guesses it.
      void withRunnerLock(file, async () => {
        const saved = await read(file);
        await writeJsonAtomic(file, { ...saved, observed_exit: { pid: child.pid, code, signal, at: new Date().toISOString() } });
      }).catch(() => {});
    });
    child.unref();
  } catch (error) {
    await writeJsonAtomic(file, { ...await read(file), status: "failed", error: errorRecord(error) });
    throw error;
  } finally { await stdout.close(); await stderr.close(); }
}

/** Spawn at most one confirmed owner for a retained attempt. */
export async function ensureWorker(file, root, requestId, env) {
  return withRunnerLock(file, async () => {
    const current = await read(file);
    if (continuationTerminal(current)) return;
    if (current.spawn_unconfirmed) fail("Previous worker spawn has no confirmed birth identity; inspect before retry", "process_ownership_unconfirmed");
    if (workerLiveness(current, await processSnapshot()).state === "alive") return;
    await spawnWorker(file, root, requestId, env);
  });
}
