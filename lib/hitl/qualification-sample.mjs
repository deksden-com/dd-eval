import path from "node:path";
import { realpath } from "node:fs/promises";
import { semanticContextHash } from "../entry-pack.mjs";
import { checkObservedProfile } from "../evidence/model-observations.mjs";
import { assertTargetSession, qualificationJudgeInput } from "../harness/driver-bindings.mjs";
import { hitlCoverageContract, hitlMatchContract, hitlCoveragePacketContract, hitlPacketContract, buildHitlPacket, validateGroundedHitl } from "../hitl-contract.mjs";
import { collectHitlSources } from "./sources.mjs";
import { assertJudgeVerdict } from "../judge/cleanup.mjs";
import { judgeTurnText, parseJsonResponse } from "../judge/judge-receipt.mjs";
import { readJson } from "../json-file.mjs";
import { errorRecord } from "../operation-errors.mjs";
import { readRegularFile } from "../regular-file.mjs";
import { hashJson, sha256 } from "../runner-events.mjs";
import { renderedQualificationContext, qualificationGrounding } from "./qualification-context.mjs";
import { hitlQualificationHome } from "./qualification-home.mjs";
import { qualificationComparison } from "./qualification-contract.mjs";
import { qualificationPromptMatches, retainedJudgeChain } from "./judge-retained.mjs";

const isObject = value => Boolean(value) && typeof value === "object" && !Array.isArray(value);
const fail = (message, code = "validation") => { throw Object.assign(new Error(message), { code }); };

