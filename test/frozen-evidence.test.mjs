import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import { mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import { ownedFile, optionalFile } from '../lib/cases/frozen-evidence.mjs';

test('frozen evidence rejects traversal and symlinks, while only missing files are optional', async t => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'eval-frozen-evidence-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  await writeFile(path.join(root, 'source'), 'evidence');
  await symlink('source', path.join(root, 'link'));
  assert.equal((await ownedFile(root, 'source')).text, 'evidence');
  assert.equal(await optionalFile(root, 'missing'), null);
  await assert.rejects(ownedFile(root, '../foreign'), /invalid snapshot-relative/);
  await assert.rejects(optionalFile(root, 'link'), /symlinked evidence/);
});
