import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readFile, rm, mkdir } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { hashJson, sha256 } from '../lib/runner-events.mjs';
import { verifyRetainedHitl } from '../lib/hitl-retained.mjs';
import { settledJudge } from './fixtures/judge-cleanup.mjs';
import { buildHitlPacket, validateGroundedHitl, hitlCoverageContract } from '../lib/hitl-contract.mjs';
import { semanticQuestion } from '../lib/semantic-decisions.mjs';

async function retained(t) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'hitl-retained-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const packet = { schema_id: 'dd-eval/interaction-judge-packet@1', stage: 'SPECIFY', question: 'Which default?', responses: [{ id: 'default', topic: 'default', applicability: 'default question', answer: 'Normal\r\nunchanged' }] };
  const verdict = { schema_id: 'dd-eval/hitl-match@1', status: 'matched', classification: 'covered_by_canonical_response', response_ids: ['default'], covered_questions: ['Which default?'], uncovered_questions: [], rationale: 'Canonical default' };
  const receipt = { schema_id: 'dd-eval/interaction-judge-receipt@1', stage: 'SPECIFY', profile_id: 'judge', session_id: 'session', packet_sha256: hashJson(packet), verdict };
  await writeFile(path.join(root, 'packet.json'), JSON.stringify(packet));
  await settledJudge(root, receipt);
  const answer_file = path.join(root, 'answer.md');
  await writeFile(answer_file, packet.responses[0].answer);
  const data = { stage: 'SPECIFY', round: 1, pause_id: 'pause', judge_session_id: 'session', response_ids: ['default'], receipt_file: path.join(root, 'result.json'), answer_file, answer_sha256: sha256(packet.responses[0].answer) };
  return { root, packet, receipt, data };
}

test('historical HITL exact bytes remain readable but cannot authorize current issuance', async t => {
  const { data } = await retained(t);
  const evidence = await verifyRetainedHitl({ data, legacy: true, historical: true, expectedStage: 'SPECIFY', expectedPauseId: 'pause', expectedScope: 'e2e' });
  assert.equal(evidence.answer, 'Normal\r\nunchanged');
  assert.equal(evidence.proof_level, 'legacy');
  await assert.rejects(verifyRetainedHitl({ data: { ...data, scope_id: 'other' }, legacy: true, historical: true, expectedScope: 'e2e' }), { code: 'judge_evidence_mismatch' });
  await assert.rejects(verifyRetainedHitl({ data }), { code: 'judge_evidence_mismatch' });
});

test('native HITL reuse binds immutable effective Judge settings, not only its ID', async t => {
  const { root, receipt, data } = await retained(t);
  const expected = 'a'.repeat(64);
  await assert.rejects(verifyRetainedHitl({ data, legacy: true, historical: true, expectedProfileSha256: expected }), { code: 'judge_evidence_mismatch' });
  await rm(path.join(root, 'cleanup.json'));
  await settledJudge(root, { ...receipt, profile_sha256: expected });
  assert.equal((await verifyRetainedHitl({ data, legacy: true, historical: true, expectedProfileSha256: expected })).answer, 'Normal\r\nunchanged');
  await assert.rejects(verifyRetainedHitl({ data, legacy: true, historical: true, expectedProfileSha256: 'b'.repeat(64) }), { code: 'judge_evidence_mismatch' });
});

test('retained verifier rejects altered answer, packet, selection and caller binding', async t => {
  const { root, packet, data } = await retained(t);
  await assert.rejects(verifyRetainedHitl({ data, legacy: true, historical: true, expectedPauseId: 'other' }), { code: 'judge_evidence_mismatch' });
  await assert.rejects(verifyRetainedHitl({ data: { ...data, response_ids: ['other'] }, legacy: true, historical: true }), { code: 'judge_evidence_mismatch' });
  await assert.rejects(verifyRetainedHitl({ data, legacy: true, historical: true, fixture: { responses: [{ ...packet.responses[0], answer: 'Changed' }] } }), { code: 'judge_evidence_mismatch' });
  await writeFile(data.answer_file, 'Changed');
  await assert.rejects(verifyRetainedHitl({ data, legacy: true, historical: true }), { code: 'judge_evidence_mismatch' });
  await writeFile(data.answer_file, packet.responses[0].answer);
  await writeFile(path.join(root, 'packet.json'), JSON.stringify({ ...packet, question: 'Changed' }));
  await assert.rejects(verifyRetainedHitl({ data, legacy: true, historical: true }), { code: 'judge_evidence_mismatch' });
});

