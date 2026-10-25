import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { matrixComponentFingerprint } from '../lib/verification-components.mjs';

test('runner proof bytes invalidate only their technical component, and declared proof cannot be omitted', async t => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'proof-component103-')); t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(path.join(root, 'dist/services'), { recursive: true });
  const files = ['verification-matrix', 'stage-report-renderer', 'accepted-intent', 'check-runner-evidence', 'check-runner-proof'].map(name => `services/${name}.js`);
  for (const file of files) await writeFile(path.join(root, 'dist', file), 'export {};');
  const manifest = { schema_id: 'dd-flow/verification-components@1', matrix: { runner_proof_contract: 'dd-flow/check-runner-proof@1', files } };
  const fingerprint = () => matrixComponentFingerprint(root, Buffer.from(JSON.stringify(manifest)));
  const before = await fingerprint();
  await mkdir(path.join(root, 'dist/harness-runtime'), { recursive: true }); await writeFile(path.join(root, 'dist/harness-runtime/native.mjs'), 'native fix');
  assert.equal(await fingerprint(), before);
  await writeFile(path.join(root, 'dist/services/check-runner-proof.js'), 'changed proof'); assert.notEqual(await fingerprint(), before);
  manifest.matrix.files = files.filter(file => file !== 'services/check-runner-proof.js');
  await assert.rejects(fingerprint(), /omits its runner proof/);
});
