import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { resolveFixtureValidation } from '../lib/fixture-assessment.mjs';

test('cached validation must match the requested reader and exact physical execution', async t => {
  const home = await mkdtemp(path.join(os.tmpdir(), 'fixture-validation103-'));
  t.after(() => rm(home, { recursive: true, force: true }));
  let executions = 0, validations = 0;
  const common = { home, executionManifest: { fixture: 'same' }, assess: async () => { executions++; return { passed: true }; }, validate: async () => { validations++; return { passed: true }; } };
  const old = await resolveFixtureValidation({ ...common, validationManifest: { reader: 'old' } });
  const current = await resolveFixtureValidation({ ...common, validationManifest: { reader: 'current' } });
  const original = await readFile(current.file);
  assert.equal((await resolveFixtureValidation({ ...common, validationManifest: { reader: 'current' } })).source, 'reused_fixture_assessment');
  await writeFile(current.file, await readFile(old.file));
  await assert.rejects(resolveFixtureValidation({ ...common, validationManifest: { reader: 'current' } }), /reader and execution/);
  for (const key of ['file', 'sha256']) {
    const altered = JSON.parse(original);
    altered.execution[key] += 'different';
    await writeFile(current.file, JSON.stringify(altered));
    await assert.rejects(resolveFixtureValidation({ ...common, validationManifest: { reader: 'current' } }), /reader and execution/);
  }
  assert.equal(executions, 1);
  assert.equal(validations, 2, 'invalid retained receipts neither execute nor revalidate silently');
});
