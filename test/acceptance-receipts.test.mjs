import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { attachCaseAcceptance } from '../lib/cases/acceptance-receipts.mjs';

test('acceptance receipts are reused only while retained bytes remain valid', async t => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'eval-acceptance-receipt-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const manifest = { case_id: 'sdlc-eval-2026-summer-task-priority', case_acceptance: { case_id: 'sdlc-eval-2026-summer-task-priority', checker: 'task-priority@1' } };
  const results = [{ execution: 'e2e', state: 'failed', stage: 'code' }];
  await attachCaseAcceptance(root, manifest, results);
  const first = results[0].case_acceptance;
  assert.equal(first.receipt.status, 'not_applicable');
  await attachCaseAcceptance(root, manifest, results);
  assert.deepEqual(results[0].case_acceptance, first);
  const saved = JSON.parse(await readFile(first.file, 'utf8'));
  await writeFile(first.file, JSON.stringify({ ...saved, status: 'passed' }));
  await assert.rejects(attachCaseAcceptance(root, manifest, results), { code: 'case_acceptance_receipt_invalid' });
});
