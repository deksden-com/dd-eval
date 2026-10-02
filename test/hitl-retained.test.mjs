import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { hashJson, sha256 } from '../lib/runner-events.mjs';
import { verifyRetainedHitl } from '../lib/hitl-retained.mjs';
import { settledJudge } from './fixtures/judge-cleanup.mjs';
import { buildHitlPacket, validateGroundedHitl } from '../lib/hitl-contract.mjs';

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

test('historical HITL exact bytes remain readable but cannot authorize v2 issuance', async t => {
  const { data } = await retained(t);
  const evidence = await verifyRetainedHitl({ data, legacy: true, expectedStage: 'SPECIFY', expectedPauseId: 'pause', expectedScope: 'e2e' });
  assert.equal(evidence.answer, 'Normal\r\nunchanged');
  assert.equal(evidence.proof_level, 'legacy');
  await assert.rejects(verifyRetainedHitl({ data: { ...data, scope_id: 'other' }, legacy: true, expectedScope: 'e2e' }), { code: 'judge_evidence_mismatch' });
  await assert.rejects(verifyRetainedHitl({ data }), { code: 'judge_evidence_mismatch' });
});

test('retained verifier rejects altered answer, packet, selection and caller binding', async t => {
  const { root, packet, data } = await retained(t);
  await assert.rejects(verifyRetainedHitl({ data, legacy: true, expectedPauseId: 'other' }), { code: 'judge_evidence_mismatch' });
  await assert.rejects(verifyRetainedHitl({ data: { ...data, response_ids: ['other'] }, legacy: true }), { code: 'judge_evidence_mismatch' });
  await assert.rejects(verifyRetainedHitl({ data, legacy: true, fixture: { responses: [{ ...packet.responses[0], answer: 'Changed' }] } }), { code: 'judge_evidence_mismatch' });
  await writeFile(data.answer_file, 'Changed');
  await assert.rejects(verifyRetainedHitl({ data, legacy: true }), { code: 'judge_evidence_mismatch' });
  await writeFile(data.answer_file, packet.responses[0].answer);
  await writeFile(path.join(root, 'packet.json'), JSON.stringify({ ...packet, question: 'Changed' }));
  await assert.rejects(verifyRetainedHitl({ data, legacy: true }), { code: 'judge_evidence_mismatch' });
});

test('event receipt anchor and cleanup are independently checked', async t => {
  const { root, data } = await retained(t);
  const anchored = { ...data, receipt_sha256: sha256(await readFile(data.receipt_file)) };
  await assert.rejects(verifyRetainedHitl({ data: { ...anchored, receipt_sha256: 'changed' }, legacy: true }), { code: 'judge_evidence_mismatch' });
  await rm(path.join(root, 'cleanup.json'));
  await assert.rejects(verifyRetainedHitl({ data: anchored, legacy: true }), { code: 'judge_cleanup_unconfirmed' });
});

test('v2 proof requires event anchors and exact scope/round binding', async t => {
  const { root, packet: oldPacket, data } = await retained(t);
  const packet = await buildHitlPacket({ stage: data.stage, question: 'Which default?', responses: oldPacket.responses });
  packet.hitl_binding = { stage: data.stage, round: 1, pause_id: 'pause', scope_id: 'e2e' };
  const verdict = validateGroundedHitl({ schema_id: 'dd-eval/hitl-match@2', atoms: [{ source_quote: packet.question, decision: 'Required default', classification: 'covered_by_canonical_response', reference_bindings: [], answer_evidence: [{ response_id: 'default', answer_quote: 'Normal' }], rationale: 'Default is specified' }] }, packet);
  await writeFile(path.join(root, 'packet.json'), JSON.stringify(packet));
  await rm(path.join(root, 'cleanup.json'));
  await settledJudge(root, { schema_id: 'dd-eval/interaction-judge-receipt@2', stage: data.stage, profile_id: 'judge', session_id: 'session', packet_sha256: hashJson(packet), verdict });
  const anchored = { ...data, scope_id: 'e2e', receipt_sha256: sha256(await readFile(data.receipt_file)), packet_sha256: hashJson(packet), verdict_contract: verdict.schema_id };
  assert.equal((await verifyRetainedHitl({ data: anchored, expectedScope: 'e2e' })).verdict.schema_id, verdict.schema_id);
  for (const changed of [{ receipt_sha256: null }, { packet_sha256: 'changed' }, { round: 2 }, { scope_id: 'other' }, { verdict_contract: 'dd-eval/hitl-match@1' }]) {
    await assert.rejects(verifyRetainedHitl({ data: { ...anchored, ...changed } }), { code: 'judge_evidence_mismatch' });
  }
});