test('event receipt anchor and cleanup are independently checked', async t => {
  const { root, data } = await retained(t);
  const anchored = { ...data, receipt_sha256: sha256(await readFile(data.receipt_file)) };
  await assert.rejects(verifyRetainedHitl({ data: { ...anchored, receipt_sha256: 'changed' }, legacy: true, historical: true }), { code: 'judge_evidence_mismatch' });
  await rm(path.join(root, 'cleanup.json'));
  await assert.rejects(verifyRetainedHitl({ data: anchored, legacy: true, historical: true }), { code: 'judge_cleanup_unconfirmed' });
});

test('v3 proof requires event anchors and exact scope/round binding', async t => {
  const { root, packet: oldPacket, data } = await retained(t);
  const packet = await buildHitlPacket({ stage: data.stage, question: 'Which default?', responses: oldPacket.responses });
  packet.hitl_binding = { stage: data.stage, round: 1, pause_id: 'pause', scope_id: 'e2e' };
  const verdict = validateGroundedHitl({ schema_id: 'dd-eval/hitl-match@3', atoms: [{ source_quote: packet.question, decision: 'Required default', classification: 'covered_by_canonical_response', reference_bindings: [], scope_evidence: [], answer_evidence: [{ response_id: 'default', answer_quote: 'Normal' }], rationale: 'Default is specified' }] }, packet);
  await writeFile(path.join(root, 'packet.json'), JSON.stringify(packet));
  await rm(path.join(root, 'cleanup.json'));
  await settledJudge(root, { schema_id: 'dd-eval/interaction-judge-receipt@2', stage: data.stage, profile_id: 'judge', session_id: 'session', packet_sha256: hashJson(packet), verdict });
  const anchored = { ...data, judge_profile: 'judge', scope_id: 'e2e', receipt_sha256: sha256(await readFile(data.receipt_file)), packet_sha256: hashJson(packet), verdict_contract: verdict.schema_id };
  assert.equal((await verifyRetainedHitl({ data: anchored, expectedScope: 'e2e' })).verdict.schema_id, verdict.schema_id);
  for (const changed of [{ receipt_sha256: null }, { packet_sha256: 'changed' }, { round: 2 }, { scope_id: 'other' }, { judge_profile: undefined }, { judge_session_id: undefined }, { verdict_contract: 'dd-eval/hitl-match@1' }]) {
    await assert.rejects(verifyRetainedHitl({ data: { ...anchored, ...changed } }), { code: 'judge_evidence_mismatch' });
  }
});

test('retained reads reject nonregular files and legacy cannot downgrade an anchored contract', async t => {
  const { root, data } = await retained(t);
  await assert.rejects(verifyRetainedHitl({ data: { ...data, verdict_contract: 'dd-eval/hitl-match@3' }, legacy: true, historical: true }), { code: 'judge_evidence_mismatch' });
  const directory = path.join(root, 'directory');
  await mkdir(directory);
  for (const key of ['answer_file', 'receipt_file']) {
    await assert.rejects(verifyRetainedHitl({ data: { ...data, [key]: directory }, legacy: true, historical: true }), { code: 'judge_evidence_mismatch' });
  }
});

