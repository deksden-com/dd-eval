import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { materializeHitlAnswer, acceptedHitlAnswer } from '../lib/hitl/answer-evidence.mjs';
import { sha256 } from '../lib/runner-events.mjs';

test('retained answers are idempotent and reject changed bytes', async t => {
  const attempt = await mkdtemp(path.join(os.tmpdir(), 'eval-hitl-answer-'));
  t.after(() => rm(attempt, { recursive: true, force: true }));
  const input = { attempt, stage: 'specify', round: 1, answer: 'accepted answer' };
  const answerFile = await materializeHitlAnswer(input);
  assert.equal(await materializeHitlAnswer(input), answerFile);
  assert.equal((await acceptedHitlAnswer({ answerFile, answerSha256: sha256(input.answer) })).text, input.answer);
  await assert.rejects(materializeHitlAnswer({ ...input, answer: 'different' }), { code: 'judge_evidence_mismatch' });
  await assert.rejects(acceptedHitlAnswer({ answerFile, answerSha256: 'bad' }), { code: 'hitl_answer_checksum_mismatch' });
  await assert.rejects(acceptedHitlAnswer({ answerFile: path.join(attempt, 'missing') }), { code: 'hitl_answer_missing' });
});
