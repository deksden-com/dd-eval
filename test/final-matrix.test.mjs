import test from 'node:test';
import assert from 'node:assert/strict';
import { matrixRows } from '../lib/cases/final-matrix.mjs';

test('legacy matrix requires an unambiguous header and row structure', () => {
  const header = '| Capability / claim | Primary scenario | Verification contour | gate_status | closure_state | Later passport |';
  const rows = matrixRows(`${header}\n| --- | --- | --- | --- | --- | --- |\n| PRT-001-alpha | SCN-002-core | work | pass | closed | .memory-bank/plans/example.md |`);
  assert.deepEqual(rows[0].protocol_ids, ['PRT-001-alpha']);
  assert.deepEqual(rows[0].scenario_ids, ['SCN-002-core']);
  assert.equal(rows[0].evidence, '.memory-bank/plans/example.md');
  assert.throws(() => matrixRows(`${header}\n| too | few |`), /ambiguous columns/);
});
