import { createHash } from 'node:crypto';
import { readFile, lstat, readdir } from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
import process from 'node:process';

export async function matrixComponentFingerprint(snapshotRoot, inventoryBytes = null) {
  const root = path.join(snapshotRoot, 'dist');
  const manifestBytes = inventoryBytes ?? await readFile(path.join(root, 'verification-components.json'));
  const manifest = JSON.parse(manifestBytes), files = manifest.matrix?.files;
  if (manifest.schema_id !== 'dd-flow/verification-components@1' || !Array.isArray(files) || !files.length
    || new Set(files).size !== files.length || !['services/verification-matrix.js', 'services/stage-report-renderer.js', 'services/accepted-intent.js', 'services/check-runner-evidence.js'].every(file => files.includes(file))) throw new Error('Invalid matrix component inventory');
  if (manifest.matrix.runner_proof_contract !== undefined && (manifest.matrix.runner_proof_contract !== 'dd-flow/check-runner-proof@1' || !files.includes('services/check-runner-proof.js'))) throw new Error('Matrix component inventory omits its runner proof contract');
  const hash = createHash('sha256').update(manifestBytes).update(JSON.stringify({ node: process.version, sqlite: process.versions.sqlite, platform: process.platform, arch: process.arch }));
  for (const file of files.slice().sort()) {
    if (typeof file !== 'string' || path.isAbsolute(file) || file.split(/[\\/]/).some(part => !part || part === '..' || part === '.')) throw new Error('Unsafe component input');
    let current = root;
    for (const part of file.split('/')) { current = path.join(current, part); if ((await lstat(current)).isSymbolicLink()) throw new Error('Symbolic component input'); }
    hash.update(file).update('\0').update(await readFile(current)).update('\0');
  }
  // Production dependencies are actual installed bytes, not semver claims.
  async function packageBytes(directory) {
    for (const item of (await readdir(directory, { withFileTypes: true })).sort((a,b) => a.name.localeCompare(b.name))) {
      if (item.name === 'node_modules') continue;
      if (item.isSymbolicLink()) throw new Error('Symbolic component dependency');
      const file = path.join(directory, item.name), name = path.relative(snapshotRoot, file);
      if (item.isDirectory()) await packageBytes(file);
      else if (item.isFile()) hash.update(name).update('\0').update(await readFile(file)).update('\0');
    }
  }
  const visited = new Set();
  async function dependency(specifier, from = path.join(root, 'cli.js'), optional = false) {
    const parts = specifier.split('/'), name = specifier.startsWith('@') ? parts.slice(0, 2).join('/') : parts[0];
    if (!/^(?:@[a-z0-9_.-]+\/)?[a-z0-9_.-]+$/i.test(name)) throw new Error('Unsafe component dependency name');
    for (const directory of createRequire(from).resolve.paths(name) ?? []) {
      const candidate = path.join(directory, name), relative = path.relative(snapshotRoot, candidate);
      if (relative.startsWith('..') || path.isAbsolute(relative)) continue;
      let bytes;
      try { bytes = await readFile(path.join(candidate, 'package.json')); } catch (error) { if (error.code === 'ENOENT') continue; throw error; }
      if ((await lstat(candidate)).isSymbolicLink()) throw new Error('Symbolic component package');
      if (visited.has(candidate)) return;
      visited.add(candidate); await packageBytes(candidate);
      const pkg = JSON.parse(bytes);
      for (const item of Object.keys({ ...pkg.dependencies, ...pkg.optionalDependencies, ...pkg.peerDependencies }).sort()) await dependency(item, path.join(candidate, 'package.json'), Object.hasOwn(pkg.optionalDependencies ?? {}, item) || pkg.peerDependenciesMeta?.[item]?.optional === true);
      return;
    }
    if (optional) { hash.update(`absent-optional:${name}`); return; }
    throw new Error(`Missing matrix dependency: ${name}`);
  }
  if (!Array.isArray(manifest.matrix.dependencies ?? []) || (manifest.matrix.dependencies ?? []).some(item => typeof item !== 'string')) throw new Error('Invalid matrix dependency inventory');
  for (const item of manifest.matrix.dependencies ?? []) await dependency(item);
  return hash.digest('hex');
}
