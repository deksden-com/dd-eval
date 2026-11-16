import path from "node:path";
import { lstat, mkdir, readFile, readdir, realpath } from "node:fs/promises";
import { listHomes } from "./homes.mjs";
import { blockingCandidates } from "./recovery/launch-resources.mjs";
import { cleanupSidecars, currentRetirementProofs } from "./recovery/retirement-proof.mjs";
export { cleanupSidecars, retirementProofMatches } from "./recovery/retirement-proof.mjs";
import { cleanupInventory } from "./recovery/cleanup-binding.mjs";
export { maintenanceEnvironment, cleanupBinding, cleanupInventory } from "./recovery/cleanup-binding.mjs";
export { prepareLaunchResources, launchResourcesConflict } from "./recovery/launch-resources.mjs";
import { hashJson, readEvents, reduceEvents, sha256, writeJsonAtomic } from "./runner-events.mjs";
import { commandJson } from "./process-json.mjs";
import { withRunnerLock } from "./runner-lock.mjs";
import { errorRecord } from "./operation-errors.mjs";
import { executionState } from "./execution/execution-state.mjs";
import { processSnapshot } from "./process-snapshot.mjs";
import { setTimeout as delay } from "node:timers/promises";

const fail = (message, code = "runtime_scope_identity_missing", details) => { throw Object.assign(new Error(message), { code, details }); };
const read = async file => JSON.parse(await readFile(file, "utf8"));
const terminal = state => ["finished", "completed", "completed_with_failures", "failed", "cancelled", "stopped"].includes(state);
export function retirementEligible(manifest, events) {
  const state = reduceEvents(events);
  if (state.control?.mode === "stop" || state.cancellation) return true;
  const current = (manifest.executions ?? []).map(execution => executionState(events, manifest.run_id, execution));
  // A terminal preparation failure can own reservations without ever creating
  // a Subject RUN. Eligibility grants only registry-scoped retirement.
  if (terminal(state.state) && current.every(item => !item.started && !item.result.run_id && !item.result.session_id)) return true;
  if (current.some(item => !["candidate_ready", "failed", "cancelled"].includes(item.result.state))) return false;
  return terminal(state.state) || current.length > 0 && current.every(item => ["failed", "cancelled"].includes(item.result.state));
}
/** Maintenance sidecar only. Never unseals an EVAL journal or runs a Judge. */
export async function retireEval({ evalRoot, intent, call = commandJson }) {
  const root = path.resolve(evalRoot), bytes = await readFile(path.join(root, "manifest.json")), manifest = JSON.parse(bytes);
  if (intent.eval_root !== root || intent.run_id !== manifest.run_id || intent.goal !== "local_retirement" || !["defer", "reconcile"].includes(intent.mode)
    || !/^[a-f0-9]{64}$/.test(intent.target_binding_digest ?? "")) fail("Invalid retained cleanup intent", "control_request_invalid");
  if (sha256(bytes) !== intent.manifest_sha256) fail("Cleanup manifest changed", "runner_definition_drift");
  return withRunnerLock(`${root}.lifecycle`, async () => {
    if (sha256(await readFile(path.join(root, "manifest.json"))) !== intent.manifest_sha256) fail("Cleanup manifest changed under lock", "runner_definition_drift");
    if (intent.origin && intent.origin !== "operator" && !retirementEligible(manifest, await readEvents(path.join(root, "events.jsonl")))) fail("EVAL is no longer eligible for retirement", "prior_cleanup_pending");
    const observed = await cleanupInventory(root, manifest, { maintenanceHome: intent.maintenance_home, maintenanceBin: intent.maintenance_bin }, call);
    if (hashJson(observed.binding) !== intent.target_binding_digest) fail("Cleanup binding changed", "control_request_conflict");
    const { inventory, invoke, stopProcess } = observed;
    if (intent.mode === "defer") {
      const stopping = (await cleanupSidecars(root)).find(saved => saved.intent.request_id !== intent.request_id && saved.intent.mode !== "defer" && ["requested", "observing", "settling", "completed"].includes(saved.status));
      if (stopping) return { code: "stop_already_in_progress", request_id: stopping.intent.request_id, receipt: stopping.result ?? null };
      return { root, run_id: manifest.run_id, cleanup_state: "pending", physical_stopped: null,
        cleanup_deferral: { reason: intent.defer_reason, inventory_sha256: hashJson(inventory), close_before_next_campaign: true }, inventory };
    }
    const processes = inventory.processes.some(record => record.kind === "run-controller") ? await processSnapshot() : [];
    const liveControllers = inventory.processes.filter(record => record.kind === "run-controller" && processes.some(item => item.pid === record.pid && item.started === record.pid_started_at && !item.zombie));
    let controlError;
    if (liveControllers.length && !inventory.fence && !["failed", "recovery_blocked"].includes(inventory.worker?.status)) {
      const scopeManifest = { schema_id: "dd-flow/runtime-scope-manifest@1", scope_id: manifest.run_id,
        manifest_path: path.join(root, "manifest.json"), manifest_sha256: intent.manifest_sha256, execution_ids: manifest.executions.map(item => item.id) };
      try {
        const control = await invoke("control", ["--request-id", intent.request_id, "--mode", "stop", "--manifest-json", JSON.stringify(scopeManifest)]);
        // Do not supersede the RUN drain worker with a terminal scope fence.
        // The same cleanup observer reads its progress on the next iteration.
        return { root, run_id: manifest.run_id, cleanup_state: "pending", physical_stopped: false, native_settled: false, reason: "scope_control_pending", control };
      } catch (error) { controlError = errorRecord(error); }
    }
    if (liveControllers.length) {
      // Existing physical owner API rechecks lease/PID birth. Never signal a PID
      // directly or call this before native drain has failed/been superseded.
      for (const record of liveControllers) await stopProcess(record);
    }
    const receipt = await invoke("stop", ["--request-id", intent.request_id]);
    if (receipt.scope_id !== manifest.run_id || !Array.isArray(receipt.nodes) || typeof receipt.settled !== "boolean"
      || receipt.settled && receipt.nodes.some(node => node.settled !== true)) fail("Invalid scope stop receipt", "runtime_scope_inventory_invalid");
    const after = (await cleanupInventory(root, manifest, { maintenanceHome: intent.maintenance_home, maintenanceBin: intent.maintenance_bin }, call)).inventory;
    const covered = new Set(receipt.nodes.map(node => node.process_id));
    const identity = record => hashJson(Object.fromEntries(["id", "lease_token", "pid", "pid_started_at", "kind", "owner_id", "operation_id", "project_id", "run_id", "work_id", "metadata_json"].map(key => [key, record[key] ?? null])));
    const prior = new Map(inventory.processes.map(record => [record.id, identity(record)]));
    const physical = receipt.physical_stopped === true && after.processes.every(record => covered.has(record.id) && prior.get(record.id) === identity(record));
    return { root, run_id: manifest.run_id, cleanup_state: receipt.settled === true && after.provider_turns.length === 0 ? "settled" : "pending",
      physical_stopped: physical, native_settled: receipt.settled === true, capture: "unmodified", binding: observed.binding, inventory: after, receipt, ...(controlError ? { control_error: controlError } : {}),
      storage: { state: "operator_verification_required", automatic_stop: false, reason: "No explicit last-consumer storage proof in process scope" } };
  });
}

