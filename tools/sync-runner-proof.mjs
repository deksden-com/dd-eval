import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const [engine, mode = '--check'] = process.argv.slice(2);
if (!engine || !path.isAbsolute(engine) || !['--check', '--write'].includes(mode)) throw new Error('Usage: node tools/sync-runner-proof.mjs <absolute built engine checkout> [--check|--write]');
const sha = value => createHash('sha256').update(value).digest('hex');
const source = await readFile(path.join(engine, 'src/services/check-runner-proof.ts'));
const built = await readFile(path.join(engine, 'dist/services/check-runner-proof.js'));
if (/\bfrom\s+["'](?!node:)/.test(built.toString())) throw new Error('Frozen proof must not import project or npm modules');
const directory = fileURLToPath(new URL('../lib/', import.meta.url));
const metadata = JSON.stringify({ schema_id: 'dd-eval/runner-proof-source@1', source: 'dd-flow-cli/src/services/check-runner-proof.ts', source_sha256: sha(source), build_sha256: sha(built) }) + '\n';
if (mode === '--write') {
  await writeFile(path.join(directory, 'check-runner-proof.mjs'), built);
  await writeFile(path.join(directory, 'check-runner-proof.source.json'), metadata);
} else {
  if (!(await readFile(path.join(directory, 'check-runner-proof.mjs'))).equals(built) || (await readFile(path.join(directory, 'check-runner-proof.source.json'), 'utf8')) !== metadata) throw new Error('Frozen runner proof differs from exact source/build');
}