test('anchored historical v2 is readable only explicitly and cannot authorize current replay', async t => {
  const { root, data, packet: oldPacket } = await retained(t);
  const built = await buildHitlPacket({ stage: data.stage, question: 'Which default?', responses: oldPacket.responses });
  const { directory_sources: _directories, ...packet } = built;
  packet.schema_id = 'dd-eval/interaction-judge-packet@2';
  packet.hitl_binding = { stage: data.stage, round: 1, pause_id: 'pause', scope_id: 'e2e' };
  packet.required_result.schema_id = 'dd-eval/hitl-match@2'; delete packet.required_result.atoms[0].scope_evidence;
  const raw = { schema_id: 'dd-eval/hitl-match@2', atoms: [{ source_quote: packet.question, decision: 'Required default', classification: 'covered_by_canonical_response', reference_bindings: [], answer_evidence: [{ response_id: 'default', answer_quote: 'Normal' }], rationale: 'Default is specified' }] };
  const verdict = validateGroundedHitl(raw, packet, { historical: true });
  await writeFile(path.join(root, 'packet.json'), JSON.stringify(packet)); await rm(path.join(root, 'cleanup.json'));
  await settledJudge(root, { schema_id: 'dd-eval/interaction-judge-receipt@2', stage: data.stage, profile_id: 'judge', session_id: 'session', packet_sha256: hashJson(packet), verdict });
  const anchored = { ...data, judge_profile: 'judge', scope_id: 'e2e', receipt_sha256: sha256(await readFile(data.receipt_file)), packet_sha256: hashJson(packet), verdict_contract: verdict.schema_id };
  assert.equal((await verifyRetainedHitl({ data: anchored, historical: true })).verdict.schema_id, 'dd-eval/hitl-match@2');
  await assert.rejects(verifyRetainedHitl({ data: anchored }), { code: 'judge_evidence_mismatch' });
  await assert.rejects(verifyRetainedHitl({ data: anchored, legacy: true }), { code: 'judge_evidence_mismatch' });
  await assert.rejects(verifyRetainedHitl({ data: { ...anchored, packet_sha256: null }, historical: true }), { code: 'judge_evidence_mismatch' });
});

test('historical duplicated response IDs cannot repeat canonical answer bytes', async t => {
  const { root, data, receipt } = await retained(t);
  await rm(path.join(root, 'cleanup.json'));
  await settledJudge(root, { ...receipt, verdict: { ...receipt.verdict, response_ids: ['default', 'default'] } });
  const answer = 'Normal\r\nunchanged\n\nNormal\r\nunchanged';
  await writeFile(data.answer_file, answer);
  await assert.rejects(verifyRetainedHitl({ data: { ...data, response_ids: ['default', 'default'], answer_sha256: sha256(answer) }, legacy: true, historical: true }), { code: 'judge_evidence_mismatch' });
});

