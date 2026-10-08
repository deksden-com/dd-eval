import test from 'node:test';
import assert from 'node:assert/strict';
import { assertJudgeProfileBinding } from '../lib/runner.mjs';
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
