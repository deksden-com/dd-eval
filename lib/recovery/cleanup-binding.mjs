import path from "node:path";
import { readFile, realpath } from "node:fs/promises";
import { verifyEngineArtifact } from "../engine-admission.mjs";
import { registryEnvironment } from "../homes.mjs";
import { commandJson } from "../process-json.mjs";
import { sha256 } from "../runner-events.mjs";

const read = async file => JSON.parse(await readFile(file, "utf8"));
const fail = (message, code = "runtime_scope_identity_missing", details) => { throw Object.assign(new Error(message), { code, details }); };

/** Remove optional classifier credentials from maintenance subprocesses. */
export function maintenanceEnvironment(env = process.env) {
  const result = { ...env }; delete result.OPENROUTER_API_KEY; delete result.OPENAI_DECISIONS_API_KEY; return result;
}
/** Bind cleanup to the canonical EVAL, resource home and verified runtime. */
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
/** Observe the retained scope and reject foreign process registrations. */
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
