import path from "node:path";
import { lstat, mkdir, readFile, readdir, realpath } from "node:fs/promises";
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
const normalizedHost = host => {
  const value = host.toLowerCase().replace(/^\[|\]$/g, '');
  if (value === 'localhost' || value === 'loopback' || value === '::1' || /^127\.\d+\.\d+\.\d+$/.test(value)) return 'loopback';
  if (value === '0.0.0.0' || value === '::' || value === 'local-wildcard') return 'local-wildcard';
  return value;
};

/** Launch facts only, never credentials or authority to stop a resource. */
async function plannedCanonicalPath(file) {
  const absolute = path.resolve(file);
  let ancestor = absolute;
  for (;;) {
    try { return path.resolve(await realpath(ancestor), path.relative(ancestor, absolute)); }
    catch (error) { if (!['ENOENT', 'ENOTDIR'].includes(error.code) || ancestor === path.dirname(ancestor)) throw error; ancestor = path.dirname(ancestor); }
  }
}
export async function prepareLaunchResources(root, env = process.env) {
  const databases = [], ports = [];
  // DATABASE_URL alone does not attest the service used by test-world setup;
  // its launcher may otherwise select a shared default admin endpoint.
  let complete = Boolean(env.DATABASE_URL && env.DD_TASKS_TEST_ADMIN_URL);
  for (const name of ['DATABASE_URL', 'DD_TASKS_TEST_ADMIN_URL']) {
    if (!env[name]) continue;
    try {
      const url = new URL(env[name]);
      if (!['postgres:', 'postgresql:'].includes(url.protocol) || !url.hostname || !url.pathname.slice(1)) throw new Error('Unknown database binding');
      if ([...url.searchParams.keys()].some(key => ['host', 'hostaddr', 'port', 'service', 'servicefile'].includes(key.toLowerCase()))) complete = false;
      const host = normalizedHost(url.hostname);
      // ponytail: qualify local test-world endpoints only; remote isolation
      // needs prepared resource proof, not a new DNS/network identity resolver.
      if (!['loopback', 'local-wildcard'].includes(host)) complete = false;
      databases.push(JSON.stringify([host, url.port || '5432', decodeURIComponent(url.pathname.slice(1))]));
      if (host === 'loopback' || host === 'local-wildcard') ports.push(url.port || '5432');
    } catch { complete = false; }
  }
  for (const [name, value] of Object.entries(env)) if (/^DD_FLOW_PORT_[A-Z0-9_]+$/.test(name) && value !== undefined) {
    if (!/^\d+$/.test(value) || Number(value) < 1 || Number(value) > 65535) complete = false;
    else ports.push(String(Number(value)));
  }
  let workspace;
  try { workspace = await plannedCanonicalPath(path.resolve(root, 'executions')); }
  catch { complete = false; workspace = path.resolve(root, 'executions'); }
  return { schema_id: 'dd-eval/launch-resources@1', complete, workspaces: [workspace], databases: [...new Set(databases)].sort(), ports: [...new Set(ports)].sort(), native_sessions: [] };
}

function validResources(value) {
  return value?.schema_id === 'dd-eval/launch-resources@1' && value.complete === true
    && ['workspaces', 'databases', 'ports', 'native_sessions'].every(key => Array.isArray(value[key]) && value[key].every(item => typeof item === 'string' && item.length > 0 && !item.includes('\0')))
    && value.workspaces.length > 0 && value.databases.length > 0 && value.workspaces.every(item => path.isAbsolute(item))
    && value.ports.every(item => /^\d+$/.test(item) && String(Number(item)) === item && Number(item) > 0 && Number(item) <= 65535)
    && value.databases.every(item => { try { const parts = JSON.parse(item); return Array.isArray(parts) && parts.length === 3 && parts.every(part => typeof part === 'string' && part.length > 0 && !part.includes('\0'))
      && ['loopback', 'local-wildcard'].includes(parts[0])
      && /^\d+$/.test(parts[1]) && String(Number(parts[1])) === parts[1] && Number(parts[1]) > 0 && Number(parts[1]) <= 65535; } catch { return false; } });
}
export function launchResourcesConflict(left, right) {
  if (!validResources(left) || !validResources(right)) return true;
  const inside = (root, file) => { const rel = path.relative(root, file); return !rel || rel !== '..' && !rel.startsWith(`..${path.sep}`) && !path.isAbsolute(rel); };
  const localPorts = value => [...value.ports, ...value.databases.map(item => JSON.parse(item)[1])];
  return left.workspaces.some(a => right.workspaces.some(b => inside(a, b) || inside(b, a)))
    // A retained cleanup may own the service endpoint, not just one database.
    || left.databases.some(a => right.databases.some(b => { try { return JSON.stringify(JSON.parse(a).slice(0, 2)) === JSON.stringify(JSON.parse(b).slice(0, 2)); } catch { return true; } }))
    || localPorts(left).some(a => localPorts(right).includes(a))
    || left.native_sessions.some(a => right.native_sessions.includes(a));
}

