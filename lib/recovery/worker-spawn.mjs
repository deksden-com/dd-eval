import { spawn } from "node:child_process";
import { mkdir, open, readFile } from "node:fs/promises";
import { once } from "node:events";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { errorRecord } from "../operation-errors.mjs";
import { processSnapshot } from "../process-snapshot.mjs";
import { writeJsonAtomic } from "../runner-events.mjs";
import { withRunnerLock } from "../runner-lock.mjs";
import { ownerEnvironment } from "../semantic-decisions.mjs";
import { maintenanceEnvironment } from "../eval-retirement.mjs";
import { workerLiveness } from "./eval-worker-status.mjs";
import { preparedManifest, attemptRoot, continuationTerminal } from "./worker-attempt.mjs";

const entrypoint = fileURLToPath(new URL("../eval-resume-worker.mjs", import.meta.url));
const read = async file => JSON.parse(await readFile(file, "utf8"));
const fail = (message, code) => { throw Object.assign(new Error(message), { code }); };

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

