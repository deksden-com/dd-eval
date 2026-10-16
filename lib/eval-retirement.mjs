import path from "node:path";
import { mkdir, readFile, readdir, realpath } from "node:fs/promises";
import { listHomes, registryEnvironment } from "./homes.mjs";
import { hashJson, readEvents, reduceEvents, sha256, writeJsonAtomic } from "./runner-events.mjs";
import { commandJson } from "./process-json.mjs";
import { withRunnerLock } from "./runner-lock.mjs";
import { errorRecord } from "./operation-errors.mjs";
import { executionState } from "./execution-state.mjs";
import { processSnapshot } from "./process-snapshot.mjs";
import { verifyEngineArtifact } from "./engine-admission.mjs";
import { setTimeout as delay } from "node:timers/promises";

const fail = (message, code = "runtime_scope_identity_missing", details) => { throw Object.assign(new Error(message), { code, details }); };
const read = async file => JSON.parse(await readFile(file, "utf8"));
const terminal = state => ["finished", "completed", "completed_with_failures", "failed", "cancelled", "stopped"].includes(state);
export function retirementEligible(manifest, events) {
  const state = reduceEvents(events);
  if (state.control?.mode === "stop" || state.cancellation) return true;
  const current = (manifest.executions ?? []).map(execution => executionState(events, manifest.run_id, execution));
  if (current.some(item => !["candidate_ready", "failed", "cancelled"].includes(item.result.state))) return false;
  return terminal(state.state) || current.length > 0 && current.every(item => ["failed", "cancelled"].includes(item.result.state));
}
export function maintenanceEnvironment(env = process.env) {
  const result = { ...env }; delete result.OPENROUTER_API_KEY; delete result.OPENAI_DECISIONS_API_KEY; return result;
}
export async function cleanupBinding(root, manifest, options = {}) {
  root = path.resolve(root);
  if (await realpath(root) !== root || !/^(EVAL|QUAL)-[A-Za-z0-9-]+$/.test(manifest.run_id ?? "")) fail("Cleanup requires a canonical EVAL identity");
  for (const value of [manifest.runtime_resource_home, manifest.runtime_control_bin]) if (!path.isAbsolute(value ?? "")) fail("Cleanup has no retained runtime identity");
  const resource = path.resolve(manifest.runtime_resource_home);
  if (await realpath(resource) !== resource) fail("Cleanup resource home is not canonical");
  if (options.maintenanceBin && !options.maintenanceHome) fail("--maintenance-bin requires --maintenance-home", "control_request_invalid");
  if (manifest.runtime_control_home !== undefined && manifest.kind !== "qualification-owner") fail("External retained runtime requires qualification ownership");
  const home = options.maintenanceHome ?? manifest.runtime_control_home ?? path.join(root, "control-runtime");
  let bin = options.maintenanceBin ?? manifest.runtime_control_bin, engineSha = null;
  if (![home, bin].every(value => path.isAbsolute(value) && !value.includes("\0"))) fail("Maintenance paths must be absolute", "control_request_invalid");
  if (manifest.kind === "qualification-owner" || options.maintenanceHome && home !== (manifest.runtime_control_home ?? path.join(root, "control-runtime"))) {
    // A private shim exports its own resource-home and would silently redirect
    // fallback away from the target registry. Use its exact verified payload CLI.
    const adapters = await realpath(path.join(home, "harness-runtime"));
    const dist = path.dirname(adapters), engineRoot = path.dirname(dist);
    const engine = await read(path.join(engineRoot, "engine.json"));
    engineSha = await verifyEngineArtifact(engine, engineRoot);
    if (manifest.kind === "qualification-owner" && home === manifest.runtime_control_home) {
      const retained = manifest.runtime_engine;
      if (!retained || ["package_name", "package_version", "engine_version"].some(key => retained[key] !== engine[key])
        || (retained.integrity_checksum ?? retained.integrity?.checksum) !== engineSha) fail("Qualification runtime differs from retained artifact", "runtime_contract_incompatible");
    }
    const executable = path.join(dist, "cli.js");
    if (options.maintenanceBin && options.maintenanceBin !== path.join(home, "bin", "dd-flow") && await realpath(options.maintenanceBin) !== await realpath(executable)) fail("Maintenance CLI differs from selected artifact", "runtime_contract_incompatible");
    bin = executable;
  }
  // The selected runtime must exist; no global executable substitution.
  await realpath(bin); await realpath(home);
  return { eval_root: root, run_id: manifest.run_id, manifest_sha256: sha256(await readFile(path.join(root, "manifest.json"))), resource_home: resource,
    retained_control_bin: manifest.runtime_control_bin, retained_control_home: manifest.runtime_control_home ?? path.join(root, "control-runtime"),
    maintenance_home: home, maintenance_bin: bin, ...(engineSha ? { engine_sha256: engineSha } : {}) };
}
export async function cleanupInventory(root, manifest, options = {}, call = commandJson) {
  const binding = await cleanupBinding(root, manifest, options);
  const env = maintenanceEnvironment({ ...registryEnvironment(manifest), DD_FLOW_HOME: binding.maintenance_home,
    DD_FLOW_BIN: binding.maintenance_bin, DD_FLOW_RESOURCE_HOME: binding.resource_home, DD_FLOW_ENGINE_MODE: "1" });
  const invoke = (action, args = []) => call(binding.maintenance_bin, ["runtime", "scope", action, "--scope-id", binding.run_id, ...args], { cwd: binding.eval_root, env });
  const inventory = await invoke("status");
  if (inventory.scope_id !== binding.run_id || !Array.isArray(inventory.processes) || !Array.isArray(inventory.provider_turns)) fail("Cleanup inventory has another scope", "runtime_scope_inventory_invalid");
  for (const record of inventory.processes) {
    let metadata; try { metadata = JSON.parse(record.metadata_json); } catch { fail("Invalid process registration", "runtime_scope_inventory_invalid"); }
    if (metadata?.budget?.scope_id !== binding.run_id) fail("Process is outside the retained scope", "runtime_scope_inventory_invalid");
  }
  const stopProcess = record => call(binding.maintenance_bin, ["runtime", "process", "stop", "--id", record.id, "--lease-token", record.lease_token, "--grace-ms", "500"], { cwd: binding.eval_root, env });
  return { binding, inventory, invoke, stopProcess };
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
      physical_stopped: physical, native_settled: receipt.settled === true, capture: "unmodified", inventory: after, receipt, ...(controlError ? { control_error: controlError } : {}),
      storage: { state: "operator_verification_required", automatic_stop: false, reason: "No explicit last-consumer storage proof in process scope" } };
  });
}