test('semantic route replay binds normalized observation and exact canonical bytes without native cleanup', async t => {
  const { root, data: oldData, packet: oldPacket } = await retained(t);
  const packet = await buildHitlPacket({ stage: 'SPECIFY', question: 'Which default?', responses: oldPacket.responses, verdictContract: hitlCoverageContract });
  packet.hitl_binding = { stage: 'SPECIFY', round: 1, pause_id: 'pause', scope_id: 'e2e' };
  const policy = { enabled: true, provider: 'openai-decisions', model: 'gpt-6-luna', min_confidence: 0.93, max_retries: 2 };
  const dependency = 'a'.repeat(64), evalRunId = 'EVAL-retained';
  const fixtureHash = 'b'.repeat(64);
  const sourceBinding = { packet_sha256: hashJson(packet), fixture_sha256: fixtureHash, operation_id: 'retained-op', generation: 1 };
  const response = { schema_id: 'dd-eval/semantic-answer@1', answers: [{ id: 'uncovered', status: 'answered', value: false, probability_true: 0.07, confidence: 1 - 0.07 }],
    metadata: { provider: 'OpenAI', requested_model: 'gpt-6-luna', returned_model: 'gpt-6-luna', resolved_snapshot: null, request_id: null, usage: {} } };
  const observation = { schema_id: 'dd-eval/semantic-observation@1', identity: { binding: packet.hitl_binding, source_binding: sourceBinding, eval_run_id: evalRunId,
    request_sha256: hashJson(semanticQuestion(packet)), policy_sha256: hashJson(policy), dependency_sha256: dependency }, state: 'completed',
    attempts: [{ ordinal: 1, token: 'retained-owner', owner_pid: 1, owner_started: 'retained-start', dispatched_at: '2026-10-07T12:00:00Z',
      finished_at: '2026-10-07T12:00:01Z', state: 'completed', response, response_sha256: hashJson(response) }], response, response_sha256: hashJson(response) };
  const verdict = { schema_id: hitlCoverageContract, status: 'covered', response_ids: ['default'], uncovered_questions: [] };
  const receipt = { schema_id: 'dd-eval/hitl-coverage-route@2', decision_source: 'semantic_decision', stage: 'SPECIFY', eval_run_id: evalRunId,
    interaction_fixture_sha256: fixtureHash, source_binding: sourceBinding, packet_sha256: hashJson(packet), policy, policy_sha256: hashJson(policy), dependency_sha256: dependency,
    observation_sha256: hashJson(observation), verdict, answer_sha256: sha256(packet.responses[0].answer), delimiter: 'dd-eval/hitl-response-delimiter@1' };
  await writeFile(path.join(root, 'packet.json'), JSON.stringify(packet));
  await writeFile(path.join(root, 'semantic-observation.json'), JSON.stringify(observation));
  await writeFile(oldData.receipt_file, JSON.stringify(receipt));
  await rm(path.join(root, 'cleanup.json'));
  const data = { stage: 'SPECIFY', round: 1, pause_id: 'pause', scope_id: 'e2e', eval_run_id: evalRunId, decision_source: 'semantic_decision',
    response_ids: ['default'], receipt_file: oldData.receipt_file, answer_file: oldData.answer_file, answer_sha256: receipt.answer_sha256,
    receipt_sha256: sha256(await readFile(oldData.receipt_file)), packet_sha256: hashJson(packet), verdict_contract: hitlCoverageContract };
  const read = changed => verifyRetainedHitl({ data: { ...data, ...changed }, fixture: { responses: packet.responses, sha256: fixtureHash }, expectedEvalId: evalRunId });
  const retainedProof = await read();
  assert.equal(retainedProof.answer, 'Normal\r\nunchanged'); assert.equal(retainedProof.cleanup, null);
  assert.equal(retainedProof.judge_session_id, undefined);
  for (const changed of [{ judge_profile: 'forged' }, { judge_session_id: 'forged' }, { eval_run_id: 'other' }, { decision_source: 'jev' }, { round: 2 }, { receipt_sha256: 'changed' }]) {
    await assert.rejects(read(changed), { code: 'judge_evidence_mismatch' });
  }
  const saveReceipt = async changed => { await writeFile(oldData.receipt_file, JSON.stringify({ ...receipt, ...changed })); return { receipt_sha256: sha256(await readFile(oldData.receipt_file)) }; };
  for (const changed of [{ policy_sha256: 'changed' }, { dependency_sha256: 'b'.repeat(64) }, { observation_sha256: 'changed' }, { interaction_fixture_sha256: 'other' }, { session_id: 'forged' }, { delimiter: 'changed' }]) {
    await assert.rejects(read(await saveReceipt(changed)), { code: 'judge_evidence_mismatch' });
  }
  await saveReceipt({});
  const forged = structuredClone(observation); forged.response.answers[0].confidence = 1;
  forged.response_sha256 = hashJson(forged.response); forged.attempts[0].response_sha256 = forged.response_sha256;
  await writeFile(path.join(root, 'semantic-observation.json'), JSON.stringify(forged));
  await assert.rejects(read(await saveReceipt({ observation_sha256: hashJson(forged) })), { code: 'judge_evidence_mismatch' });
});
