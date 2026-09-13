// Isolated, bounded cancellation probe; never attaches to an existing session.
import { mkdtemp } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { AcpBridge } from '../../dd-flow-cli/src/harness-runtime/lib/dd-zcode.mjs';

const cwd = await mkdtemp(path.join(os.tmpdir(), 'dd-zcode-cancel-'));
const mode = process.argv[2] ?? 'cancel';
if (!['cancel', 'fatal'].includes(mode)) throw new Error('Expected cancel or fatal');
let sessionId, cancelAt, toolCount = 0;
const emit = (event, data = {}) => console.log(JSON.stringify({ at: new Date().toISOString(), event, ...data }));
const bridge = new AcpBridge({
  bin: '/Users/deksden/Library/pnpm/zcode-acp', cwd,
  journal: path.join(cwd, 'adapter.events.jsonl'), permission: 'allow',
  env: { ZCODE_ACP_DEBUG: '1' },
  onNotification: message => {
    const u = message.params?.update;
    if (u?.sessionUpdate !== 'tool_call') return;
    toolCount++;
    emit('tool_call', { id: u.toolCallId, title: u.title?.slice(0,160), afterCancel: Boolean(cancelAt) });
    if (cancelAt) return;
    setTimeout(() => {
      cancelAt = Date.now();
      if (mode === 'fatal') {
        const error = Object.assign(new Error('Isolated simulated fatal'), { code: 'invocation_command_mismatch' });
        bridge.notificationError = error;
        bridge.rejectAll(error);
      }
      bridge.notify('session/cancel', { sessionId });
      emit('cancel_sent', { sessionId, mode });
    }, 1000);
  },
});
emit('probe', { cwd, mode });
try {
  const initialized = await bridge.start();
  emit('initialized', { info: initialized.agentInfo });
  ({ sessionId } = await bridge.request('session/new', { cwd, mcpServers: [] }));
  emit('session', { sessionId, bridgePid: bridge.child.pid });
  const prompt = 'This is a bounded cancellation diagnostic in an empty temporary directory. Do not read or write files, inspect other directories, call other tools, or create subagents. Use Bash to execute exactly: node -e \'console.log("DD_CANCEL_BEGIN");setTimeout(()=>console.log("DD_CANCEL_END"),20000)\'. If it completes normally, use Bash once more to execute exactly: node -e \'console.log("DD_CANCEL_AFTER")\'. Then answer DONE. If interrupted or cancelled, stop immediately without retries.';
  let outcome;
  const pending = bridge.request('session/prompt', { sessionId, prompt: [{ type: 'text', text: prompt }] }, 90000)
    .then(value => { outcome = value; emit('prompt_result', { value }); }, error => { outcome = { error: error.code ?? error.message }; emit('prompt_error', outcome); });
  const deadline = Date.now() + 95000;
  let idleSamples = 0;
  while (Date.now() < deadline) {
    await new Promise(resolve => setTimeout(resolve, 3000));
    if (!cancelAt && !outcome) continue;
    const read = await bridge.request('zcode/session/read', { sessionId }, 10000);
    const status = read.projection?.status ?? read.session?.status;
    emit('status', { status, sinceCancelMs: cancelAt ? Date.now() - cancelAt : null, activeTools: read.projection?.activeToolCalls?.length });
    idleSamples = status === 'idle' ? idleSamples + 1 : 0;
    if (idleSamples >= 3) break;
  }
  if (!outcome) bridge.rejectAll(Object.assign(new Error('Probe bounded shutdown'), { code: 'probe_shutdown' }));
  await pending;
  emit('summary', { toolCount, cancelSent: Boolean(cancelAt), outcome, idleSamples });
} catch (error) {
  emit('error', { code: error.code, message: error.message });
  process.exitCode = 1;
} finally {
  if (sessionId) bridge.notify('session/cancel', { sessionId });
  try { await bridge.close(); } catch (error) { emit('close', { code: error.code, message: error.message }); }
  emit('closed', { bridgePid: bridge.child?.pid, exitCode: bridge.child?.exitCode });
}
