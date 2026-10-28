import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import { mkdtemp, mkdir, writeFile, readFile, rm, realpath, symlink } from 'node:fs/promises';
import { prepareLaunchResources, launchResourcesConflict, withPriorEvalRetirement, retirementEligible } from '../lib/eval-retirement.mjs';
import { processSnapshot } from '../lib/process-snapshot.mjs';

test('terminal preparation failure may retire its own reservations without an invented RUN', () => {
  const manifest = { run_id: 'EVAL-test', executions: [{ id: 'e2e' }] };
  assert.equal(retirementEligible(manifest, []), false);
  assert.equal(retirementEligible(manifest, [{ type: 'dev.dd.eval.completed', data: { state: 'completed_with_failures' } }]), true);
  assert.equal(retirementEligible(manifest, [{ type: 'dev.dd.eval.completed', data: { state: 'completed_with_failures' } },
    { type: 'dev.dd.eval.operation.started', executionid: 'e2e', data: { operation_id: 'EVAL-test:e2e:launch' } }]), false);
});

test('launch conflict facts contain no credentials and exclude shared cache/registry from exclusives', async () => {
  const envA = { DATABASE_URL: 'postgres://user:secret@localhost:55401/a', DD_TASKS_TEST_ADMIN_URL: 'postgres://user:secret@localhost:55401/postgres' };
  const envB = { DATABASE_URL: 'postgresql://other:secret@127.0.0.1:55402/b', DD_TASKS_TEST_ADMIN_URL: 'postgres://other:secret@127.0.0.1:55402/postgres' };
  const a = await prepareLaunchResources('/tmp/a', envA);
  const b = await prepareLaunchResources('/tmp/b', envB);
  assert.equal(JSON.stringify(a).includes('secret'), false);
  assert.equal(launchResourcesConflict(a, b), false);
  assert.equal(launchResourcesConflict(a, await prepareLaunchResources('/tmp/b', { ...envB, DATABASE_URL: 'postgres://u:p@127.0.0.1:55401/b' })), true);
  assert.equal(launchResourcesConflict(a, await prepareLaunchResources('/tmp/b', { DATABASE_URL: envB.DATABASE_URL })), true, 'missing admin binding cannot attest isolation');
  assert.equal(launchResourcesConflict(a, await prepareLaunchResources('/tmp/b', { ...envB, DATABASE_URL: `${envB.DATABASE_URL}?host=localhost&port=55401` })), true);
  assert.equal(launchResourcesConflict(await prepareLaunchResources('/tmp/a', { ...envA, DD_FLOW_PORT_API: '32001' }), await prepareLaunchResources('/tmp/b', { ...envB, DD_FLOW_PORT_WEB: '32001' })), true);
  assert.equal(launchResourcesConflict(a, { ...b, workspaces: [path.join(a.workspaces[0], 'nested')] }), true);
  assert.equal(launchResourcesConflict(a, { ...b, databases: ['[]'] }), true);
  assert.equal(launchResourcesConflict(a, { ...b, databases: ['["loopback"]'] }), true);
  assert.equal(launchResourcesConflict(a, { ...b, databases: ['["localhost","055402","b"]'] }), true);
  assert.equal(launchResourcesConflict(a, { ...b, ports: ['055402'] }), true);
  assert.equal(launchResourcesConflict(a, await prepareLaunchResources('/tmp/b', { ...envB, DD_FLOW_PORT_WEB: '55401' })), true);
  assert.equal(launchResourcesConflict(a, await prepareLaunchResources('/tmp/b', {})), true);
  assert.equal(launchResourcesConflict(a, { ...b, complete: false }), true);
});

test('empty or malformed process observation never proves a live owner dead', async t => {
  t.mock.method(process, 'kill', () => true);
  for (const stdout of ['', 'not a process']) await assert.rejects(processSnapshot({ pid: 123, inspect: async () => ({ stdout }) }), { code: 'process_ownership_unknown' });
  t.mock.method(process, 'kill', () => { throw Object.assign(new Error('gone'), { code: 'ESRCH' }); });
  assert.deepEqual(await processSnapshot({ pid: 123, inspect: async () => ({ stdout: '' }) }), []);
});

