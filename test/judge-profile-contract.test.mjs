import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { assertJudgeProfileBinding } from '../lib/runner.mjs';
import { parseJsonResponse, judgeExecutionArgs, judgeTurnEvidence } from '../lib/judge/judge-receipt.mjs';
import { assertJudgeVerdict } from '../lib/judge/cleanup.mjs';

test('Judge response parsing and execution arguments preserve their contract', () => {
  assert.deepEqual(parseJsonResponse('```json\n{"result":true}\n```', 'Judge'), { result: true });
  assert.throws(() => parseJsonResponse('not JSON', 'Judge'), { code: 'judge_result_invalid' });
  assert.deepEqual(judgeExecutionArgs({ model: 'm', reasoning: 'high', provider: 'p', permission: 'allow' }), ['--model', 'm', '--reasoning', 'high', '--provider', 'p', '--permission', 'allow']);
});

test('Judge observation is checked against the retained completed native Turn', async t => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'judge-turn-evidence-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const profile = { id: 'judge', harness: 'codex-desktop', model: 'model', reasoning: 'xhigh' };
  const response = { provider_session_id: 'session', turn_id: 'turn', turn: { id: 'turn', status: 'completed' }, observed_profile: { model: 'model', reasoning: 'xhigh' } };
  const receipt = { profile_id: profile.id, profile_snapshot: profile, session_id: 'session', turn_observation: judgeTurnEvidence(response, profile, 'session') };
  const save = (name, value) => writeFile(path.join(root, name), JSON.stringify(value));
  await save('result.json', receipt);
  const chain = { session_id: 'session', turns: [{ state: 'completed', result: response }] };
  await save(`capacity-${'a'.repeat(64)}.json`, chain);
  await assertJudgeVerdict(root, receipt);
  chain.turns[0].result.observed_profile.reasoning = 'low';
  await save(`capacity-${'a'.repeat(64)}.json`, chain);
  await assert.rejects(assertJudgeVerdict(root, receipt), { code: 'judge_evidence_mismatch' });
});

test('Judge Turn evidence distinguishes native settings from requested settings', () => {
  const profile = { harness: 'codex-desktop', model: 'expected', reasoning: 'xhigh' };
  const response = { provider_session_id: 'session', turn_id: 'turn', turn: { id: 'turn', status: 'completed' }, observed_profile: { model: 'actual', reasoning: null } };
  const evidence = judgeTurnEvidence(response, profile, 'session');
  assert.deepEqual(evidence.observed, { model: 'actual', reasoning: null });
  assert.deepEqual(evidence.fields, { model: 'mismatched', reasoning: 'unknown' });
  assert.equal(evidence.turn_id, 'turn');
  assert.equal(evidence.scope, 'adapter_reported_profile_after_turn');
  assert.throws(() => judgeTurnEvidence(response, profile, 'other'), { code: 'judge_evidence_mismatch' });
  assert.throws(() => judgeTurnEvidence({ ...response, turn_id: 'other' }, profile, 'session'), { code: 'judge_turn_identity_invalid' });
  const matched = judgeTurnEvidence({ ...response, observed_profile: { model: 'expected', reasoning: 'xhigh' } }, profile, 'session');
  assert.deepEqual(matched.fields, { model: 'matched', reasoning: 'matched' });
  assert.notEqual(evidence.native_result_sha256, matched.native_result_sha256);
});
import { profileSemanticHash } from '../lib/execution-contract.mjs';

test('Judge reuse is bound to semantic settings, not only a stable profile ID', () => {
  const profile = { id: 'judge', harness: 'codex-desktop', provider: 'openai', model: 'gpt-6.1-sol', reasoning: 'high', mode: 'agent', permission: 'allow' };
  const receipt = { profile_id: profile.id, profile_sha256: profileSemanticHash(profile) };
  assert.equal(assertJudgeProfileBinding(receipt, profile), receipt);
  for (const patch of [{ model: 'old-model' }, { reasoning: 'low' }, { permission: 'ask' }, { provider: 'other' }]) {
    assert.throws(() => assertJudgeProfileBinding(receipt, { ...profile, ...patch }), { code: 'judge_profile_contract_mismatch' });
  }
  assert.throws(() => assertJudgeProfileBinding({ profile_id: profile.id }, profile), { code: 'judge_profile_contract_mismatch' });
  assert.equal(profileSemanticHash({ ...profile, notes: 'documentation changed' }), receipt.profile_sha256);
});
