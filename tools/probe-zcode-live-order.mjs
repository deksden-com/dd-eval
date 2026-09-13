// Isolated native probe: prints timestamps, never invokes dd-flow or existing EVALs.
import { mkdtemp, readFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { AcpBridge } from '../../dd-flow-cli/src/harness-runtime/lib/dd-zcode.mjs';

const cwd = await mkdtemp(path.join(os.tmpdir(), 'dd-zcode-order-'));
const journal = path.join(cwd, 'adapter.events.jsonl');
const delayMs = Number(process.argv[2] ?? 3000);
if (!Number.isInteger(delayMs) || delayMs < 0 || delayMs > 20000) throw new Error('delay must be 0..20000 ms');
const bridge = new AcpBridge({
  bin: '/Users/deksden/Library/pnpm/zcode-acp', cwd, journal, permission: 'allow',
  onNotification: async message => {
    const update = message.params?.update;
    if (update?.sessionUpdate !== 'tool_call') return;
    const command = update.rawInput?.command ?? update.rawInput?.cmd;
    if (typeof command !== 'string' || !command.includes('DD_ORDER_MARKER')) return;
    const identity = { tool: update.toolCallId, child: update._meta?.zcodeRuntime?.childSessionId ?? null };
    bridge.journal.write('probe_handler_started', identity);
    await new Promise(resolve => setTimeout(resolve, delayMs));
    bridge.journal.write('probe_handler_finished', identity);
  },
});
console.log(JSON.stringify({ cwd, journal, delayMs }));
let sessionId;
try {
  await bridge.start();
  ({ sessionId } = await bridge.request('session/new', { cwd, mcpServers: [] }, 30000));
  console.log(JSON.stringify({ sessionId }));
  const prompt = `This is a bounded execution-order diagnostic in an empty temporary directory. Do not inspect other directories or edit files. First use Bash yourself to run exactly: node -e 'console.log("DD_ORDER_MARKER root", Date.now())'. Then create exactly ONE foreground subagent with the sole task to use Bash once to run: node -e 'console.log("DD_ORDER_MARKER child", Date.now())'. Wait for that child to finish, then answer DONE. No other commands, no retries, no background tasks.`;
  const result = await bridge.request('session/prompt', { sessionId, prompt: [{ type: 'text', text: prompt }] }, 180000);
  await bridge.flush();
  console.log(JSON.stringify({ result }));
  console.log(JSON.stringify({ topology: await bridge.request('zcode/session/subagents', { sessionId }, 15000) }));
} catch (error) {
  console.log(JSON.stringify({ error: error.message, code: error.code }));
  process.exitCode = 1;
} finally {
  if (sessionId) bridge.notify('session/cancel', { sessionId });
  await bridge.close();
}
const events = (await readFile(journal, 'utf8')).trim().split('\n').map(JSON.parse);
for (const event of events) {
  const update = event.payload?.params?.update;
  if (event.kind.startsWith('probe_') || event.payload?.method === 'session/request_permission' || (update?.sessionUpdate?.startsWith('tool_call') && JSON.stringify(update).includes('DD_ORDER_MARKER'))) console.log(JSON.stringify(event));
}
