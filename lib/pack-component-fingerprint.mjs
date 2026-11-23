import { createHash } from 'node:crypto';
import { lstat, readFile } from 'node:fs/promises';
import path from 'node:path';

const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const safe = name => typeof name === 'string' && /^[A-Za-z0-9_-][A-Za-z0-9_.-]*(\/[A-Za-z0-9_-][A-Za-z0-9_.-]*)*$/.test(name)
  && !name.split('/').some(part => part === '.' || part === '..');
const hex = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
const sortedUnique = values => Array.isArray(values) && values.every((value, i) => typeof value === 'string' && (i === 0 || values[i - 1] < value));

/** Recompute an attested CLI scope over a separately admitted retained bundle. The caller owns receipt and RUN authority. */
export async function retainedPackComponentFingerprint(root, expectedManifestSha256, scope) {
  if (!path.isAbsolute(root) || !hex(expectedManifestSha256)) throw new Error('Invalid pack authority');
  async function read(name, limit) {
    if (!safe(name)) throw new Error('Unsafe pack input');
    let current = root;
    if (!(await lstat(current)).isDirectory() || (await lstat(current)).isSymbolicLink()) throw new Error('Unsafe pack root');
    for (const part of name.split('/')) {
      current = path.join(current, part);
      if ((await lstat(current)).isSymbolicLink()) throw new Error('Symbolic pack input');
    }
    const stat = await lstat(current);
    if (!stat.isFile() || stat.size > limit) throw new Error('Invalid pack input');
    return readFile(current);
  }
  const manifestBytes = await read('manifest.json', 1024 * 1024);
  if (sha(manifestBytes) !== expectedManifestSha256) throw new Error('Pack manifest changed');
  const manifest = JSON.parse(manifestBytes);
  if (manifest?.schema_id !== 'dd-flow/flow-pack-bundle@1' || !safe(manifest.descriptor) || !Array.isArray(manifest.inventory) || manifest.inventory.length > 20000) throw new Error('Invalid pack manifest');
  const blobs = new Map(), folded = new Set(); let total = 0;
  for (const item of manifest.inventory) {
    if (!item || !safe(item.path) || !hex(item.sha256) || folded.has(item.path.toLowerCase())) throw new Error('Invalid pack inventory');
    folded.add(item.path.toLowerCase());
    const bytes = await read(`files/${item.path}`, 1024 * 1024);
    total += bytes.length;
    if (total > 32 * 1024 * 1024 || sha(bytes) !== item.sha256) throw new Error('Pack blob changed');
    blobs.set(item.path, bytes);
  }
  for (const name of folded) {
    const parts = name.split('/'); parts.pop();
    while (parts.length) { if (folded.has(parts.join('/'))) throw new Error('Conflicting pack inventory'); parts.pop(); }
  }
  if (scope?.schema_id !== 'dd-flow/pack-component-inputs@1' || !sortedUnique(scope.stages) || !scope.stages.length
    || !Array.isArray(scope.files) || !sortedUnique(scope.files.map(item => item?.path))
    || !Array.isArray(scope.listings) || !sortedUnique(scope.listings.map(item => item?.prefix)) || scope.access_failures !== false) throw new Error('Invalid or incomplete pack component scope');
  const files = scope.files.map(item => {
    if (!safe(item.path) || !hex(item.sha256) || !blobs.has(item.path)) throw new Error('Missing pack component');
    return { path: item.path, sha256: sha(blobs.get(item.path)) };
  });
  if (!files.some(item => item.path === manifest.descriptor)) throw new Error('Scope omits descriptor');
  const base = path.posix.dirname(manifest.descriptor);
  const listings = scope.listings.map(item => {
    if (!safe(item.prefix) || !sortedUnique(item.paths) || item.paths.some(name => !safe(name))) throw new Error('Invalid pack listing');
    const rootPrefix = base === '.' ? item.prefix : `${base}/${item.prefix}`;
    const paths = [...blobs.keys()].filter(name => name.startsWith(`${rootPrefix}/`))
      .map(name => base === '.' ? name : name.slice(base.length + 1)).sort();
    return { prefix: item.prefix, paths };
  });
  return sha(Buffer.from(JSON.stringify({ schema_id: scope.schema_id, stages: scope.stages, files, listings, access_failures: false })));
}

/** Compare an authenticated producer scope to an independently admitted target bundle. */
export async function assertRetainedPackCompatibility({ sourceRoot, sourceManifestSha256, targetRoot, targetManifestSha256, scope, scopeSha256 }) {
  if (!hex(scopeSha256)) throw new Error('Missing pack component scope identity');
  const source = await retainedPackComponentFingerprint(sourceRoot, sourceManifestSha256, scope);
  if (source !== scopeSha256) throw new Error('Pack producer scope differs from retained source');
  const target = await retainedPackComponentFingerprint(targetRoot, targetManifestSha256, scope);
  if (target !== source) throw new Error('Pack component inputs changed');
  return source;
}
