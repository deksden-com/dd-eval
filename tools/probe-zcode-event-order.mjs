// Read-only bridge experiment: no provider request, Session or RUN mutation.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { AcpBridge } from '../../dd-flow-cli/src/harness-runtime/lib/dd-zcode.mjs';

const journal = process.argv[2];
assert.ok(journal, 'Pass an existing adapter.events.jsonl');
const events = (await readFile(journal, 'utf8')).trim().split('\n').map(JSON.parse);
const permissions = events.filter(e => e.payload?.method === 'session/request_permission');
const childCalls = events.filter(e => e.payload?.params?.update?.sessionUpdate === 'tool_call' && e.payload.params.update._meta?.zcodeRuntime?.childSessionId);
console.log(JSON.stringify({ recorded_child_calls: childCalls.length, recorded_permission_requests: permissions.length }));

let release;
const gate = new Promise(resolve => { release = resolve; });
const order = [];
const bridge = new AcpBridge({ permission: 'allow', onNotification: async () => { order.push('handler_started'); await gate; order.push('receipt_saved'); } });
bridge.send = () => order.push('permission_answered');
bridge.receive(JSON.stringify({ method: 'session/update', params: { sessionId: 'fixture', update: { sessionUpdate: 'tool_call', toolCallId: 'call-1' } } }));
const permission = bridge.answer({ id: 1, method: 'session/request_permission', params: { options: [{ optionId: 'allow_once' }] } });
await Promise.resolve(); await Promise.resolve();
assert.equal(order.includes('permission_answered'), false);
release(); await permission;
assert.deepEqual(order, ['handler_started', 'receipt_saved', 'permission_answered']);
console.log('PASS: permission response waits for queued event persistence');

const failed = new AcpBridge({ onNotification: async () => { throw Object.assign(new Error('fixture forwarding failure'), { code: 'compound_lifecycle_command' }); } });
failed.receive(JSON.stringify({ method: 'session/update', params: { sessionId: 'fixture', update: { sessionUpdate: 'tool_call', toolCallId: 'call-2' } } }));
await failed.notifications;
assert.equal(failed.notificationError.code, 'compound_lifecycle_command');
await assert.rejects(failed.flush(), { code: 'compound_lifecycle_command' });
console.log('PASS: forwarding error is retained and thrown at flush');
