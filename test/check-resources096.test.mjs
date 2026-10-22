import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import os from 'node:os';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { selectCheckResources, validateCheckResources, checkResourceEnvironment } from '../lib/check-resources.mjs';
import { evalRuntimeEnv } from '../lib/runner.mjs';
import { runBaselineAdmission, verifyBaselineAdmission } from '../lib/baseline-admission.mjs';
import { commandText } from '../lib/process-json.mjs';

test('retained browser resource survives a foreign HOME and shell cache; legacy remains explicit', () => {
  const resources = selectCheckResources('/owned/resources', {});
  assert.deepEqual(resources, { playwright_browsers_path: '/owned/resources/browser-cache/playwright' });
  const manifest = { runtime_resource_home: '/owned/resources', check_resources: resources };
  const previous = process.env.PLAYWRIGHT_BROWSERS_PATH;
  process.env.PLAYWRIGHT_BROWSERS_PATH = '/foreign/cache';
  try {
    assert.equal(evalRuntimeEnv('/owned/runtime', manifest).PLAYWRIGHT_BROWSERS_PATH, resources.playwright_browsers_path);
    assert.throws(() => evalRuntimeEnv('/owned/runtime', manifest, { PLAYWRIGHT_BROWSERS_PATH: '/foreign/cache' }), { code: 'check_resources_mismatch' });
  } finally { if (previous === undefined) delete process.env.PLAYWRIGHT_BROWSERS_PATH; else process.env.PLAYWRIGHT_BROWSERS_PATH = previous; }
  assert.deepEqual(checkResourceEnvironment(undefined), {});
  assert.equal(selectCheckResources('/owned', { PLAYWRIGHT_BROWSERS_PATH: '/explicit/cache' }).playwright_browsers_path, '/explicit/cache');
  for (const value of [{ playwright_browsers_path: 'relative' }, { playwright_browsers_path: '/a\0b' }, { playwright_browsers_path: '/a', PATH: '/foreign' }, null]) {
    assert.throws(() => validateCheckResources(value), { code: 'invalid_check_resources' });
  }
});

test('baseline install and check use one retained cache and create its parent before dispatch', async t => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'check-resources096-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const projectRoot = path.join(root, 'project'), cache = path.join(root, 'resource', 'cache'), log = path.join(root, 'observed.jsonl');
  await mkdir(projectRoot);
  await commandText('git', ['init', '-q'], { cwd: projectRoot });
  await commandText('git', ['-c', 'user.name=test', '-c', 'user.email=test@localhost', 'commit', '--allow-empty', '-qm', 'baseline'], { cwd: projectRoot });
  const script = `const fs=require('node:fs');if(!fs.statSync(process.env.PLAYWRIGHT_BROWSERS_PATH).isDirectory())throw Error('missing cache');fs.appendFileSync(${JSON.stringify(log)},JSON.stringify({cache:process.env.PLAYWRIGHT_BROWSERS_PATH})+'\\n');`;
  const bytes = JSON.stringify({ schema_id: 'dd-eval/baseline-admission-policy@2', commands: ['browser-install', 'browser'].map(id => ({ id, command: process.execPath, args: ['-e', script], inactivity_timeout_ms: 10000 })) });
  await writeFile(path.join(root, 'policy.json'), bytes);
  const checkpoint = { sha256: 'a'.repeat(64), value: { id: 'cp-test', source: { commit: await commandText('git', ['rev-parse', 'HEAD'], { cwd: projectRoot }) } } };
  const result = await runBaselineAdmission({ caseRoot: root, definition: { file: 'policy.json', sha256: createHash('sha256').update(bytes).digest('hex') }, projectRoot, outputRoot: path.join(root, 'out'), checkpoint, checkResources: { playwright_browsers_path: cache } });
  assert.equal(result.status, 'passed');
  assert.deepEqual((await readFile(log, 'utf8')).trim().split('\n').map(JSON.parse), [{ cache }, { cache }]);
  const receiptFile = path.join(root, 'out', 'receipt.json');
  const reference = { file: receiptFile, sha256: createHash('sha256').update(await readFile(receiptFile)).digest('hex') };
  const definition = { file: 'policy.json', sha256: createHash('sha256').update(bytes).digest('hex') };
  await verifyBaselineAdmission({ reference, definition, checkpoint, caseRoot: root, checkResources: { playwright_browsers_path: cache } });
  await assert.rejects(verifyBaselineAdmission({ reference, definition, checkpoint, caseRoot: root, checkResources: { playwright_browsers_path: path.join(root, 'other-cache') } }), { code: 'baseline_admission_unconfirmed' });
});
