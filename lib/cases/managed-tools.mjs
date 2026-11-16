import path from "node:path";
import { commandJson } from "../process-json.mjs";
import { writeJsonAtomic } from "../runner-events.mjs";

const fail = (message, code = "validation") => { const error = new Error(message); error.code = code; throw error; };
const isObject = value => Boolean(value) && typeof value === "object" && !Array.isArray(value);

/** Validate and return the checkpoint's explicitly declared managed tools. */
export function declaredManagedTools(checkpoint) {
  if (checkpoint?.preparation !== undefined && !isObject(checkpoint.preparation)) fail('Checkpoint preparation must be an object', 'input_checkpoint_invalid');
  const tools = checkpoint?.preparation?.managed_tools;
  if (tools === undefined) return [];
  if (!Array.isArray(tools) || new Set(tools).size !== tools.length || tools.some(tool => tool !== 'wt'))
    fail('Checkpoint preparation.managed_tools must be a unique array of supported tools (wt)', 'input_checkpoint_invalid');
  return tools;
}

/** Prepare declared tools and persist their validated receipts in the retained home. */
export async function prepareDeclaredManagedTools({ checkpoint, bin, env, projectRoot }) {
  const receipts = [];
  for (const tool of declaredManagedTools(checkpoint.value)) {
    const receipt = await commandJson(bin, ['tool', 'ensure', tool], { cwd: projectRoot, env });
    if (receipt?.ok !== true || receipt.tool !== tool || typeof receipt.version !== 'string' || typeof receipt.bin !== 'string' || typeof receipt.platform !== 'string'
      || typeof receipt.cache_root !== 'string' || typeof receipt.binary_sha256 !== 'string' || typeof receipt.archive_sha256 !== 'string')
      fail('Managed tool preparation returned an invalid receipt', 'tool_preparation_invalid');
    receipts.push(receipt);
  }
  if (receipts.length && env?.DD_FLOW_HOME) await writeJsonAtomic(path.join(env.DD_FLOW_HOME, 'managed-tools-preparation.json'), { managed_tools: receipts });
  return receipts;
}
