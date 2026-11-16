import path from "node:path";
import { readFile, readdir, realpath } from "node:fs/promises";
import { hashJson, sha256 } from "../runner-events.mjs";
import { cleanupBinding, maintenanceEnvironment } from "./cleanup-binding.mjs";

const read = async file => JSON.parse(await readFile(file, "utf8"));
const fail = (message, code = "runtime_scope_identity_missing", details) => { throw Object.assign(new Error(message), { code, details }); };

/** Read cleanup sidecars only under their retained EVAL identity. */
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
/** Reuse only a bound, physically stopped proof matching fresh inventory. */
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
/** Revalidate retained retirement proofs against batched live scope inventory. */
export async function currentRetirementProofs(candidates, retained, maintenanceHome, maintenanceBin, call, progress = () => {}) {
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
