import path from "node:path";
import { lstat, mkdir, realpath } from "node:fs/promises";
import { setTimeout as delay } from "node:timers/promises";
import { hashJson, sha256, writeJsonAtomic } from "../runner-events.mjs";
import { commandJson } from "../process-json.mjs";
import { withRunnerLock } from "../runner-lock.mjs";
import { errorRecord } from "../operation-errors.mjs";
import { blockingCandidates } from "./launch-resources.mjs";
import { priorEvalOwners } from "./prior-owners.mjs";
import { currentRetirementProofs } from "./retirement-proof.mjs";

const fail = (message, code = "runtime_scope_identity_missing", details) => { throw Object.assign(new Error(message), { code, details }); };
/** Fence preparation, not provider execution. Reserve launch identity before unlock. */
export async function withPriorEvalRetirement({ caseId, resourceHome, excludeRoot = null, env = process.env, maintenanceHome, maintenanceBin, signal, onWait, launchResources, inactivityMs = Number(env.DD_EVAL_ADMISSION_INACTIVITY_MS ?? 1_800_000) }, action, dependencies = {}) {
  const discover = dependencies.discover ?? priorEvalOwners, call = dependencies.call ?? commandJson;
  let discovered = await discover({ caseId, excludeRoot, env });
  let candidates = await blockingCandidates(discovered, launchResources);
  let advisory = discovered.filter(item => !candidates.some(blocking => blocking.root === item.root));
  const resourceHomes = [resourceHome, ...candidates.map(item => item.manifest.runtime_resource_home)];
  if (resourceHomes.some(home => !path.isAbsolute(home ?? ""))) fail("Prior EVAL has no resource identity");
  const retained = new Map(await Promise.all(candidates.map(async item => [item.root, await realpath(path.resolve(item.manifest.runtime_resource_home))])));
  const homes = [...new Set([path.resolve(resourceHome), ...retained.values()])].sort();
  for (const home of homes) {
    // Validate the nearest existing ancestor before mkdir can follow a symlink
    // into another resource home. Fresh canonical homes remain valid.
    let ancestor = path.join(home, "locks");
    for (;;) {
      try { await lstat(ancestor); }
      catch (error) { if (error.code !== "ENOENT") throw error; ancestor = path.dirname(ancestor); continue; }
      if (await realpath(ancestor) !== ancestor) fail("Resource lock escaped its canonical home");
      break;
    }
  }
  for (const home of homes) {
    await mkdir(path.join(home, "locks"), { recursive: true, mode: 0o700 });
    if (await realpath(home) !== path.resolve(home)) fail("Resource lock escaped its canonical home");
    if (await realpath(path.join(home, "locks")) !== path.join(home, "locks")) fail("Retirement lock directory escaped its owned home");
  }
  const progressWriters = [];
  let observedWaiting = false;
  const saveWaiting = async observation => {
    observedWaiting = true;
    if (excludeRoot) await writeJsonAtomic(path.join(excludeRoot, "admission-wait.json"), { schema_id: "dd-eval/admission-wait@1", case_id: caseId, ...observation });
    await onWait?.(observation);
  };
  const progress = value => { for (const publish of progressWriters) publish(value); };
  const locked = async index => {
    signal?.throwIfAborted();
    if (index < homes.length) return withRunnerLock(path.join(homes[index], "locks", "eval-retirement"), async ({ progress: publish }) => {
      progressWriters.push(publish);
      try { return await locked(index + 1); } finally { progressWriters.pop(); }
    }, { inactivityMs, signal, onWait: saveWaiting });
    discovered = await discover({ caseId, excludeRoot, env });
    candidates = await blockingCandidates(discovered, launchResources);
    advisory = discovered.filter(item => !candidates.some(blocking => blocking.root === item.root));
    progress({ phase: "discovered", roots: candidates.map(item => item.root) });
    for (const item of candidates) {
      if (!path.isAbsolute(item.manifest.runtime_resource_home ?? "")) fail("Prior resource inventory changed; retry preparation", "prior_cleanup_pending");
      const target = await realpath(path.resolve(item.manifest.runtime_resource_home));
      if (!homes.includes(target) || retained.has(item.root) && retained.get(item.root) !== target) fail("Prior resource inventory changed; retry preparation", "prior_cleanup_pending");
      retained.set(item.root, target);
    }
    const reusable = await currentRetirementProofs(candidates, retained, maintenanceHome, maintenanceBin, call, progress);
    progress({ phase: "proofs_observed", reusable: [...reusable.keys()] });
    for (const { root, manifest } of candidates) {
      if (reusable.has(root)) continue;
      const { requestRunnerContinuation } = await import("../eval-resume-worker.mjs");
      // Run under the same lifecycle authority as explicit cleanup; no detached
      // worker while holding a lock it needs. Reuse its immutable sidecar intent.
      const requestId = `prelaunch:${sha256(JSON.stringify([root, manifest.run_id, hashJson(manifest), maintenanceHome ?? null, maintenanceBin ?? null]))}`;
      let request;
      do {
        signal?.throwIfAborted();
        request = await requestRunnerContinuation({ evalRoot: root, kind: "cleanup", requestId,
          maintenanceHome, maintenanceBin, inlineCleanup: true, cleanupOrigin: "prelaunch", cleanupCall: (bin, args, options) => {
            if (options?.env?.DD_FLOW_RESOURCE_HOME !== retained.get(root)) fail("Cleanup left its locked resource home", "prior_cleanup_pending");
            return call(bin, args, options);
          } });
        if (request.result?.reason === "scope_control_pending") await delay(1000, undefined, { signal });
      } while (request.result?.reason === "scope_control_pending");
      if (request.result?.physical_stopped !== true) fail("Prior EVAL still has unconfirmed local owners", "prior_cleanup_pending", { eval_root: root, request_id: requestId, cleanup: request.result });
      progress({ phase: "physical_stopped", root, request_id: requestId });
    }
    return action();
  };
  try {
    const result = await locked(0);
    if (observedWaiting) try { await saveWaiting({ state: "admitted", remaining_ms: 0 }); }
    catch { process.stderr.write('Admission accepted; wait notification unavailable\n'); }
    // Independent historical cleanup does not hold the launch admission lock.
    for (const { root, manifest } of advisory) {
      try {
        const requestRunnerContinuation = dependencies.requestCleanup ?? (await import('../eval-resume-worker.mjs')).requestRunnerContinuation;
        await requestRunnerContinuation({ evalRoot: root, kind: 'cleanup', requestId: `advisory:${sha256(JSON.stringify([root, manifest.run_id, hashJson(manifest)]))}`,
          cleanupOrigin: 'prelaunch', maintenanceHome, maintenanceBin });
      } catch (error) {
        try { await onWait?.({ state: 'advisory_cleanup_pending', eval_root: root, error: errorRecord(error) }); }
        catch { process.stderr.write('Admission accepted; advisory cleanup notification unavailable\n'); }
      }
    }
    return result;
  }
  catch (error) {
    if (["runner_lock_timeout", "process_ownership_unknown"].includes(error.code)) {
      if (error.details) await saveWaiting(error.details);
      fail(error.code === 'process_ownership_unknown' ? "Prior cleanup/admission owner observation is unavailable" : "Prior cleanup/admission lock is live or unconfirmed", "prior_cleanup_pending", { cause: errorRecord(error), waiting: error.details });
    }
    if (observedWaiting && signal?.aborted) await saveWaiting({ state: "cancelled", remaining_ms: 0 });
    throw error;
  }
}
