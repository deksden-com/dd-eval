import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('SPECIFY comparison profiles share Subject, fallback and bounded scope without legacy policy', async () => {
  const names = ['specify-luna-judge-only', 'specify-luna-jev', 'specify-luna-openai-decisions'];
  const profiles = await Promise.all(names.map(async name => JSON.parse(await readFile(new URL(`../cases/sdlc-eval-2026-summer-task-priority/run-profiles/${name}.json`, import.meta.url)))));
  for (const [index, profile] of profiles.entries()) {
    assert.equal(profile.id, names[index]);
    assert.equal(profile.schema_id, 'dd-eval/run-profile@2');
    assert.equal(profile.operational_decision.acceptance.reference, profile.id);
    assert.deepEqual(profile.subject, profiles[0].subject);
    assert.deepEqual(profile.interaction_judge, profiles[0].interaction_judge);
    assert.equal(profile.interaction_judge.verdict_contract, 'dd-eval/hitl-coverage@1');
    assert.equal(profile.interaction_judge.coverage_policy, undefined);
    assert.equal(profile.judge.enabled, false);
    assert.deepEqual(profile.selection, { focused_stages: [], segment: null, e2e: true, repetitions: 1, stop_after: 'specify' });
    assert.deepEqual(profile.concurrency, { global: 1, per_harness: { 'codex-desktop': 1 } });
    assert.equal(profile.semantic_decisions.enabled, index > 0);
    if (index > 0) { assert.equal(profile.semantic_decisions.min_confidence, 0.93); assert.equal(profile.semantic_decisions.max_retries, 2); }
  }
  assert.equal(profiles[1].semantic_decisions.provider, 'openrouter-decisions');
  assert.equal(profiles[1].semantic_decisions.model, 'typesafe/jev-1.13');
  assert.equal(profiles[2].semantic_decisions.provider, 'openai-decisions');
  assert.equal(profiles[2].semantic_decisions.model, 'gpt-6-luna');
  const subject = JSON.parse(await readFile(new URL(`../profiles/${profiles[0].subject.profile_id}.json`, import.meta.url)));
  const judge = JSON.parse(await readFile(new URL(`../profiles/${profiles[0].interaction_judge.profile_id}.json`, import.meta.url)));
  assert.equal(subject.model, 'gpt-6-luna'); assert.equal(subject.reasoning, 'xhigh');
  assert.equal(judge.model, 'gpt-6.1-sol'); assert.equal(judge.reasoning, 'high');
});
