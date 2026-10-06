import test from 'node:test';
import assert from 'node:assert/strict';
import { manualHookEnvelope } from '../tools/probe-codex-hook-admission.mjs';

test('manual admission negative probe uses full proven native input, never display summary', () => {
  const command = `dd-flow session register --invocation-id INV-1 --project-root /probe # ${'x'.repeat(2000)}`;
  const row = { status: 'settled', provider_session_id: 'root', transcript_path: '/probe/native.jsonl', identity_json: JSON.stringify(['daemon', 'root', 'root', null, 'call-1']) };
  Object.defineProperty(row, 'sanitized_summary', { get() { throw new Error('Display summary must not be replayed'); } });
  const nativeCalls = [{ name: 'exec_command', call_id: 'call-1', arguments: JSON.stringify({ cmd: command }) }];
  const input = { row, nativeCalls, command, project: '/probe', rootId: 'root', daemonId: 'daemon' };
  const envelope = manualHookEnvelope(input);
  const bytes = JSON.stringify(envelope);
  assert.ok(bytes.length > 1600);
  assert.equal(JSON.parse(bytes).tool_input.command, command);
  assert.equal(envelope.tool_use_id, 'call-1');
  assert.equal(envelope.session_id, 'root');
  assert.throws(() => manualHookEnvelope({ ...input, nativeCalls: [] }));
  assert.throws(() => manualHookEnvelope({ ...input, nativeCalls: [...nativeCalls, nativeCalls[0]] }));
  assert.throws(() => manualHookEnvelope({ ...input, command: 'foreign-command' }));
  assert.throws(() => manualHookEnvelope({ ...input, daemonId: 'foreign-daemon' }));
  assert.throws(() => manualHookEnvelope({ ...input, row: { ...row, provider_session_id: 'foreign' } }));
});
