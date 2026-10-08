import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { writeJsonAtomic } from '../lib/runner-events.mjs';
import { resolveExecutionContract } from '../lib/execution-contract.mjs';
import { executionConformance, statusCleanupState, runResultRevision, buildReport, driverProfileArgs } from '../lib/runner.mjs';

test('conformance binds outbound intent to its controller profile, not any planned model', async t => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'runner-contract-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  for (const id of ['subject', 'later']) await writeJsonAtomic(path.join(root, 'agent-profiles', `${id}.json`), {
    schema_id: 'dd-flow/agent-profile@1', id, harness: 'codex', provider: 'openai', model: 'old', reasoning: 'high', mode: 'agent', permission: 'allow'
  });
  const contract = await resolveExecutionContract({ configHome: root,
    runProfile: { subject: { profile_id: 'subject', execution: { agent_profile_id: 'subject', stage_overrides: { code: { agent_profile_id: 'later' } } } }, selection: { stop_after: 'specify' } },
    loadProfile: id => ({ id, harness: 'codex-desktop', model: id === 'subject' ? 'wanted' : 'later-model', reasoning: 'high' }) });
  const attempt = path.join(root, 'attempt'), runtime = path.join(attempt, 'runtime'), runHome = path.join(runtime, 'runs', 'RUN');
  await mkdir(runHome, { recursive: true });
  await writeJsonAtomic(path.join(attempt, 'managed-runtime.json'), { runtime_root: runtime, run_home: runHome });
  await writeJsonAtomic(path.join(runHome, 'run.json'), { execution_profile: { settings: { execution: contract.routing }, agent_profiles: contract.profiles } });
  const result = { attempt, driver: { controller: { sessions: [{ session_id: 'root', profile_id: 'subject' }] } },
    model_attribution: { sessions: [{ harness: 'codex-desktop', session_id: 'root', requested: { model: 'wanted', reasoning: 'high', permission_mode: 'allow' } }] } };
  assert.equal((await executionConformance(result, contract)).state, 'matched');
  result.model_attribution.sessions[0].requested.model = 'later-model';
  assert.equal((await executionConformance(result, contract)).state, 'mismatched');
  result.model_attribution.sessions[0].requested.model = 'wanted';
  result.model_attribution.sessions[0].requested.permission_mode = 'deny';
  assert.equal((await executionConformance(result, contract)).state, 'mismatched');
  result.model_attribution.sessions[0].requested.permission_mode = 'allow';
  result.model_attribution.sessions.push({ harness: 'codex-desktop', session_id: 'child', parent_session_id: 'root', requested: { model: 'wanted' } });
  assert.equal((await executionConformance(result, contract)).intent_evidence, 'available');
  result.model_attribution.sessions.push({ harness: 'codex-desktop', session_id: 'unmapped', requested: { model: 'wanted' } });
  assert.equal((await executionConformance(result, contract)).intent_evidence, 'unknown');
  assert.equal((await executionConformance(result, null)).state, 'unknown');
});

test('status settlement requires current terminal revision and matching report, not CLI/owner exit', () => {
  const manifest = { run_id: 'EVAL', case_id: 'fixture', profile: { judge: { enabled: false } }, executions: [{ id: 'e2e', stage: 'specify' }] };
  const results = [{ execution: 'e2e', state: 'failed' }];
  const events = [];
  const report = buildReport({ root: '/fixture', manifest, results, state: 'completed_with_failures', cleanupState: 'settled' });
  assert.equal(statusCleanupState({ report, events, manifest, results }), 'pending');
  events.push({ runid: 'EVAL', type: 'dev.dd.eval.completed', data: { state: report.state, result_revision: runResultRevision(events, manifest) } });
  assert.equal(statusCleanupState({ report, events, manifest, results }), 'settled');
  assert.equal(statusCleanupState({ report: { ...report, state: 'finished' }, events, manifest, results }), 'pending');
  assert.equal(statusCleanupState({ report: { ...report, cleanup_state: 'pending' }, events, manifest, results }), 'pending');
  assert.equal(statusCleanupState({ report: null, events, manifest, results }), 'pending');
});

test('effective policy is supplied explicitly at native admission boundary', () => {
  const profile = { model: 'wanted', reasoning: 'high', provider: 'openai', mode: 'agent', permission: 'deny' };
  const args = driverProfileArgs(profile, ['doctor', '--cwd', '/fixture']);
  for (const [key, value] of Object.entries(profile)) assert.equal(args[args.indexOf(`--${key}`) + 1], value);
  assert.equal(args.filter(arg => arg === '--permission').length, 1);
  assert.deepEqual(driverProfileArgs(profile, ['daemon', 'stop']), ['daemon', 'stop']);
});
