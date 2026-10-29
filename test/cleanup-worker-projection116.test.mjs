import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile, rm, realpath } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { sha256 } from '../lib/runner-events.mjs';

// Execute the actual worker entrypoint and ownership checks. Only its external
// operations are stand-ins: no provider, retirement, or productive lease exists.
for (const projectionFails of [false, true]) test(`retired cleanup worker projects without productive lease (projection failure: ${projectionFails})`, { timeout: 10_000 }, async t => {
  const root = await realpath(await mkdtemp(path.join(tmpdir(), 'cleanup-worker116-')));
  t.after(() => rm(root, { recursive: true, force: true }));
  const requestId = 'cleanup-projection116', manifest = JSON.stringify({ run_id: 'EVAL-test116' });
  const attempt = path.join(root, 'runner-attempts', sha256(requestId), 'attempt.json');
  await mkdir(path.dirname(attempt), { recursive: true });
  await writeFile(path.join(root, 'manifest.json'), manifest);
  await writeFile(attempt, JSON.stringify({ schema_id: 'dd-eval/resume-worker@1', status: 'queued', intent: {
    kind: 'cleanup', goal: 'local_retirement', mode: 'reconcile', eval_root: root,
    request_id: requestId, run_id: 'EVAL-test116', manifest_sha256: sha256(manifest),
  } }));
  const lib = new URL('../lib/', import.meta.url);
  let source = await readFile(new URL('eval-resume-worker.mjs', lib), 'utf8');
  const replacements = new Map([
    ['runner.mjs', `import { writeFile } from 'node:fs/promises';
      export async function runnerCleanup(args) {
        await writeFile(${JSON.stringify(path.join(root, 'projection-call.json'))}, JSON.stringify(args));
        ${projectionFails ? "throw Object.assign(new Error('projection unavailable'), { code: 'projection_test' });" : "return { cleanup_state: 'settled' };"}
      }`],
    ['eval-retirement.mjs', `export async function retireEval() { return { physical_stopped: true, native_settled: true, cleanup_state: 'settled' }; }`],
    ['runtime-maintenance.mjs', ''],
  ]);
  for (const [module, implementation] of replacements) {
    const pattern = new RegExp(`import \\{([^}]+)\\} from ["']\\./${module.replaceAll('.', '\\.')}["'];`);
    const match = source.match(pattern);
    assert.ok(match, module);
    const provided = module === 'runner.mjs' ? 'runnerCleanup' : module === 'eval-retirement.mjs' ? 'retireEval' : null;
    const guards = match[1].split(',').map(name => name.trim()).filter(name => name !== provided)
      .map(name => `export function ${name}() { throw new Error('Unexpected operation: ${name}'); }`).join('\n');
    const file = path.join(root, module);
    await writeFile(file, `${implementation}\n${guards}`);
    source = source.replace(pattern, `import {${match[1]}} from ${JSON.stringify(pathToFileURL(file).href)};`);
  }
  source = source.replace(/(["'])\.\/([^"']+)\1/g, (_, quote, relative) => JSON.stringify(new URL(relative, lib).href));
  const worker = path.join(root, 'worker.mjs');
  await writeFile(worker, source);
  const child = spawn(process.execPath, [worker, attempt], { detached: true, stdio: ['ignore', 'pipe', 'pipe'] });
  t.after(() => { if (child.exitCode === null && child.signalCode === null) child.kill(); });
  let output = '';
  child.stdout.on('data', bytes => { output += bytes; });
  child.stderr.on('data', bytes => { output += bytes; });
  const [code] = await once(child, 'close');
  assert.equal(code, 0, output);
  const saved = JSON.parse(await readFile(attempt, 'utf8'));
  assert.equal(saved.status, 'completed', JSON.stringify(saved));
  assert.equal(saved.result.physical_stopped, true);
  assert.equal(saved.result.native_settled, true);
  assert.deepEqual(JSON.parse(await readFile(path.join(root, 'projection-call.json'), 'utf8')), {
    evalRoot: root, expectedManifestSha256: sha256(manifest),
  });
  if (projectionFails) assert.deepEqual(saved.result.projection_error, { code: 'projection_test', message: 'projection unavailable' });
  else {
    assert.deepEqual(saved.result.projection, { cleanup_state: 'settled' });
    assert.equal(saved.result.projection_error, undefined);
  }
});
