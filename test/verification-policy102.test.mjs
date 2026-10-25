import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { verificationSelection } from '../scripts/verification-policy.mjs';
test('EVAL defaults use explicit impact selection, never every test before launch', () => {
  const pkg = JSON.parse(fs.readFileSync(new URL('../package.json', import.meta.url)));
  assert.equal(pkg.scripts.test, 'node scripts/verification.mjs run');
  assert.equal(pkg.scripts.validate, pkg.scripts.test);
  const selected = verificationSelection();
  assert.ok(selected.files.every(file => /^test\/.+\.test\.mjs$/.test(file)));
  assert.ok(!selected.files.includes('test/setup-installed.integration.test.mjs'));
});
