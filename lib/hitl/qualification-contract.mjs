import path from "node:path";
import { qualificationJudgeInput } from "../harness/driver-bindings.mjs";
import { hitlCoverageContract, hitlMatchContract, interactionGroundedPrompt } from "../hitl-contract.mjs";
import { compareCoverageExpectation, compareHitlExpectation } from "../hitl-corpus.mjs";
import { readJson } from "../json-file.mjs";
import { hashJson, sha256 } from "../runner-events.mjs";

/** Schema identifier for the current retained qualification. */
export const hitlQualificationContract = "dd-eval/hitl-qualification@4";

/** Identify the prompt semantics independently of the checkout location. */
export const hitlQualificationPromptVersion = sha256(interactionGroundedPrompt("<packet>", "<checker>"));

/** Build the semantic identity of a qualified Judge task. */
export function qualificationTask({ stage, question, responses, context, grounding, profile, requiredResult, prompt = hitlQualificationPromptVersion }) {
  return { prompt_sha256: prompt, judge: qualificationJudgeInput(profile), stage, question,
    required_result: requiredResult,
    responses: responses.map(({ id, topic, applicability, answer }) => ({ id, topic, applicability, answer })),
    context_sha256: context, grounding };
}

/** Project grounding fields used in qualification identity. */
export function contextGrounding(binding) {
  return binding ? Object.fromEntries(["sources", "directories", "unavailable", "entries"].map(key => [key, binding[key]])) : null;
}

/** Compare a retained verdict to its corpus expectation and optional review. */
export async function qualificationComparison(qualified, item, observed, receiptFile) {
  const responses = qualified.fixtures[item.stage ?? qualified.corpus.stage].responses;
  if (!qualified.compact) return compareHitlExpectation(item, observed, { responses, coverageRequired: true });
  const file = path.join(path.dirname(receiptFile), "coverage-reviews", `${hashJson(item.coverage_expectation)}.json`);
  const review = await readJson(file).catch(error => { if (error.code === "ENOENT") return null; throw error; });
  if (review && (review.schema_id !== "dd-eval/hitl-coverage-review@1" || review.verdict_sha256 !== hashJson(observed)
    || review.expectation_sha256 !== hashJson(item.coverage_expectation) || typeof review.reviewer !== "string" || !review.reviewer.trim()
    || !Array.isArray(review.covered_remaining_ids))) throw Object.assign(new Error("Coverage adjudication is stale or malformed"), { code: "definition_qualification_invalid" });
  return compareCoverageExpectation(item, observed, { responses, review });
}

/** Describe a qualification mismatch with its retained verdict and packet. */
export function qualificationMismatch(input, item, stage, observed, comparison, receiptFile, packetFile = null) {
  return { item_id: item.id, stage, expected: input.compact ? item.coverage_expectation : { classification: item.classification, response_ids: item.response_ids },
    observed: input.compact ? observed : { classification: observed.classification, response_ids: observed.response_ids }, comparison,
    verdict_contract: input.compact ? hitlCoverageContract : hitlMatchContract, qualification_key: input.key, receipt_file: receiptFile,
    packet_file: packetFile ?? path.join(path.dirname(receiptFile), "packet.json") };
}
