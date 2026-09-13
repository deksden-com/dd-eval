// Local boundary regression checks. They use published runtime modules only.
import assert from 'node:assert/strict';
import { commandWithHookEvent } from '../../dd-flow-cli/dist/services/hooks.js';
import { parseLifecycleCommand } from '../../dd-flow-cli/dist/services/lifecycle-command.js';
import { DaemonRuntime } from '../../dd-flow-cli/dist/harness-runtime/lib/dd-zcode-daemon.mjs';

for (const command of [
  `dd-flow work finish WRK-001 --result-stdin <<'RESULT'\n{}\nRESULT`,
  `dd-flow stage pause RUN-001 --stage code --work WRK-001 --question-stdin <<'QUESTION'\nQuestion?\nQUESTION`,
]) {
  const rewritten = commandWithHookEvent(command, 'exact-event');
  assert.match(rewritten, /--hook-event-id "exact-event" <</);
  assert.equal(rewritten.slice(rewritten.indexOf('\n')), command.slice(command.indexOf('\n')));
  assert.equal(parseLifecycleCommand(rewritten).kind, 'standalone');
}

const runtime = new DaemonRuntime({}, { daemon_id: 'daemon', sessions: [] }, { modelProfiles: new Map() }, {});
runtime.track({ provider_session_id: 'parent', adapter_session_id: 'parent' });
runtime.track({ provider_session_id: 'forked', parent_provider_session_id: 'parent', adapter_session_id: 'forked' });
runtime.track({ provider_session_id: 'forked', adapter_session_id: 'forked', evidence: { subagents: { running: [] } } });
assert.equal(runtime.sessions.get('forked').parent_provider_session_id, 'parent');
assert.throws(() => runtime.track({ provider_session_id: 'forked', parent_provider_session_id: 'other' }), { code: 'session_ancestry_conflict' });

console.log(JSON.stringify({ ok: true, heredoc_receipt: true, preserved_ancestry: true, grok_protocol_transport: 'covered_by_runtime_test' }));
