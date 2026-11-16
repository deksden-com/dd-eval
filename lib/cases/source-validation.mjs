import path from "node:path";
import { lstat, readFile, realpath, stat } from "node:fs/promises";
import { commandText } from "../process-json.mjs";
import { isSourceSnapshotFlow, isDeliveryFlow, isInstalledFlow } from "../installed-flows.mjs";

import { contained } from "../contained-path.mjs";
import { readJson } from "../json-file.mjs";
import { sha256 } from "../runner-events.mjs";

const isObject = value => Boolean(value) && typeof value === "object" && !Array.isArray(value);
async function exists(file) { try { await stat(file); return true; } catch { return false; } }
const fail = (message, code) => { throw Object.assign(new Error(message), { code }); };

/** Verify that a declared source tag resolves to its pinned commit. */
export async function assertSourceTag(projectRoot, source) {
  if (source.tag === undefined) return;
  if (typeof source.tag !== "string" || !source.tag) fail("source tag must be non-empty", "input_checkpoint_source_tag_mismatch");
  await commandText("git", ["check-ref-format", `refs/tags/${source.tag}`], { cwd: projectRoot });
  const commit = await commandText("git", ["rev-parse", "--verify", `refs/tags/${source.tag}^{commit}`], { cwd: projectRoot });
  if (commit !== source.commit) fail(`source tag ${source.tag} does not match pinned commit ${source.commit}`, "input_checkpoint_source_tag_mismatch");
}

/** Reject a preexisting Memory Bank when the input must be blank. */
export async function assertBlankMemoryProject(projectRoot) {
  try { await lstat(path.join(projectRoot, '.memory-bank')); }
  catch (error) { if (error.code === 'ENOENT') return; throw error; }
  fail("Memory input checkpoint must not already contain a Memory Bank", "input_checkpoint_memory_not_blank");
}

/** Validate the source Memory Bank required by the selected flow. */
export async function assertMemoryInputProject(projectRoot,flowId) {
  if(isSourceSnapshotFlow(flowId) || isDeliveryFlow(flowId)) return; // Preserve source exactly, with or without a Memory Bank.
  if(flowId==='mb-init') return assertBlankMemoryProject(projectRoot);
  const bank=path.join(await realpath(projectRoot),'.memory-bank');
  try {
    for(const directory of [bank,path.join(bank,'dd-flow')]) {
      if(!(await lstat(directory)).isDirectory() || await realpath(directory)!==directory) fail('Upgrade requires its original unlinked Memory Bank','input_checkpoint_memory_invalid');
    }
    for(const file of [path.join(bank,'index.md'),path.join(bank,'dd-flow/manifest.json')])
      if(!(await lstat(file)).isFile()) fail('Upgrade requires original Memory Bank entry and manifest','input_checkpoint_memory_invalid');
  } catch(error) {if(error.code==='ENOENT') fail('Upgrade checkpoint must contain its original Memory Bank','input_checkpoint_memory_missing');throw error;}
}

/** Verify canonical source Git state and checkpoint identity before materialization. */
export async function canonicalSourcePreflight(projectRoot, inputCheckpoint, flow = { id: "sdlc" }) {
  const policyFile = path.join(projectRoot, ".memory-bank", "dd-flow", "project-workspace.json");
  const memory = isInstalledFlow(flow.id);
  if (memory) await assertMemoryInputProject(projectRoot,flow.id);
  const policy = memory ? null : await readJson(policyFile);
  const integrationBranch = isSourceSnapshotFlow(flow.id) ? flow.git_policy?.integration_branch ?? 'main' : memory ? flow.git_policy?.integration_branch : policy?.schema_id === "dd-flow/project-workspace@1" && typeof policy.workspace?.integration_branch === "string" ? policy.workspace.integration_branch : null;
  if (typeof integrationBranch !== "string" || !integrationBranch) fail("Canonical source requires a declared integration branch", "canonical_workspace_policy_invalid");
  const [branch, dirty, head] = await Promise.all([
    commandText("git", ["branch", "--show-current"], { cwd: projectRoot }),
    commandText("git", ["status", "--porcelain"], { cwd: projectRoot }),
    commandText("git", ["rev-parse", "HEAD"], { cwd: projectRoot })
  ]);
  const expectedCommit = inputCheckpoint?.value?.source?.commit;
  if (branch && branch !== integrationBranch) fail(`canonical source must be detached at checkpoint or on ${integrationBranch}`, "canonical_source_workspace_invalid");
  if (dirty) fail("canonical source must be clean", "canonical_source_workspace_invalid");
  if (typeof expectedCommit === "string") {
    if (head !== expectedCommit) fail(`canonical source HEAD does not match input checkpoint ${inputCheckpoint.value.id}`, "input_checkpoint_source_mismatch");
  } else if (branch !== integrationBranch) {
    fail(`canonical source must be a clean ${integrationBranch} integration checkout`, "canonical_source_workspace_invalid");
  }
  await assertSourceTag(projectRoot, inputCheckpoint.value.source);
  return { integration_branch: integrationBranch, head, input_checkpoint: { id: inputCheckpoint.value.id, sha256: inputCheckpoint.sha256, source_commit: expectedCommit } };
}
/**
 * An E2E checkpoint names a project flow pack, not a bare canonical source.
 * Validate only its mechanical contract here; semantic policy remains the
 * responsibility of `dd-flow stage start` once the agent begins the stage.
 */
