import path from "node:path";
import { readdir } from "node:fs/promises";
import { hitlCoveragePacketContract, interactionCoveragePrompt, interactionGroundedPrompt } from "../hitl-contract.mjs";
import { assertJudgePromptBinding } from "../judge/capacity.mjs";
import { readJson } from "../json-file.mjs";
import { readRegularFile } from "../regular-file.mjs";
import { hashJson, sha256 } from "../runner-events.mjs";

const isObject = value => Boolean(value) && typeof value === "object" && !Array.isArray(value);
const fail = (message, code = "validation") => { throw Object.assign(new Error(message), { code }); };

/** Render the appropriate interaction Judge prompt for a packet. */
export function interactionJudgePrompt(packetFile, packet = null) { return packet?.schema_id === hitlCoveragePacketContract ? interactionCoveragePrompt(packet, packetFile) : interactionGroundedPrompt(packetFile); }
/** Verify the unique retained native Judge chain and original prompt. */
export async function retainedJudgeChain(root, packetFile, expectedSession = null, originalPrompt = null) {
  const files = (await readdir(root)).filter(file => /^capacity-[a-f0-9]{64}\.json$/.test(file));
  if (files.length !== 1) fail("Existing HITL Judge outcome has no unique retained operation", "judge_outcome_unknown");
  const chain = await readJson(path.join(root, files[0])), sessionId = chain.session_id;
  const candidates = originalPrompt === null
    ? [interactionJudgePrompt(packetFile, await readJson(packetFile)), ...(chain.turns ?? []).map(turn => turn.result?.thread?.preview)]
    : [originalPrompt];
  const retained = [...new Set(candidates.filter(value => typeof value === "string" && files[0] === `capacity-${hashJson([sessionId, value])}.json`))];
  if (retained.length !== 1) fail("Retained Judge chain has no unique original prompt evidence", "judge_outcome_unknown");
  const prompt = retained[0];
  if (typeof sessionId !== "string" || !sessionId || expectedSession !== null && expectedSession !== sessionId
    || files[0] !== `capacity-${hashJson([sessionId, prompt])}.json`) fail("Retained Judge Session/prompt identity changed", "judge_evidence_mismatch");
  assertJudgePromptBinding(chain, { sessionId, originalPrompt: prompt,
    continuationPrompt: `Continue the previous Judge task. Read the same packet files ${JSON.stringify([packetFile])} and return only the required JSON object.` });
  return { chain, sessionId, prompt };
}

/** Bind a retained coverage filter to the exact packet. */
export function retainedCoverageFilter(intent, packet) {
  if (!isObject(intent) || intent.packet_sha256 !== hashJson(packet) || !Object.hasOwn(intent, "filter")) fail("Retained native coverage intent changed", "judge_evidence_mismatch");
  return intent.filter;
}

/** Check retained qualification prompt semantics and packet identity. */
export function qualificationPromptMatches(prompt, packetFile, packet = null) {
  if (typeof prompt !== "string") return false;
  if (packet?.schema_id === hitlCoveragePacketContract) return prompt === interactionCoveragePrompt(packet, packetFile);
  const command = prompt.match(/run node ("(?:\\.|[^"\\])*") ("(?:\\.|[^"\\])*") draft\.json/);
  if (!command) return false;
  try {
    const checker = JSON.parse(command[1]);
    return JSON.parse(command[2]) === packetFile && typeof checker === "string" && path.isAbsolute(checker)
      && prompt === interactionGroundedPrompt(packetFile, checker);
  } catch { return false; }
}
/** Recover archived qualification chain without repeating its native turn. */
export async function qualificationNativeChain(root, packetFile, sessionId) {
  const packet = await readJson(packetFile);
  const files = (await readdir(root)).filter(name => /^capacity-[a-f0-9]{64}\.json$/.test(name));
  if (files.length !== 1) fail("Archived Judge outcome has no unique native operation", "definition_qualification_invalid");
  const chain = await readJson(path.join(root, files[0]));
  if (!Array.isArray(chain.turns) || !chain.turns.length) fail("Retained Judge has no native turns", "definition_qualification_invalid");
  const prompts = [interactionJudgePrompt(packetFile, packet), ...chain.turns.map(turn => turn.result?.thread?.preview)].filter(prompt => typeof prompt === "string" && sha256(prompt) === chain.turns[0]?.prompt_sha256);
  const prompt = prompts[0];
  // Old checkout paths may differ; only the exact original prompt hash and
  // current instruction body authorize reuse, never a guessed replacement.
  if (!prompt) fail("Retained Judge has no original prompt evidence; do not repeat it", "definition_qualification_outcome_unknown");
  if (!qualificationPromptMatches(prompt, packetFile, packet)) return null;
  return await retainedJudgeChain(root, packetFile, sessionId, prompt);
}

/** Bind a qualification sample to its retained Judge receipt and chain. */
export async function qualificationSample(item, operation, profile, fixtureHash) {
  const receipt = await readJson(item.receipt_file), root = path.dirname(item.receipt_file);
  const native = await qualificationNativeChain(root, path.join(root, "packet.json"), receipt.session_id);
  if (!native) fail("Retained Judge prompt cannot be verified", "definition_qualification_invalid");
  const { chain, prompt } = native;
  return { ...item, judge_profile: profile, fixture_sha256: fixtureHash ?? receipt.interaction_fixture_sha256, original_item_id: item.original_item_id ?? item.id, operation: item.operation ?? operation,
    original_prompt: prompt, receipt_sha256: sha256(await readRegularFile(item.receipt_file)), chain_sha256: hashJson(chain) };
}
