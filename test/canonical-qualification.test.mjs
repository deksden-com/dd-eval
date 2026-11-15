import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { selectedEntries, assertQualificationSelection } from '../lib/runner.mjs';
import * as qualification from '../lib/canonical-qualification.mjs';
import { contained } from '../lib/contained-path.mjs';

test('qualification keeps runner exports and validates retained cell bytes', async t => {
  assert.equal(selectedEntries, qualification.selectedEntries);
  assert.equal(assertQualificationSelection, qualification.assertQualificationSelection);
  const root = await mkdtemp(path.join(os.tmpdir(), 'qualification-cells-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const execution = { id: 'focus-code', mode: 'focused', stage: 'code', terminal_stage: 'code' };
  const state = { case_id: 'fixture', revision: 'REV-1', input_checkpoint: {}, engine: {} };
  const input = { root, state, pack: { hashes: { focused_entries: { code: 'a'.repeat(64) } } }, profile: { value: {}, file: '/profile' }, subject: {}, execution, result: { state: 'candidate_ready' }, qualificationId: 'Q1' };
  const coverage = () => qualification.qualificationCoverage({ ...input, targets: [execution] });
  assert.equal((await coverage())[execution.id].valid, false);
  const record = await qualification.recordQualificationCell(input);
  assert.equal((await coverage())[execution.id].valid, true);
  await writeFile(path.join(root, record.receipt), '{}');
  assert.equal((await coverage())[execution.id].valid, false);
  for (const unsafe of ['../escape', '..\\escape', '/absolute']) assert.throws(() => contained(root, unsafe, 'test'));
});
