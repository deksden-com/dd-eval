import { hashJson } from "../runner-events.mjs";
import { hitlMatchContract, hitlCoverageContract, validateGroundedHitl } from "../hitl-contract.mjs";

const fail = (message, code = "validation") => { const error = new Error(message); error.code = code; throw error; };
/** Separator for multiple canonical responses in one HITL answer. */
export const hitlResponseDelimiter = "\n\n";

/**
 * Resolve a grounded Judge verdict against the exact fixture, question and stage.
 * @param {object} input Fixture, judgment, question and stage.
 * @returns {object} Bound exchange and canonical answer; throws for unmatched or unproven verdicts.
 */
export function resolveHitlJudgment({ fixture, judgment, question, stage }) {
  const packet = judgment.packet;
  if (!packet || packet.question !== question || packet.stage !== stage || hashJson(packet.responses) !== hashJson(fixture.responses.map(({ id, topic, applicability, answer }) => ({ id, topic, applicability, answer }))) || ![hitlMatchContract, hitlCoverageContract].includes(judgment.verdict?.schema_id)) fail("Interaction Judge has no bound grounded packet", "judge_result_invalid");
  judgment = { ...judgment, verdict: validateGroundedHitl(judgment.verdict, packet, { stored: true }) };
  const compact = judgment.verdict.schema_id === hitlCoverageContract;
  const exchange = { stage, question, interaction_fixture_sha256: fixture.sha256, ...(compact ? { decision_source: judgment.decision_source ?? "interaction_judge", coverage_filter: judgment.coverage_filter ?? null } : {}), ...(judgment.profile ? { judge_profile: judgment.profile, judge_session_id: judgment.session_id } : {}), receipt_file: judgment.receipt_file, verdict: judgment.verdict,
    ...(judgment.proof ? { ...packet.hitl_binding, ...judgment.proof } : {}) };
  if (judgment.verdict.status !== (compact ? "covered" : "matched")) {
    if (compact) throw Object.assign(new Error(`Unresolved HITL coverage at ${stage}: ${judgment.verdict.status}`), { code: "hitl_coverage_unresolved", hitl: exchange, details: { stage, status: judgment.verdict.status, uncovered_questions: judgment.verdict.uncovered_questions, receipt_file: judgment.receipt_file } });
    const code = judgment.verdict.classification === "fixture_gap" ? "interaction_fixture_gap" : judgment.verdict.classification === "ambiguous" ? "interaction_judge_ambiguous" : "unmatched_hitl";
    const error = new Error(`Interaction Judge could not match HITL at ${stage}: ${judgment.verdict.classification}`); error.code = code; error.hitl = exchange; throw error;
  }
  const responses = new Map(fixture.responses.map((response) => [response.id, response.answer]));
  return { ...exchange, response_ids: judgment.verdict.response_ids, delimiter: "dd-eval/hitl-response-delimiter@1", answer: judgment.verdict.response_ids.map((id) => responses.get(id)).join(hitlResponseDelimiter) };
}
