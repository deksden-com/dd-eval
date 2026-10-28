import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { classifyInterruption, failureDiagnostic, isInfrastructureFailure } from '../lib/runner.mjs';
import { observationProjection } from '../lib/runner-events.mjs';
import { observationSummary } from '../lib/observation-summary.mjs';

const failure = code => ({ code, details: { source: 'explicit_work_failure', episode_id: 'EP-1',
  work_id: 'WRK-011', work_session_id: 'WS-1', result_ref: 'run://RUN-1/works/WRK-011/result.json',
  primary_reason: 'User-defined stop condition; provider quota is not the reason', disposition: 'fail' } });

test('explicit Work disposition is not inferred as a native/provider failure', () => {
  for (const [code, category] of [['work_failure_unresolved', 'work_failure'], ['work_resolution_exhausted', 'execution_blocked']]) {
    const cause = failure(code);
    const error = { code: 'harness_adapter_failed', details: { controller: { error: cause } } };
    assert.equal(classifyInterruption(error).category, category);
    assert.equal(classifyInterruption(error).source, 'subject');
    assert.equal(classifyInterruption(error).retryable, false);
    assert.equal(isInfrastructureFailure(error), false);
    const diagnostic = failureDiagnostic(error).details.controller.error.details;
    for (const key of ['source', 'work_id', 'work_session_id', 'episode_id', 'result_ref', 'primary_reason', 'disposition']) assert.equal(diagnostic[key], cause.details[key]);
    for (const key of ['source', 'work_id', 'work_session_id', 'episode_id']) {
      const missing = structuredClone(cause); delete missing.details[key];
      assert.equal(classifyInterruption(missing).source, 'unknown', key);
    }
  }
  assert.equal(classifyInterruption({ code: 'fanout_child_failed', message: 'explicit_work_failure' }).source, 'unknown');
  const error = failure('work_failure_unresolved'); error.details.cause = { code: 'storage_write_failed' };
  assert.equal(classifyInterruption(error).source, 'runner', 'a real storage cause keeps its own attribution');
  error.details.cause = { code: 'provider_quota_exhausted' };
  assert.equal(classifyInterruption(error).evidence_reason, 'causal_evidence_conflict', 'a second typed cause is not hidden by Work attribution');
});

test('accepted successor stage retires an old refusal, never a heartbeat or late stage after failure', () => {
  const events = []; const add = (type, data) => events.push({ runid: 'EVAL', executionid: 'e2e', type: `dev.dd.eval.${type}`, data: { ...data, sequence: events.length + 1 } });
  add('operation.started', { operation_id: 'EVAL:e2e:launch' });
  add('controller.event', { type: 'stage_entered', data: { stage: 'code' } });
  add('controller.event', { type: 'lifecycle_outcome', data: { stage: 'code', error: { code: 'schema_validation' } } });
  add('observer.heartbeat', {});
  assert.equal(observationProjection(events).executions[0].failure.code, 'schema_validation');
  add('controller.event', { type: 'status_changed', data: { stage: 'code-review', status: 'running' } });
  assert.equal(observationProjection(events).executions[0].failure.code, 'schema_validation', 'status alone does not prove accepted entry');
  add('controller.event', { type: 'stage_entered', data: { stage: 'code-review' } });
  let result = observationProjection(events).executions[0];
  assert.equal(result.failure, undefined);
  assert.equal(result.previous_failure.error.code, 'schema_validation');
  add('controller.event', { type: 'lifecycle_outcome', data: { stage: 'code-review', error: { code: 'work_failure_unresolved' } } });
  add('operation.failed', { operation_id: 'EVAL:e2e:launch', error: { code: 'work_failure_unresolved' } });
  add('controller.event', { type: 'stage_entered', data: { stage: 'merge' } });
  result = observationProjection(events).executions[0];
  assert.equal(result.failure.code, 'work_failure_unresolved');
});

test('journal summary shows observed child activity, excluding retained-status polls', async t => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'eval112-activity-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const journal = path.join(root, 'events.jsonl');
  const rows = [
    { kind: 'inbound', observed_at: '2026-10-28T17:00:00Z', payload: { method: 'session/update', params: { sessionId: 'root', update: { sessionUpdate: 'tool_call', _meta: { zcodeRuntime: { childSessionId: 'child' } } } } } },
    { kind: 'inbound', observed_at: '2026-10-28T17:00:05Z', payload: { method: 'session/update', params: { sessionId: 'root', update: { sessionUpdate: 'usage_update' } } } },
    { kind: 'inbound', observed_at: '2026-10-28T17:00:10Z', payload: { result: { topology: { running: [{ childSessionId: 'child' }] } } } },
  ];
  await writeFile(journal, rows.map(JSON.stringify).join('\n'));
  let summary = await observationSummary(journal);
  assert.equal(summary.last_activity.observed_at, rows[0].observed_at);
  assert.equal(summary.child_activity[0].session_id, 'child');
  assert.equal(summary.child_activity[0].parent_session_id, 'root');
  rows.push({ kind: 'inbound', observed_at: '2026-10-28T17:01:00Z', payload: { method: 'thread/started', params: { thread: { id: 'codex-child', parentThreadId: 'codex-root' } } } },
    { kind: 'inbound', observed_at: '2026-10-28T17:01:01Z', payload: { method: 'item/reasoning/textDelta', params: { threadId: 'codex-child', delta: 'private reasoning never retained' } } },
    { schema_id: 'dd-flow/tool-observation@1', kind: 'tool_observation', observed_at: '2026-10-28T17:02:00Z', event: { session: { session_id: 'opencode-child' }, parent_session: { session_id: 'opencode-root' }, name: 'shell', status: 'completed' } },
    { kind: 'provider_event', observed_at: '2026-10-28T17:03:00Z', event: { step_update: { conversation_id: 'agy-root', step_type: 'subagent', subagent_info: { subagents: [{ conversation_id: 'agy-child' }] } } } },
    { kind: 'provider_event', observed_at: '2026-10-28T17:03:01Z', event: { step_update: { conversation_id: 'agy-child', step_type: 'tool', state: 'DONE' } } });
  await writeFile(journal, rows.map(JSON.stringify).join('\n'));
  summary = await observationSummary(journal);
  assert.equal(summary.child_activity.length, 4);
  assert.equal(summary.last_activity.session_id, 'agy-child');
  assert.ok(!JSON.stringify(summary).includes('private reasoning'));
});
