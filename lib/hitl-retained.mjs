import path from 'node:path';
import { hashJson, sha256 } from './runner-events.mjs';
import { assertJudgeCleanup } from './judge-cleanup.mjs';
import { hitlMatchContract, hitlCoverageContract, validateGroundedHitl } from './hitl-contract.mjs';
import { verifyJevReceipt } from './hitl-coverage.mjs';
import { readRegularFile as regularBytes } from './regular-file.mjs';

const mismatch = (message, details) => { throw Object.assign(new Error(message), { code: 'judge_evidence_mismatch', details }); };
const same = (left, right) => hashJson(left) === hashJson(right);
const nonempty = value => typeof value === 'string' && value.trim().length > 0;

/** Read-only verification against durable event anchors, never a fresh Judge turn. */
export async function verifyRetainedHitl({ data, fixture = null, expectedStage = null, expectedPauseId = null, expectedScope = null, expectedEvalId = null, legacy = false, historical = false }) {
  try {
    if (!data || typeof data.receipt_file !== 'string' || typeof data.answer_file !== 'string') mismatch('HITL event has no retained receipt/answer');
    const root = path.dirname(data.receipt_file);
    const receiptBytes = await regularBytes(data.receipt_file);
    const receipt = JSON.parse(receiptBytes);
    const packet = JSON.parse(await regularBytes(path.join(root, 'packet.json')));
    const answerBytes = await regularBytes(data.answer_file);
    const answer = answerBytes.toString('utf8');
    for (const [key, expected] of [['stage', expectedStage], ['pause_id', expectedPauseId], ['scope_id', expectedScope]]) {
      if (expected !== null && (key !== 'scope_id' || data[key] !== undefined || ['dd-eval/hitl-match@2', hitlMatchContract, hitlCoverageContract].includes(receipt.verdict?.schema_id)) && data[key] !== expected) mismatch(`HITL event ${key} differs from its caller`, { key });
    }
    if (receipt.stage !== data.stage || packet.stage !== data.stage) mismatch('HITL stage binding changed');
    if (data.judge_session_id && receipt.session_id !== data.judge_session_id) mismatch('HITL Judge Session binding changed');
    if (data.judge_profile && receipt.profile_id !== data.judge_profile) mismatch('HITL Judge profile binding changed');
    if (receipt.packet_sha256 && receipt.packet_sha256 !== hashJson(packet)) mismatch('HITL retained packet changed');
    if (data.packet_sha256 && data.packet_sha256 !== hashJson(packet)) mismatch('HITL event packet anchor changed');
    if (data.receipt_sha256 && data.receipt_sha256 !== sha256(receiptBytes)) mismatch('HITL event receipt anchor changed');
    if (data.answer_sha256 && data.answer_sha256 !== sha256(answerBytes)) mismatch('HITL answer anchor changed');
    const compact = receipt.verdict?.schema_id === hitlCoverageContract;
    if (compact && ((data.eval_run_id ?? null) !== (receipt.eval_run_id ?? null) || expectedEvalId !== null && receipt.eval_run_id !== expectedEvalId)) mismatch('Compact HITL proof belongs to another EVAL');
    const grounded = ['dd-eval/hitl-match@2', hitlMatchContract].includes(receipt.verdict?.schema_id) || compact;
    if (data.verdict_contract !== undefined && data.verdict_contract !== receipt.verdict?.schema_id) mismatch('HITL event contract differs from retained verdict');
    if (receipt.verdict?.schema_id !== hitlMatchContract && !compact && !(historical && grounded) && !(historical && legacy && receipt.verdict?.schema_id === 'dd-eval/hitl-match@1')) mismatch('Historical HITL proof cannot authorize new issuance');
    let verdict = receipt.verdict;
    if (grounded) {
      const http = compact && receipt.decision_source === 'jev';
      if (http ? receipt.schema_id !== 'dd-eval/hitl-coverage-route@1' || data.decision_source !== 'jev' || data.judge_profile !== undefined || data.judge_session_id !== undefined
        : !['dd-eval/interaction-judge-receipt@1', 'dd-eval/interaction-judge-receipt@2'].includes(receipt.schema_id) || ![receipt.packet_sha256, receipt.profile_id, receipt.session_id].every(nonempty)) mismatch('HITL receipt lacks its provider binding');
      if (![data.receipt_sha256, data.packet_sha256, data.answer_sha256, ...(http ? [] : [data.judge_profile, data.judge_session_id])].every(nonempty) || data.verdict_contract !== verdict.schema_id) mismatch('HITL event lacks durable proof anchors');
      if (![data.stage, data.pause_id, data.scope_id].every(nonempty) || !Number.isSafeInteger(data.round) || data.round < 1) mismatch('HITL v2 event scope/round binding is invalid');
      for (const key of ['stage', 'round', 'pause_id', 'scope_id']) {
        if (data[key] === undefined || data[key] === null || packet.hitl_binding?.[key] !== data[key]) mismatch(`HITL packet ${key} binding changed`, { key });
      }
      verdict = validateGroundedHitl(verdict, packet, { stored: true, historical });
      if (http) verdict = await verifyJevReceipt(root, receipt, packet);
      if (compact && !http && (receipt.decision_source !== 'interaction_judge' || data.decision_source !== 'interaction_judge')) mismatch('Compact native source identity changed');
    } else if (verdict?.schema_id !== 'dd-eval/hitl-match@1' || verdict.classification !== 'covered_by_canonical_response'
      || !Array.isArray(verdict.covered_questions) || !verdict.covered_questions.length
      || !Array.isArray(verdict.uncovered_questions) || verdict.uncovered_questions.length) {
      mismatch('Historical matched HITL verdict is inconsistent');
    }
    if (!verdict || verdict.status !== (compact ? 'covered' : 'matched') || !Array.isArray(verdict.response_ids) || !verdict.response_ids.every(nonempty) || new Set(verdict.response_ids).size !== verdict.response_ids.length || !same(verdict.response_ids, data.response_ids)) mismatch('HITL selected responses differ from matched event');
    if (!Array.isArray(packet.responses) || packet.responses.some(item => !item || !nonempty(item.id) || typeof item.answer !== 'string') || new Set(packet.responses.map(item => item.id)).size !== packet.responses.length) mismatch('HITL packet response map is invalid');
    if (fixture && (!same(fixture.responses.map(({ id, topic, applicability, answer }) => ({ id, topic, applicability, answer })), packet.responses)
      || (receipt.interaction_fixture_sha256 && fixture.sha256 !== receipt.interaction_fixture_sha256))) mismatch('HITL fixture differs from retained packet');
    const responses = new Map(packet.responses.map(item => [item.id, item.answer]));
    if (!verdict.response_ids.length || verdict.response_ids.some(id => typeof responses.get(id) !== 'string')
      || answer !== verdict.response_ids.map(id => responses.get(id)).join('\n\n')) mismatch('HITL answer differs from exact selected canonical bytes');
    const cleanup = receipt.decision_source === 'jev' ? null : await assertJudgeCleanup(root, receipt);
    return { stage: data.stage, round: data.round, pause_id: data.pause_id, scope_id: data.scope_id, question: packet.question,
      interaction_fixture_sha256: receipt.interaction_fixture_sha256, judge_profile: receipt.profile_id, judge_session_id: receipt.session_id,
      receipt_file: data.receipt_file, verdict, response_ids: verdict.response_ids, delimiter: 'dd-eval/hitl-response-delimiter@1', answer,
      answer_file: data.answer_file, answer_sha256: data.answer_sha256 ?? sha256(answerBytes),
      ...(grounded ? { receipt_sha256: data.receipt_sha256, packet_sha256: data.packet_sha256, verdict_contract: data.verdict_contract } : { proof_level: 'legacy' }), ...(compact ? { decision_source: receipt.decision_source, eval_run_id: receipt.eval_run_id ?? null, coverage_filter: receipt.coverage_filter ?? null } : {}), cleanup };
  } catch (error) {
    if (error.code?.startsWith('judge_')) throw error;
    mismatch('HITL retained evidence cannot be read', { cause: { code: error.code, message: error.message } });
  }
}
