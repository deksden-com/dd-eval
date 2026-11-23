import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, writeFile, rm, symlink, unlink } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { retainedPackComponentFingerprint, assertRetainedPackCompatibility } from '../lib/pack-component-fingerprint.mjs';

const sha = bytes => createHash('sha256').update(bytes).digest('hex');
test('retained pack scope binds participant bytes and complete observed listings', async t => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'dd-eval-t04-pack-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const source = new Map(Object.entries({ 'descriptor.json': '{}', 'stage.mjs': 'stage', 'helper.mjs': 'helper', 'schema.json': 'schema', 'ref.json': 'ref', 'catalog/one.md': 'one', 'other.mjs': 'unrelated' }));
  async function retain() {
    const inventory = [];
    for (const [name, value] of source) {
      const file = path.join(root, 'files', name);
      await mkdir(path.dirname(file), { recursive: true }); await writeFile(file, value);
      inventory.push({ path: name, sha256: sha(value) });
    }
    const bytes = Buffer.from(JSON.stringify({ schema_id: 'dd-flow/flow-pack-bundle@1', descriptor: 'descriptor.json', inventory }));
    await writeFile(path.join(root, 'manifest.json'), bytes);
    return sha(bytes);
  }
  const files = ['descriptor.json', 'helper.mjs', 'ref.json', 'schema.json', 'stage.mjs'].map(name => ({ path: name, sha256: sha(source.get(name)) }));
  const scope = { schema_id: 'dd-flow/pack-component-inputs@1', stages: ['plan'], files, listings: [{ prefix: 'catalog', paths: ['catalog/one.md'] }], access_failures: false };
  const originalManifest = await retain();
  const initial = await retainedPackComponentFingerprint(root, originalManifest, scope);
  assert.equal(initial, sha(JSON.stringify(scope)), 'CLI serialization and eval recomputation agree on exact participant bytes');
  assert.equal(await assertRetainedPackCompatibility({ sourceRoot: root, sourceManifestSha256: originalManifest, targetRoot: root, targetManifestSha256: originalManifest, scope, scopeSha256: initial }), initial);
  await assert.rejects(assertRetainedPackCompatibility({ sourceRoot: root, sourceManifestSha256: originalManifest, targetRoot: root, targetManifestSha256: originalManifest, scope, scopeSha256: '0'.repeat(64) }));
  await assert.rejects(retainedPackComponentFingerprint(root, await retain(), { ...scope, access_failures: true }));
  source.set('other.mjs', 'changed');
  assert.equal(await retainedPackComponentFingerprint(root, await retain(), scope), initial);
  for (const name of ['stage.mjs', 'helper.mjs', 'schema.json', 'ref.json']) {
    const old = source.get(name); source.set(name, `${old} changed`);
    assert.notEqual(await retainedPackComponentFingerprint(root, await retain(), scope), initial);
    source.set(name, old);
  }
  source.set('catalog/two.md', 'two');
  assert.notEqual(await retainedPackComponentFingerprint(root, await retain(), scope), initial);
  source.delete('catalog/two.md');
  const manifestSha = await retain();
  await writeFile(path.join(root, 'files/helper.mjs'), 'tampered');
  await assert.rejects(retainedPackComponentFingerprint(root, manifestSha, scope));
  await unlink(path.join(root, 'files/helper.mjs'));
  await symlink(path.join(root, 'files/stage.mjs'), path.join(root, 'files/helper.mjs'));
  await assert.rejects(retainedPackComponentFingerprint(root, manifestSha, scope));
  await assert.rejects(retainedPackComponentFingerprint(root, '0'.repeat(64), scope));
});
