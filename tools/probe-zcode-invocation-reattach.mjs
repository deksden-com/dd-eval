// Reads the outcome of one completed production probe after native reattach.
// No new Work, child, product change, or scored E2E is requested.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { createContext } from '../../dd-flow-cli/dist/runtime/context.js';
import { prepareHarnessFlowExecutable } from '../../dd-flow-cli/dist/services/harness-adapter.js';
import { AcpBridge, zcodeInvocationObserver } from '../../dd-flow-cli/src/harness-runtime/lib/dd-zcode.mjs';

assert.ok(process.argv[2], 'Pass the completed production probe directory');
const prior = fs.realpathSync(process.argv[2]);
// This diagnostic qualifies current source bytes, not the older engine snapshot
// retained by the original probe's router. Published-package preflight is separate.
process.env.DD_FLOW_ENGINE_MODE = '1';
const { scope, commands } = JSON.parse(fs.readFileSync(path.join(prior, 'request.json'), 'utf8'));
const context = createContext({ ...process.env, DD_FLOW_HOME: path.join(prior, 'home'), DD_FLOW_BIN: undefined, DD_FLOW_ENGINE_MODE: '1' });
const bin = prepareHarnessFlowExecutable(context, prior);
const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'dd-zcode-reattach-read-'));
const journal = path.join(directory, 'adapter.events.jsonl');
const snapshot = () => ({
  works: context.db.all('SELECT * FROM works ORDER BY work_id'),
  attempts: context.db.all('SELECT * FROM lifecycle_invocations ORDER BY id'),
  receipts: context.db.all('SELECT * FROM hook_events ORDER BY id'),
});
const before = snapshot();
assert.ok(before.works.every(work => work.status === 'completed'));
const bridge = new AcpBridge({ bin: '/Users/deksden/Library/pnpm/zcode-acp', cwd: scope.projectRoot, journal, permission: 'allow' });
console.log(JSON.stringify({ directory, sessionId: scope.rootSessionId }));
try {
  await bridge.start();
  await bridge.request('session/resume', { sessionId: scope.rootSessionId, cwd: scope.projectRoot, mcpServers: [] }, 120000);
  bridge.configure({ onLifecycleNotification: await zcodeInvocationObserver({ ddFlowBin: bin, ddFlowHome: context.ddFlowHome, projectRoot: scope.projectRoot, daemonId: 'reattach-read-probe', adapterSessionId: scope.rootSessionId, journal }, scope.rootSessionId) });
  const response = await bridge.request('session/prompt', { sessionId: scope.rootSessionId, prompt: [{ type: 'text', text: `Read-only replay qualification. All Work is already complete. Execute ONLY this exact retained command in Bash once; it must return its persisted result without another mutation. Do not create subagents, run help, or perform other commands. Wait for exit and report result.\nDD_FLOW_ENGINE_MODE=1 ${commands.root.finish}` }] }, 120000);
  await bridge.flush();
  const after = snapshot();
  fs.writeFileSync(path.join(directory, 'result.json'), JSON.stringify({ response, before, after }, null, 2));
  assert.deepEqual(after, before);
  const events = fs.readFileSync(journal, 'utf8').trim().split('\n').map(JSON.parse);
  assert.ok(events.some(event => event.kind === 'inbound' && event.payload?.params?.update?.sessionUpdate === 'tool_call' && event.payload.params.update.rawInput?.command?.includes('--invocation-id')), 'No native invocation observed');
  console.log(JSON.stringify({ status: 'PASS', directory, capability: 'native_root_reattach_settled_read', effects_replayed: 0 }));
} catch (error) {
  fs.writeFileSync(path.join(directory, 'failure.json'), JSON.stringify({ message: error.message, stack: error.stack }));
  throw error;
} finally { await bridge.close(); context.db.close?.(); }
