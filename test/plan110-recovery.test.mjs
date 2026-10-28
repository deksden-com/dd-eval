import test from 'node:test';
import assert from 'node:assert/strict';
import { recoveryObservationBudget, recoveryRpcSignal, recoveryRpcActivity, withRecoveryObservation } from '../lib/recovery-observation-budget.mjs';
import { needsFailureReconciliation } from '../lib/eval-resume-worker.mjs';
import { buildReport } from '../lib/runner.mjs';
import { commandJson, commandText } from '../lib/process-json.mjs';
import { isObservationLoss } from '../lib/operation-errors.mjs';

test('110 recovery preserves caller cancellation without imposing a fixed RPC signal', async () => {
  let time = 0;
  const budget = recoveryObservationBudget(null, () => time);
  await withRecoveryObservation(budget, async () => {
    assert.equal(recoveryRpcSignal(undefined), undefined);
    const caller = new AbortController();
    assert.equal(recoveryRpcSignal(caller.signal), caller.signal);
    time = 60_000;
    recoveryRpcActivity('original-operation', 1);
    assert.equal(budget.state().remaining_ms, 120_000);
    time += 60_000;
    recoveryRpcActivity('original-operation', 1);
    assert.equal(budget.state().remaining_ms, 60_000, 'repeated cursor is a poll, not activity');
    time += 20_000;
    recoveryRpcActivity('original-operation', 2);
    assert.equal(budget.state().remaining_ms, 120_000, 'reasoning/tool cursor advances without a file change');
    time += 20_000;
    recoveryRpcActivity('native-ledger', 'daemon:3');
    assert.equal(budget.state().remaining_ms, 120_000, 'verified native ledger cursor is not necessarily numeric');
    caller.abort(new Error('operator cancel'));
    for (const command of [commandJson, commandText])
      await assert.rejects(command(process.execPath, ['-e', 'throw Error("must not dispatch")'], { signal: caller.signal }), /operator cancel/);
    assert.equal(isObservationLoss({ code: 'ABORT_ERR' }), false);
    assert.equal(isObservationLoss({ code: 'recovery_observation_budget_exhausted' }), true);
  });
});

test('110 repeated observer restarts retain budget; gaps alone never establish Work failure', () => {
  let time = 0;
  let budget = recoveryObservationBudget(null, () => time);
  time = 20_000; budget.exhausted();
  for (let n = 0; n < 3; n++) budget = recoveryObservationBudget({ recovery_observation: budget.state() }, () => time);
  assert.equal(budget.state().remaining_ms, 100_000);
  time += 80_000; assert.equal(budget.exhausted(), false);
  assert.equal(budget.state().remaining_ms, 100_000);
  time += 60_000; budget.exhausted();
  time += 40_000; assert.equal(budget.exhausted(), true);
  assert.throws(() => withRecoveryObservation(budget, () => recoveryRpcSignal()), { code: 'recovery_observation_budget_exhausted' });
});

test('110 repeated control replies cannot masquerade as native recovery activity', async () => {
  let time = 0;
  const budget = recoveryObservationBudget(null, () => time);
  await withRecoveryObservation(budget, async () => {
    for (const command of [commandJson, commandText]) {
      time += 20_000;
      await command(process.execPath, ['-e', 'console.log("{}")', '--']);
    }
  });
  budget.exhausted();
  assert.equal(budget.state().remaining_ms, 80_000);
  assert.deepEqual(budget.state().activity_cursors, {});
});

test('110 verified native ledger progress crosses the old fixed RPC deadline', async () => {
  const saved = recoveryObservationBudget(null, () => 0).state();
  saved.remaining_ms = 30;
  const budget = recoveryObservationBudget({ recovery_observation: saved }, () => 0);
  const value = await withRecoveryObservation(budget, () => commandJson(process.execPath,
    ['-e', 'setTimeout(()=>console.log("{}"),1500)', '--'], {
      timeoutMs: 1000, env: { DD_EVAL_OPERATION_ID: 'original-native-operation' },
      operationProgress: async () => ({ cursor: 'native-daemon:1', observed_at: Date.now() })
    }));
  assert.deepEqual(value, {});
  assert.equal(budget.state().activity_cursors['original-native-operation'], 'native-daemon:1');
});

test('110 physical cleanup cannot retain scored observer after capture readiness or block live neighbours', () => {
  const failed = { execution_state: 'failed', cleanup_state: 'pending', state: 'completed_with_failures', cleanup_observation: { capture: 'ready' }, executions: [{ state: 'failed' }] };
  assert.equal(needsFailureReconciliation(failed), false);
  failed.cleanup_observation.capture = 'pending';
  assert.equal(needsFailureReconciliation(failed), true);
  failed.state = 'awaiting_provider'; failed.executions.push({ state: 'awaiting_provider' });
  assert.equal(needsFailureReconciliation(failed), false, 'continue original queue/observation, not cleanup-only loop');
});

test('110 absent model attribution limits comparisons, not technical run validity', () => {
  const manifest = { run_id: 'EVAL', executions: [{ id: 'e' }], profile: { judge: { enabled: true } }, execution_contract: {} };
  for (const state of ['matched', 'unknown', 'mismatched']) {
    const results = [{ execution: 'e', state: 'candidate_ready', experiment_conformance: { state, mismatches: [] } }];
    const report = buildReport({ root: '/fixture', manifest, results, judgeStatus: 'completed' });
    assert.equal(report.run_validity, state === 'mismatched' ? 'invalid_infrastructure_flow' : 'valid');
    assert.equal(report.assessment_state, 'completed');
  }
});
