import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { contractDescriptor, verificationSelection } from '../scripts/verification-policy.mjs';
test('EVAL defaults use explicit impact selection, never every test before launch', () => {
  const pkg = JSON.parse(fs.readFileSync(new URL('../package.json', import.meta.url)));
  assert.equal(pkg.scripts.test, 'node scripts/verification.mjs run');
  assert.equal(pkg.scripts.validate, pkg.scripts.test);
  const selected = verificationSelection();
  assert.ok(selected.files.every(file => /^test\/.+\.test\.mjs$/.test(file)));
  assert.ok(!selected.files.includes('test/setup-installed.integration.test.mjs'));
});

test('process contracts bind extracted helpers to their execution key', () => {
  const inputs = contractDescriptor('test/process-json.test.mjs').inputs;
  for (const file of ['lib/process-json.mjs', 'lib/json-file.mjs', 'lib/harness/process-support.mjs']) {
    assert.ok(inputs.includes(file), `missing execution-key input ${file}`);
  }
});

test('control contracts bind the extracted execution and recovery dependencies', () => {
  const inputs = contractDescriptor('test/runner-control.test.mjs').inputs;
  for (const file of ['lib/execution/selection.mjs', 'lib/execution/eval-inputs.mjs',
    'lib/recovery/launch-retirement.mjs', 'lib/harness/driver-recovery.mjs', 'lib/judge/retained-cleanup.mjs']) {
    assert.ok(inputs.includes(file), `missing execution-key input ${file}`);
  }
});
