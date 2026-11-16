import test from 'node:test';
import assert from 'node:assert/strict';
import { mapLimited, Semaphore, createHarnessPermits, executionBudget } from '../lib/execution/execution-scheduling.mjs';
import { Semaphore as runnerSemaphore, createHarnessPermits as runnerPermits, executionBudget as runnerBudget } from '../lib/runner.mjs';

test('runner preserves scheduling exports', () => {
  assert.equal(runnerSemaphore, Semaphore);
  assert.equal(runnerPermits, createHarnessPermits);
  assert.equal(runnerBudget, executionBudget);
});

test('queue bounds concurrency and cancels unstarted items without reordering', async () => {
  const starts = [], releases = [], items = ['a', 'b', 'c'].map(id => ({ id }));
  let admit = true;
  const pending = mapLimited(items, 2, item => {
    starts.push(item.id);
    return new Promise(resolve => releases.push(() => resolve(item.id)));
  }, () => admit);
  assert.deepEqual(starts, ['a', 'b']);
  admit = false;
  releases[1]();
  releases[0]();
  assert.deepEqual(await pending, ['a', 'b', { execution: 'c', state: 'cancelled', code: 'run_stopped_by_infrastructure_error' }]);
  assert.deepEqual(starts, ['a', 'b']);
});

test('harness permits release after failure and isolate different harnesses', async () => {
  const permits = createHarnessPermits({ value: { concurrency: { per_harness: { codex: 1, droid: 1 } } } });
  let unblock;
  const first = permits.use({ harness: 'codex' }, () => new Promise((_, reject) => { unblock = () => reject(new Error('expected')); }));
  let secondStarted = false;
  const second = permits.use({ harness: 'codex' }, async () => { secondStarted = true; return 'second'; });
  assert.equal(await permits.use({ harness: 'droid' }, async () => 'independent'), 'independent');
  assert.equal(secondStarted, false);
  const failure = assert.rejects(first, /expected/);
  unblock();
  await failure;
  assert.equal(await second, 'second');
});

test('runtime budget normalizes aliases and rejects duplicate or invalid limits', () => {
  assert.deepEqual(executionBudget('EVAL-1', { concurrency: { per_harness: { zcode: 2, codex: 1 } } }), {
    schema_id: 'dd-flow/runtime-budget@1', scope_id: 'EVAL-1', per_harness: { 'codex-desktop': 1, 'zcode-acp': 2 }
  });
  assert.throws(() => executionBudget('EVAL-1', { concurrency: { per_harness: { codex: 1, 'codex-desktop': 1 } } }), { code: 'runtime_budget_invalid' });
  assert.throws(() => executionBudget('EVAL-1', { concurrency: { per_harness: { codex: 0 } } }), { code: 'runtime_budget_invalid' });
});