export async function assertProjectFlowPack(projectRoot, inputCheckpoint) {
  const flow = inputCheckpoint.value.flow_pack;
  const root = contained(projectRoot, flow.path, "input checkpoint flow_pack.path");
  const manifestFile = path.join(root, "manifest.json");
  const missing = [];
  const manifest = await readJson(manifestFile).catch(() => null);
  if (!manifest || manifest.schema_id !== "dd-flow/project-flow-pack-manifest@2") missing.push("manifest.json (dd-flow/project-flow-pack-manifest@2)");
  if (manifest?.pack_version !== flow.memory_bank_version || manifest?.canon_version_at_source_commit !== flow.memory_bank_version) missing.push(`manifest version ${flow.memory_bank_version}`);
  if (!Array.isArray(manifest?.included_files)) missing.push("manifest.included_files");
  else for (const entry of manifest.included_files) {
    try { if (!(await exists(contained(root, entry, "flow manifest included file")))) missing.push(entry); }
    catch { missing.push(String(entry)); }
  }
  for (const [file, schema] of [["project-execution.json", "dd-flow/project-execution@2"], ["project-workspace.json", "dd-flow/project-workspace@1"]]) {
    const value = await readJson(path.join(root, file)).catch(() => null);
    if (file === "project-execution.json" ? ![schema, "dd-flow/project-execution@3"].includes(value?.schema_id) || value.schema_id === "dd-flow/project-execution@3" && !isObject(value.execution) : value?.schema_id !== schema) missing.push(`${file} (${schema})`);
  }
  if (missing.length) {
    const error = new Error(`input checkpoint ${inputCheckpoint.value.id} does not materialize a complete project flow pack: ${missing.join(", ")}`);
    error.code = "input_checkpoint_flow_pack_invalid";
    error.details = { checkpoint_id: inputCheckpoint.value.id, flow_pack_path: flow.path, missing };
    throw error;
  }
  return { root, manifest_sha256: sha256(await readFile(manifestFile)), memory_bank_version: manifest.pack_version };
}
/** Validate the pinned source and flow-pack identity for canonical preparation. */
export async function prepareCanonicalFlowSource(flowRoot, inputCheckpoint, flowId = "sdlc") {
  if (!flowRoot || !path.isAbsolute(flowRoot) || !(await exists(flowRoot))) fail("canonical build requires an existing absolute --flow-root", "canonical_flow_source_required");
  const [flowHead, flowDirty] = await Promise.all([
    commandText("git", ["rev-parse", "HEAD"], { cwd: flowRoot }),
    commandText("git", ["status", "--porcelain"], { cwd: flowRoot })
  ]);
  const expected = inputCheckpoint.value.flow_pack;
  if (flowDirty || flowHead !== expected.commit) fail(`canonical flow source must be clean at input checkpoint flow commit ${expected.commit}`, "input_checkpoint_flow_mismatch");
  const sourceFlow = contained(flowRoot, expected.path, "input checkpoint flow_pack.path");
  if (!(await exists(sourceFlow))) fail(`input checkpoint flow pack is missing: ${expected.path}`, "input_checkpoint_flow_missing");
  if (isInstalledFlow(flowId)) {
    if (expected.delivery !== "installed_canon") fail("Memory checkpoint requires installed canon delivery", "input_checkpoint_flow_pack_invalid");
    if (await realpath(sourceFlow) !== path.join(await realpath(flowRoot), expected.path)) fail("Canonical Memory source escapes its Git checkout", "input_checkpoint_flow_pack_invalid");
    // Source identity only: installation trust and executable descriptor
    // admission belong to setup and the selected CLI, not to this reader.
    const descriptorFile = path.join(sourceFlow, flowId, "flow-descriptor.json");
    if (await realpath(descriptorFile) !== path.join(await realpath(flowRoot), expected.path, flowId, "flow-descriptor.json")) fail("Canonical Memory descriptor escapes its Git checkout", "input_checkpoint_flow_pack_invalid");
    const descriptor = await readJson(descriptorFile);
    if (descriptor.schema_id !== "dd-flow/flow-descriptor@1" || descriptor.id !== flowId || descriptor.origin !== "canon") fail("Memory canonical source identity mismatch", "input_checkpoint_flow_pack_invalid");
  } else {
    if (flowId !== "sdlc" || expected.delivery === "installed_canon") fail("Flow delivery does not match selected workflow", "input_checkpoint_flow_pack_invalid");
    await assertProjectFlowPack(flowRoot, inputCheckpoint);
  }
  return { flowRoot, flowHead, sourceFlow };
}