/** Revalidate owned qualification evidence, original native turn and verdict. */
export async function verifyQualificationSample(qualified, corpusItem, item, { requirePassed = true } = {}) {
  try {
    if (typeof item.receipt_file !== "string") fail("HITL item receipt is missing", "definition_qualification_invalid");
    const stage = corpusItem.stage ?? qualified.corpus.stage, fixture = qualified.fixtures[stage];
    const operation = item.operation, home = hitlQualificationHome();
    if (typeof operation !== "string" || !path.isAbsolute(operation) || !operation.startsWith(`${home}${path.sep}`)
      || !item.receipt_file.startsWith(`${path.join(operation, "interaction-judge")}${path.sep}`)) fail("HITL receipt is not owned by its original qualification operation", "definition_qualification_invalid");
    const operationReal = await realpath(operation), homeReal = await realpath(home), receiptReal = await realpath(item.receipt_file);
    if (!operationReal.startsWith(`${homeReal}${path.sep}`) || !receiptReal.startsWith(`${operationReal}${path.sep}interaction-judge${path.sep}`)) fail("HITL qualification evidence escapes its retained home", "definition_qualification_invalid");
    const verdict = await readJson(item.receipt_file);
    if (verdict.schema_id !== "dd-eval/interaction-judge-receipt@1" || verdict.profile_id !== item.judge_profile?.id || verdict.interaction_fixture_sha256 !== item.fixture_sha256 || verdict.stage !== stage || !isObject(verdict.verdict)
      || sha256(await readRegularFile(item.receipt_file)) !== item.receipt_sha256 || hashJson(verdict.verdict) !== hashJson(item.observed)) fail("HITL item verdict differs from its retained native result", "definition_qualification_invalid");
    const packet = await readJson(path.join(path.dirname(item.receipt_file), "packet.json"));
    if (verdict.packet_sha256 !== hashJson(packet) || packet.schema_id !== (qualified.compact ? hitlCoveragePacketContract : hitlPacketContract) || packet.stage !== stage || packet.question !== corpusItem.question || !Array.isArray(packet.responses)
      || hashJson(packet.responses) !== hashJson(fixture.responses)) fail("HITL item packet differs from its corpus question/fixture", "definition_qualification_invalid");
    const context = qualified.contexts[corpusItem.id];
    if (context) {
      const rendered = packet.subject_context;
      if (!rendered || rendered.source_context_sha256 !== semanticContextHash(context.context)) fail("HITL packet lacks its bound context", "definition_qualification_invalid");
      const retainedRoot = rendered.roots?.project;
      const ownedRoot = path.join(operation, "contexts", "inputs", sha256(item.original_item_id));
      if (retainedRoot !== ownedRoot) fail("HITL context root is not the owned qualification snapshot", "definition_qualification_invalid");
      const expected = renderedQualificationContext(context.context, retainedRoot);
      if (hashJson(rendered) !== hashJson(expected)) fail("HITL packet context differs from authored inputs", "definition_qualification_invalid");
      const rootReal = await realpath(retainedRoot);
      if (!rootReal.startsWith(`${operationReal}${path.sep}`)) fail("HITL retained snapshot escaped", "definition_qualification_invalid");
      try {
        const collected = await collectHitlSources(rendered);
        if (hashJson(qualificationGrounding(collected, retainedRoot)) !== hashJson(Object.fromEntries(["sources", "directories", "unavailable", "entries"].map(key => [key, context.binding[key]])))) fail("HITL retained snapshot membership or grounding changed", "definition_qualification_invalid");
      } catch (error) { fail(`HITL retained source cannot be verified: ${error.message}`, "definition_qualification_invalid"); }
    } else if (packet.subject_context != null) fail("Unexpected context in contextless HITL packet", "definition_qualification_invalid");
    const rebuilt = await buildHitlPacket({ stage, question: corpusItem.question, subjectContext: packet.subject_context, responses: fixture.responses, readRegularFile, verdictContract: qualified.compact ? hitlCoverageContract : hitlMatchContract });
    if (hashJson(packet.grounding_sources) !== hashJson(rebuilt.grounding_sources) || hashJson(packet.directory_sources) !== hashJson(rebuilt.directory_sources) || hashJson(packet.unavailable_sources ?? []) !== hashJson(rebuilt.unavailable_sources ?? [])) fail("HITL frozen grounding differs from authored source bytes", "definition_qualification_invalid");
    const packetFile = path.join(path.dirname(item.receipt_file), "packet.json");
    if (!qualificationPromptMatches(item.original_prompt, packetFile, packet)) fail("Retained Judge instruction semantics changed", "definition_qualification_invalid");
    const { chain } = await retainedJudgeChain(path.dirname(item.receipt_file), packetFile, verdict.session_id, item.original_prompt);
    if (hashJson(chain) !== item.chain_sha256 || chain.turns.at(-1)?.state !== "completed") fail("HITL observation lacks its original completed native Turn", "definition_qualification_invalid");
    const paid = chain.turns.at(-1).result;
    assertTargetSession(paid, qualified.profile, ["session", "prompt", "--session-id", verdict.session_id]);
    checkObservedProfile(qualificationJudgeInput(qualified.profile), paid.requested_profile, { strict: true, required: ["model", "reasoning"] });
    // Native provider names describe transport routing, not a model change.
    // Keep requested settings exact; observed model/reasoning must still match.
    checkObservedProfile(qualificationJudgeInput(qualified.profile), paid.observed_profile, { strictFields: ["model", "reasoning"], required: ["model", "reasoning"] });
    const observed = validateGroundedHitl(parseJsonResponse(judgeTurnText(paid, qualified.profile), "Interaction Judge"), packet);
    // The native atoms are authoritative. Aggregates were computed by the old
    // validator and are re-derived now, never rewritten in its old receipt.
    if (observed.schema_id !== verdict.verdict.schema_id || hashJson(qualified.compact ? observed : observed.atoms) !== hashJson(qualified.compact ? verdict.verdict : verdict.verdict.atoms)) fail("HITL verdict differs from its original native final", "definition_qualification_invalid");
    const comparison = await qualificationComparison(qualified, corpusItem, observed, item.receipt_file);
    if (requirePassed && !comparison.passed) fail("HITL item verdict is malformed or lost an expected atom", "definition_qualification_invalid");
    await assertJudgeVerdict(path.dirname(item.receipt_file), verdict);
    return { ...item, comparison, assessment_observed: observed };
  } catch (error) {
    if (error.code === "definition_qualification_invalid") throw error;
    throw Object.assign(new Error(`Retained HITL observation cannot be verified: ${error.message}`), { code: "definition_qualification_invalid", details: { receipt_file: item.receipt_file, cause: errorRecord(error) } });
  }
}
