import path from "node:path";
import { lstat, realpath } from "node:fs/promises";
import { commandText } from "../process-json.mjs";
import { isSourceSnapshotFlow, isDeliveryFlow } from "../installed-flows.mjs";

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