export async function cleanupSidecars(root) {
  const directory = path.join(root, "runner-attempts");
  const names = await readdir(directory).catch(error => error.code === "ENOENT" ? [] : Promise.reject(error));
  const output = [];
  for (const name of names.filter(name => /^[a-f0-9]{64}$/.test(name)).sort()) {
    let saved;
    try { saved = await read(path.join(directory, name, "attempt.json")); }
    catch (error) { if (error.code === "ENOENT") continue; throw error; }
    if (saved.schema_id !== "dd-eval/resume-worker@1" || saved.intent?.eval_root !== root) fail("Invalid cleanup sidecar identity", "control_request_conflict");
    if (saved.intent.kind === "cleanup") output.push(saved);
  }
  return output;
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
        const events = await readEvents(path.join(root, "events.jsonl"));
        const eligible = retirementEligible(manifest, events);
        // Nonterminal neighbours remain active, never infer abandonment by age.
        if (eligible) output.push({ root, manifest });
    }
  }
  return output;
}

/** Fence preparation, not provider execution. Reserve launch identity before unlock. */
export async function withPriorEvalRetirement({ caseId, resourceHome, excludeRoot = null, env = process.env, maintenanceHome, maintenanceBin }, action, dependencies = {}) {
  const discover = dependencies.discover ?? priorEvalOwners, call = dependencies.call ?? commandJson;
  let candidates = await discover({ caseId, excludeRoot, env });
  const homes = [...new Set([resourceHome, ...candidates.map(item => item.manifest.runtime_resource_home)])].sort();
  for (const home of homes) {
    if (!path.isAbsolute(home ?? "")) fail("Prior EVAL has no resource identity");
    await mkdir(path.join(home, "locks"), { recursive: true, mode: 0o700 });
    if (await realpath(home) !== path.resolve(home)) fail("Resource lock escaped its canonical home");
    if (await realpath(path.join(home, "locks")) !== path.join(home, "locks")) fail("Retirement lock directory escaped its owned home");
  }
  const locked = async index => {
    if (index < homes.length) return withRunnerLock(path.join(homes[index], "locks", "eval-retirement"), () => locked(index + 1));
    candidates = await discover({ caseId, excludeRoot, env });
    if (candidates.some(item => !homes.includes(item.manifest.runtime_resource_home))) fail("Prior resource inventory changed; retry preparation", "prior_cleanup_pending");
    for (const { root, manifest } of candidates) {
      const { requestRunnerContinuation } = await import("./eval-resume-worker.mjs");
      // Run under the same lifecycle authority as explicit cleanup; no detached
      // worker while holding a lock it needs. Reuse its immutable sidecar intent.
      const requestId = `prelaunch:${sha256(JSON.stringify([root, manifest.run_id, hashJson(manifest), maintenanceHome ?? null, maintenanceBin ?? null]))}`;
      let request;
      do {
        request = await requestRunnerContinuation({ evalRoot: root, kind: "cleanup", requestId,
          maintenanceHome, maintenanceBin, inlineCleanup: true, cleanupCall: call, cleanupOrigin: "prelaunch" });
        if (request.result?.reason === "scope_control_pending") await delay(1000);
      } while (request.result?.reason === "scope_control_pending");
      if (request.result?.physical_stopped !== true) fail("Prior EVAL still has unconfirmed local owners", "prior_cleanup_pending", { eval_root: root, request_id: requestId, cleanup: request.result });
    }
    return action();
  };
  try { return await locked(0); }
  catch (error) { if (error.code === "runner_lock_timeout") fail("Prior cleanup/admission lock is still owned", "prior_cleanup_pending", { cause: errorRecord(error) }); throw error; }
}
