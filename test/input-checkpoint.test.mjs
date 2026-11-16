import test from 'node:test';
import assert from 'node:assert/strict';
import { loadInputCheckpoint } from '../lib/cases/input-checkpoint.mjs';
import { loadCase } from '../lib/runner.mjs';

test('checkpoint loader rejects invalid pins and preserves loaded case identity', async () => {
  await assert.rejects(loadInputCheckpoint({ id: '../escape', sha256: 'a'.repeat(64) }), /valid input_checkpoint/);
  await assert.rejects(loadInputCheckpoint({ id: 'cp-nonexistent-qualification-test', sha256: 'a'.repeat(64) }), { code: 'input_checkpoint_missing' });
  const loaded = await loadCase('sdlc-eval-2026-summer-task-priority');
  const checkpoint = await loadInputCheckpoint(loaded.value.input_checkpoint);
  assert.equal(checkpoint.sha256, loaded.inputCheckpoint.sha256);
  await assert.rejects(loadInputCheckpoint({ ...loaded.value.input_checkpoint, sha256: '0'.repeat(64) }), { code: 'input_checkpoint_checksum_mismatch' });
});
