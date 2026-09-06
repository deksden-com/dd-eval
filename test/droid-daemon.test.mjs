import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, realpath, rm } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { once } from 'node:events';
import { callDaemon, startDaemon, stopDaemon } from '../lib/dd-droid-daemon.mjs';
import { DroidRuntime, droidPaths, processSnapshot } from '../lib/dd-droid.mjs';
const root = fileURLToPath(new URL('../', import.meta.url));
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
async function until(action) { for (let i = 0; i < 100; i++) { const result = await action(); if (result) return result; await pause(30); } throw new Error('bounded fixture wait expired'); }
async function setup(t) {
  const stateDir = await realpath(await mkdtemp(path.join(os.tmpdir(), 'dd-droid-daemon-test-')));
  t.after(async () => { await stopDaemon({ stateDir, cancelTree: true }).catch(() => {}); await rm(stateDir, { recursive: true, force: true }); });
  await startDaemon({ stateDir, cwd: stateDir, authHome: stateDir, noFlow: true, entryPath: path.join(root, 'bin/dd-droid.mjs'), bin: path.join(root, 'test/fixtures/droid-native.mjs') });
  const created = await callDaemon(stateDir, 'session.create', {}, 30000, 'create-once');
  const calls = async () => (await readFile(path.join(droidPaths(stateDir).factory, 'fixture-calls.jsonl'), 'utf8')).trim().split('\n').map(JSON.parse);
  return { stateDir, id: created.provider_session_id, calls };
}

test('Droid daemon retains a disconnected prompt receipt and never redispatches its operation', async t => {
  const { stateDir, id, calls } = await setup(t);
  const params = { sessionId: id, prompt: 'answer' };
  const client = net.createConnection(droidPaths(stateDir).socket);
  await once(client, 'connect');
  client.write(JSON.stringify({ schema_id: 'dd-droid/daemon-request@1', id: 'disconnected-op', operation: 'session.prompt', params }) + '\n');
  await until(async () => (await calls()).some(call => call.method === 'droid.add_user_message'));
  client.destroy();
  const receipt = await until(async () => {
    const result = await callDaemon(stateDir, 'operation.inspect', { operationId: 'disconnected-op' });
    return result.state === 'completed' ? result : null;
  });
  const replay = await callDaemon(stateDir, 'session.prompt', params, 30000, 'disconnected-op');
  assert.equal(replay.turn_id, receipt.result.turn_id);
  assert.equal((await calls()).filter(call => call.method === 'droid.add_user_message').length, 1);
  await assert.rejects(callDaemon(stateDir, 'session.prompt', { ...params, prompt: 'changed' }, 30000, 'disconnected-op'), { code: 'operation_conflict' });
});

test('Droid cancel then prompt loads the same native Session before dispatching new work', async t => {
  const { stateDir, id, calls } = await setup(t);
  const pending = callDaemon(stateDir, 'session.prompt', { sessionId: id, prompt: 'hold' }, 30000, 'held-op');
  await until(async () => (await calls()).some(call => call.method === 'droid.add_user_message'));
  await callDaemon(stateDir, 'session.cancel', { sessionId: id });
  await pending;
  const reply = await callDaemon(stateDir, 'session.prompt', { sessionId: id, prompt: 'new work' }, 30000, 'new-op');
  assert.equal(reply.provider_session_id, id);
  const history = await calls();
  assert.equal(history.filter(call => call.method === 'droid.initialize_session').length, 1);
  const loaded = history.findIndex(call => call.method === 'droid.load_session');
  const newPrompt = history.findIndex(call => call.method === 'droid.add_user_message' && call.params.text === 'new work');
  assert.ok(loaded > 0 && newPrompt > loaded);
  assert.equal(history[loaded].params.sessionId, id);
  assert.notEqual(history[loaded].pid, history[0].pid);
});

test('Droid closeTree verifies a retained child even when its root has already exited', async t => {
  const stateDir = await mkdtemp(path.join(os.tmpdir(), 'dd-droid-orphan-test-'));
  const child = spawn(process.execPath, ['-e', 'setTimeout(() => {}, 10000)'], { stdio: 'ignore' });
  const exited = once(child, 'exit');
  t.after(async () => { child.kill('SIGKILL'); await rm(stateDir, { recursive: true, force: true }); });
  const owned = (await processSnapshot()).find(row => row.pid === child.pid);
  assert.ok(owned);
  const runtime = new DroidRuntime({ stateDir, cwd: stateDir, home: path.join(stateDir, 'home'), journal: path.join(stateDir, 'events.jsonl') }, { owned_processes: [owned] }, async () => {});
  runtime.closed = true;
  let settled = false;
  const closing = runtime.closeTree(true).then(value => { settled = true; return value; });
  await pause(100);
  assert.equal(settled, false, 'closed root must not hide its still-live owned child');
  child.kill('SIGTERM');
  await exited;
  assert.equal((await closing).settled, true);
});


test('Droid native outcome recovery releases the original pending turn before new work', async t => {
  const { stateDir, id, calls } = await setup(t);
  let finished = false;
  const pending = callDaemon(stateDir, 'session.prompt', { sessionId: id, prompt: 'lose-terminal' }, 30000, 'lost-terminal-op').then(reply => { finished = true; return reply; });
  await until(async () => {
    const file = path.join(droidPaths(stateDir).factory, 'sessions', 'fixture', id + '.jsonl');
    return (await readFile(file, 'utf8')).includes('agent_turn_outcome');
  });
  assert.equal(finished, false, 'fixture must really withhold the terminal notification');
  const receipt = await until(async () => {
    const result = await callDaemon(stateDir, 'operation.inspect', { operationId: 'lost-terminal-op' });
    return result.state === 'completed' ? result : null;
  });
  const original = await pending;
  assert.equal(original.turn_id, receipt.result.turn_id);
  const next = await callDaemon(stateDir, 'session.prompt', { sessionId: id, prompt: 'after recovery' }, 30000, 'after-recovery-op');
  assert.equal(next.result.status, 'completed');
  assert.equal((await calls()).filter(call => call.method === 'droid.add_user_message').length, 2);
});

test('Droid shutdown cleans credentials and exits after physical cleanup even if profile inspection fails', async t => {
  const { stateDir, id } = await setup(t);
  const { writeFile, access } = await import('node:fs/promises');
  const paths = droidPaths(stateDir);
  const settingsFile = path.join(paths.factory, 'sessions', 'fixture', id + '.settings.json');
  const settings = JSON.parse(await readFile(settingsFile, 'utf8'));
  await writeFile(settingsFile, JSON.stringify({ ...settings, model: 'foreign-model', modelId: 'foreign-model' }));
  const copiedAuth = path.join(paths.factory, 'auth.json');
  await writeFile(copiedAuth, '{"fixture":true}');
  const before = await callDaemon(stateDir, 'daemon.status');
  const cleanup = await stopDaemon({ stateDir, cancelTree: true });
  assert.equal(cleanup.stopped, true);
  assert.equal(cleanup.settled, true);
  assert.equal(cleanup.clean, false);
  assert.equal(cleanup.cleanup.inspection_error.code, 'profile_drift');
  await assert.rejects(access(copiedAuth), { code: 'ENOENT' });
  const state = JSON.parse(await readFile(paths.state, 'utf8'));
  assert.equal(state.shutdown_state, 'unclean');
  await until(async () => {
    const rows = await processSnapshot();
    return !rows.some(row => !row.zombie && [before.pid, before.provider_pid].includes(row.pid));
  });
});