async function blockingCandidates(candidates, launchResources) {
  if (!launchResources) return candidates;
  const canonical = async value => {
    if (!validResources(value)) return null;
    try { return { ...value, workspaces: await Promise.all(value.workspaces.map(plannedCanonicalPath)) }; } catch { return null; }
  };
  const planned = await canonical(launchResources);
  const selected = [];
  for (const item of candidates) {
    let reservation;
    try { reservation = await read(path.join(item.root, 'launch-reservation.json')); }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
    const bound = reservation?.schema_id === 'dd-eval/launch-reservation@1' && reservation?.root === item.root && reservation?.run_id === item.manifest.run_id && reservation?.resource_home === item.manifest.runtime_resource_home;
    if (!bound || launchResourcesConflict(planned, await canonical(reservation.resource_bindings))) selected.push(item);
  }
  return selected;
}
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
export function maintenanceEnvironment(env = process.env) {
  const result = { ...env }; delete result.OPENROUTER_API_KEY; delete result.OPENAI_DECISIONS_API_KEY; return result;
}
export async function cleanupBinding(root, manifest, options = {}) {
  root = path.resolve(root);
  if (await realpath(root) !== root || !/^(EVAL|QUAL)-[A-Za-z0-9-]+$/.test(manifest.run_id ?? "")) fail("Cleanup requires a canonical EVAL identity");
  for (const value of [manifest.runtime_resource_home, manifest.runtime_control_bin]) if (!path.isAbsolute(value ?? "")) fail("Cleanup has no retained runtime identity");
  // Historical campaigns intentionally shared a resource DB through a symlink.
  // The intent binds both immutable manifest bytes and this resolved target;
  // a changed alias therefore cannot authorize stopping another registry.
  const resource = await realpath(path.resolve(manifest.runtime_resource_home));
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
      physical_stopped: physical, native_settled: receipt.settled === true, capture: "unmodified", binding: observed.binding, inventory: after, receipt, ...(controlError ? { control_error: controlError } : {}),
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

// Reuse only a bound physical-stop proof, never a timestamp, PID death, or a
// cached verdict alone. Fresh fenced registry bytes invalidate it on any change.
function inventoryDigest(inventory) {
  if (!inventory || typeof inventory !== "object" || Array.isArray(inventory) || "ok" in inventory && inventory.ok !== true) return null;
  // Single-scope CLI replies carry the transport envelope; batch members do not.
  const { ok: _ok, ...scope } = inventory;
  return hashJson(scope);
}
export function retirementProofMatches(saved, { root, manifest, manifestSha256, resourceHome, inventory }) {
  const { intent, result } = saved ?? {};
  const binding = result?.binding;
  const retainedInventory = inventoryDigest(result?.inventory);
  return saved?.status === "completed" && intent?.kind === "cleanup" && intent.mode === "reconcile"
    && result?.physical_stopped === true && binding?.eval_root === root && binding.run_id === manifest.run_id
    && binding.manifest_sha256 === manifestSha256 && binding.resource_home === resourceHome
    && intent.manifest_sha256 === binding.manifest_sha256 && intent.target_binding_digest === hashJson(binding)
    && inventory?.scope_id === manifest.run_id && inventory.fence?.scope_id === manifest.run_id
    && inventory.dispatch_blocked === true && Array.isArray(inventory.processes) && Array.isArray(inventory.provider_turns)
    && result.receipt?.scope_id === manifest.run_id && retainedInventory !== null && retainedInventory === inventoryDigest(inventory);
}
async function currentRetirementProofs(candidates, retained, maintenanceHome, maintenanceBin, call, progress = () => {}) {
  const reusable = new Map(), byResource = new Map();
  for (const item of candidates) {
    if (await realpath(item.root) !== item.root) fail("Cleanup requires a canonical EVAL identity");
    const bytes = await readFile(path.join(item.root, "manifest.json"));
    if (hashJson(JSON.parse(bytes)) !== hashJson(item.manifest)) fail("Cleanup manifest changed", "runner_definition_drift");
    const proofs = (await cleanupSidecars(item.root)).filter(saved => saved.status === "completed" && saved.result?.binding && saved.result.physical_stopped === true);
    if (!proofs.length) continue;
    const home = retained.get(item.root);
    if (!byResource.has(home)) byResource.set(home, []);
    byResource.get(home).push({ ...item, proofs, manifestSha256: sha256(bytes) });
  }
  if (!byResource.size || !maintenanceHome || !maintenanceBin) return reusable;
  const first = candidates[0];
  const selected = await cleanupBinding(first.root, first.manifest, { maintenanceHome, maintenanceBin });
  for (const [resourceHome, items] of byResource) for (let offset = 0; offset < items.length; offset += 16) {
    // Historical forks can retain the same scope ID at distinct EVAL roots.
    // Query that scope once, but validate each root's own bound proof below.
    const chunk = items.slice(offset, offset + 16), ids = [...new Set(chunk.map(item => item.manifest.run_id))];
    let response;
    try {
      response = await call(selected.maintenance_bin, ["runtime", "scope", "status", "--scope-ids-json", JSON.stringify(ids)], {
        cwd: first.root, env: maintenanceEnvironment({ DD_FLOW_HOME: selected.maintenance_home, DD_FLOW_BIN: selected.maintenance_bin, DD_FLOW_RESOURCE_HOME: resourceHome, DD_FLOW_ENGINE_MODE: "1" })
      });
    } catch (error) { if (error.code === "usage") return new Map(); throw error; }
    if (!Array.isArray(response.scopes) || response.scopes.length !== ids.length || response.scopes.some((scope, index) => scope.scope_id !== ids[index])) fail("Invalid batched scope inventory", "runtime_scope_inventory_invalid");
    chunk.forEach(item => {
      if (item.proofs.some(saved => retirementProofMatches(saved, { root: item.root, manifest: item.manifest, manifestSha256: item.manifestSha256, resourceHome, inventory: response.scopes[ids.indexOf(item.manifest.run_id)] }))) reusable.set(item.root, true);
    });
    progress({ phase: "proof_batch_observed", resource_home: resourceHome, scopes: ids });
  }
  return reusable;
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