test('workspace aliases cannot attest independent write scopes', async t => {
  const tmp = await realpath(await mkdtemp(path.join(os.tmpdir(), 'plan110-alias-')));
  t.after(() => rm(tmp, { recursive: true, force: true }));
  for (const name of ['a', 'b', 'shared']) await mkdir(path.join(tmp, name));
  for (const name of ['a', 'b']) await symlink(path.join(tmp, 'shared'), path.join(tmp, name, 'executions'));
  const env = port => ({ DATABASE_URL: `postgres://u:p@localhost:${port}/db`, DD_TASKS_TEST_ADMIN_URL: `postgres://u:p@localhost:${port}/postgres` });
  const a = await prepareLaunchResources(path.join(tmp, 'a'), env(55401));
  const b = await prepareLaunchResources(path.join(tmp, 'b'), env(55402));
  assert.deepEqual(a.workspaces, b.workspaces);
  assert.equal(launchResourcesConflict(a, b), true);
});

test('isolated historical cleanup is advisory after launch reservation, not a global blocker', async t => {
  const tmp = await realpath(await mkdtemp(path.join(os.tmpdir(), 'plan110-admission-')));
  t.after(() => rm(tmp, { recursive: true, force: true }));
  const resource = path.join(tmp, 'resources'), root = path.join(tmp, 'EVAL-old');
  await mkdir(resource); await mkdir(root);
  const prior = await prepareLaunchResources(root, { DATABASE_URL: 'postgres://u:p@localhost:55401/a', DD_TASKS_TEST_ADMIN_URL: 'postgres://u:p@localhost:55401/postgres' });
  const manifest = { run_id: 'EVAL-old', runtime_resource_home: resource };
  await writeFile(path.join(root, 'launch-reservation.json'), JSON.stringify({ schema_id: 'dd-eval/launch-reservation@1', root, run_id: manifest.run_id, resource_home: resource, resource_bindings: prior }));
  const actions = [];
  const result = await withPriorEvalRetirement({ caseId: 'case', resourceHome: resource,
    launchResources: await prepareLaunchResources(path.join(tmp, 'EVAL-new'), { DATABASE_URL: 'postgres://u:p@localhost:55402/b', DD_TASKS_TEST_ADMIN_URL: 'postgres://u:p@localhost:55402/postgres' }),
    onWait: value => { actions.push(value.state); if (value.state === 'advisory_cleanup_pending') throw new Error('notification unavailable'); } }, () => { actions.push('admitted'); return 'ok'; }, {
    discover: async () => [{ root, manifest }],
    requestCleanup: async () => { actions.push('cleanup'); throw Object.assign(new Error('temporarily unavailable'), { code: 'fixture' }); },
    call: async () => { throw new Error('isolated scope must not block on runtime status'); }
  });
  assert.equal(result, 'ok');
  assert.deepEqual(actions, ['admitted', 'cleanup', 'advisory_cleanup_pending']);
});

test('transient self ps failure does not poison the next lock or reclaim an unknown owner', async t => {
  const tmp = await mkdtemp(path.join(os.tmpdir(), 'plan110-lock-'));
  t.after(() => rm(tmp, { recursive: true, force: true }));
  const { withRunnerLock } = await import(`../lib/runner-lock.mjs?plan110=${Date.now()}`);
  let observations = 0;
  const observeProcesses = async ({ pid }) => {
    assert.equal(pid, process.pid);
    if (++observations === 1) throw Object.assign(new Error('ps transient'), { code: 'process_ownership_unknown' });
    return [{ pid, started: 'fixture-self', zombie: false }];
  };
  const target = path.join(tmp, 'identity');
  assert.equal(await withRunnerLock(target, () => 1, { timeoutMs: 500, observeProcesses }), 1);
  assert.equal(await withRunnerLock(target, () => 2, { timeoutMs: 500, observeProcesses }), 2);
  assert.equal(observations, 2);
  const lock = `${target}.lock`; await mkdir(lock);
  const ownerFile = path.join(lock, 'owner-fixture.json');
  const owner = JSON.stringify({ pid: 999999, started_at: 'unknown', progress: null }); await writeFile(ownerFile, owner);
  await assert.rejects(withRunnerLock(target, () => assert.fail('unproven owner cannot be reclaimed'), {
    timeoutMs: 25, observeProcesses: async () => { throw Object.assign(new Error('ps unknown'), { code: 'process_ownership_unknown' }); }
  }), { code: 'process_ownership_unknown' });
  assert.equal(await readFile(ownerFile, 'utf8'), owner);
});