/** Registry-scoped discovery, including historical homes with another resource DB. */
export async function priorEvalOwners({ caseId, excludeRoot = null, env = process.env }) {
  const output = [];
  for (const home of (await listHomes(env)).homes) {
    const roots = new Set(home.run_roots ?? []);
    for (const namespace of ["runs", "forks"]) {
      const directory = path.join(home.root, namespace);
      const names = await readdir(directory).catch(error => error.code === "ENOENT" ? [] : Promise.reject(error));
      for (const name of names.filter(name => /^(EVAL|QUAL)-[A-Za-z0-9-]+$/.test(name))) roots.add(path.join(directory, name));
    }
    for (const root of [...roots].sort()) {
        if (root === excludeRoot) continue;
        let manifest;
        try { manifest = await read(path.join(root, "manifest.json")); } catch (error) { if (error.code === "ENOENT") continue; throw error; }
        if (manifest.case_id !== caseId) continue;
        if (manifest.kind !== "qualification-owner" && !["runtime_resource_home", "runtime_control_bin", "runtime_control_home", "runtime_engine"].some(key => Object.hasOwn(manifest, key))) {
          // Legacy runs have no registered scope to retire. Their journals are
          // evidence, not admission authority; explicit legacy investigation is
          // still required. A retained control runtime must never be hidden.
          try { await lstat(path.join(root, "control-runtime")); }
          catch (error) { if (error.code === "ENOENT") continue; throw error; }
        }
        const events = await readEvents(path.join(root, "events.jsonl"));
        const eligible = retirementEligible(manifest, events);
        // Nonterminal neighbours remain active, never infer abandonment by age.
        if (eligible) output.push({ root, manifest });
    }
  }
  return output;
}

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
      const { requestRunnerContinuation } = await import("./eval-resume-worker.mjs");
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
        const requestRunnerContinuation = dependencies.requestCleanup ?? (await import('./eval-resume-worker.mjs')).requestRunnerContinuation;
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
