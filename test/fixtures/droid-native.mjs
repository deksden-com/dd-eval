import { createInterface } from 'node:readline';
import { appendFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
if (process.argv.includes('--version')) { console.log('0.212.0'); process.exit(0); }
// Node's default test discovery may execute files in test/fixtures.
if (!process.argv.includes('exec')) process.exit(0);
const factory = path.join(process.env.FACTORY_HOME_OVERRIDE, '.factory');
const folder = path.join(factory, 'sessions', 'fixture');
mkdirSync(folder, { recursive: true });
const settings = { model: 'gpt-5.6-sol', modelId: 'gpt-5.6-sol', reasoningEffort: 'high', autonomyMode: 'auto-high', tokenUsage: { inputTokens: 1, outputTokens: 1, cacheReadTokens: 0, cacheCreationTokens: 0, thinkingTokens: 0 } };
const envelope = { jsonrpc: '2.0', factoryApiVersion: '1.0.0', factoryProtocolVersion: '1.201.0' };
let sessionId, active, timer;
const send = message => process.stdout.write(JSON.stringify({ ...envelope, ...message }) + '\n');
const notify = notification => send({ type: 'notification', method: 'droid.session_notification', params: { sessionId, notification } });
const persist = record => appendFileSync(path.join(folder, sessionId + '.jsonl'), JSON.stringify(record) + '\n');
function finish(reason) {
  if (!active) return;
  clearTimeout(timer);
  const turnId = active;
  active = null;
  persist({ type: 'agent_turn_outcome', turnId, reason });
  notify({ type: 'droid_working_state_changed', newState: 'idle' });
  notify({ type: 'agent_turn_completed', turnId, reason });
}
createInterface({ input: process.stdin }).on('line', line => {
  const request = JSON.parse(line), { method, params } = request;
  appendFileSync(path.join(factory, 'fixture-calls.jsonl'), JSON.stringify({ method, params, pid: process.pid }) + '\n');
  let result = {};
  if (method === 'droid.list_models') result = { models: [{ id: 'gpt-5.6-sol', supportedReasoningEfforts: ['high'] }] };
  else if (method === 'droid.initialize_session') {
    sessionId = params.sessionId;
    persist({ type: 'session_start', id: sessionId, cwd: process.cwd() });
    writeFileSync(path.join(folder, sessionId + '.settings.json'), JSON.stringify(settings));
    result = { sessionId, settings };
  } else if (method === 'droid.load_session') {
    sessionId = params.sessionId;
    readFileSync(path.join(folder, sessionId + '.jsonl'));
    result = { settings, workingState: 'idle', isAgentLoopInProgress: false };
  } else if (method === 'droid.add_user_message') {
    if (!sessionId) throw new Error('prompt before initialize/load');
    active = params.messageId;
    notify({ type: 'create_message', requestId: request.id, message: { id: active } });
    notify({ type: 'droid_working_state_changed', newState: 'thinking' });
    if (params.text !== 'hold') timer = setTimeout(() => finish('completed'), 250);
  } else if (method === 'droid.interrupt_session') finish('cancelled');
  else if (method === 'droid.close_session') { finish('cancelled'); setTimeout(() => process.exit(0), 20); }
  else throw new Error('Unexpected RPC ' + method);
  send({ type: 'response', id: request.id, result });
}).on('close', () => process.exit(0));
