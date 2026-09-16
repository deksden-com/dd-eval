// Bounded native diagnostics. Creates only its own temporary Session/backend.
import { mkdtemp, open, readdir, stat, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { ZcodeBackend } from '../../zcode-acp/dist/backend/client.js';
import { resolveZcodeCommand } from '../../zcode-acp/dist/backend/resolve.js';
import { loadZcodeCredentials, mergeEnvWithCreds } from '../../zcode-acp/dist/backend/credentials.js';

const mode = process.argv[2];
if (!['quiet', 'child-quiet', 'close'].includes(mode)) throw new Error('Expected quiet, child-quiet or close');
const root = await mkdtemp(path.join(os.tmpdir(), 'dd-zcode-observation-'));
const logDir = path.join(os.homedir(), '.zcode/cli/log');
const cursors = new Map();
for (const name of await readdir(logDir)) {
  if (name.endsWith('.jsonl')) cursors.set(name, { offset: (await stat(path.join(logDir, name))).size, partial: '' });
}
const evidence = [];
const emit = (event, data = {}) => {
  const row = { observedAt: new Date().toISOString(), event, ...data };
  evidence.push(row); console.log(JSON.stringify(row));
};
const backend = new ZcodeBackend(resolveZcodeCommand(), mergeEnvWithCreds(loadZcodeCredentials()));
let id = 1, sid, closedAt;
const owned = new Set();
const rpc = (method, params) => backend.request(id++, method, params, 10000);
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
async function subscribe(sessionId) {
  backend.registerEventListener(sessionId, { handleEvent: ev => emit('wire', {
    sessionId, type: ev.type, sequence: ev.seq, kind: ev.payload?.kind,
    deltaChars: typeof ev.payload?.delta === 'string' ? ev.payload.delta.length : undefined,
  }) });
  const response = await rpc('session/subscribe', { sessionId, deliveryKind: 'desktop-continuous', includeSnapshot: false, afterSeq: 0 });
  if (response.error) throw new Error(`Subscribe failed: ${response.error.message}`);
}
async function tail() {
  for (const name of await readdir(logDir)) {
    if (!name.endsWith('.jsonl')) continue;
    const file = path.join(logDir, name);
    const cursor = cursors.get(name) ?? { offset: 0, partial: '' };
    const size = (await stat(file)).size;
    if (size < cursor.offset) { cursor.offset = 0; cursor.partial = ''; }
    if (size === cursor.offset) continue;
    const handle = await open(file, 'r');
    let bytes;
    try { bytes = await handle.read(Buffer.alloc(Math.min(size - cursor.offset, 4 * 1024 * 1024)), 0, Math.min(size - cursor.offset, 4 * 1024 * 1024), cursor.offset); }
    finally { await handle.close(); }
    cursor.offset += bytes.bytesRead;
    const lines = (cursor.partial + bytes.buffer.subarray(0, bytes.bytesRead).toString()).split('\n');
    cursor.partial = lines.pop(); cursors.set(name, cursor);
    for (const line of lines) {
      let row; try { row = JSON.parse(line); } catch { continue; }
      if (!owned.has(row.sessionId)) continue;
      // Whitelist metadata; never persist request payloads, prompts, or reasoning.
      if (/^(model\.|tool\.call\.|turn\.|subagent\.)/.test(row.event ?? '')) emit('native', {
        timestamp: row.timestamp, kind: row.event, sessionId: row.sessionId,
        turnId: row.turnId, durationMs: row.durationMs, status: row.status,
        contextKeys: Object.keys(row.context ?? {}), toolName: row.context?.toolName,
        afterClose: Boolean(closedAt && Date.parse(row.timestamp) >= closedAt),
      });
    }
  }
}
try {
  const created = await rpc('session/create', { workspace: { workspacePath: root, workspaceKey: root }, mode: 'yolo' });
  sid = created.result?.session?.sessionId;
  if (!sid) throw new Error('Session create failed');
  owned.add(sid);
  await rpc('session/setMode', { sessionId: sid, mode: 'yolo' });
  await subscribe(sid);
  emit('created', { root, mode, sessionId: sid, backendPid: backend.proc.pid });
  const content = mode === 'quiet'
    ? 'Bounded diagnostic. Do not use any tools or subagents. Write a detailed self-contained mathematical explanation of why the harmonic series diverges, with three distinct proofs and careful comparison of their assumptions. Aim for 2000 words, then stop.'
    : mode === 'child-quiet'
      ? 'Bounded diagnostic in an empty temporary directory. Use one Agent subagent. Ask it to write a self-contained explanation of three proofs that the harmonic series diverges, about 1500 words, without any tools or further subagents. Wait for it, then say DONE. No file reads or writes, no other tasks.'
      : 'Bounded cancellation diagnostic in an empty temporary directory. Use one Agent subagent to run Bash exactly: node -e "setTimeout(()=>{},45000)". Wait for it. Once it returns, use Read to read ./probe.txt once, even if the child was cancelled, then stop. Do not retry errors, edit files, or inspect other directories.';
  // This file belongs solely to the disposable probe, never an EVAL workspace.
  if (mode === 'close') await writeFile(path.join(root, 'probe.txt'), 'Isolated cancellation marker.\n');
  const sent = await rpc('session/send', { sessionId: sid, content });
  if (sent.error) throw new Error(sent.error.message);
  const deadline = Date.now() + 150000;
  while (Date.now() < deadline) {
    await sleep(1000);
    if (mode !== 'quiet' && !closedAt) {
      const tree = await rpc('session/subagents', { sessionId: sid });
      const children = tree.result?.running ?? [];
      for (const child of children) {
        const childId = child.childSessionId ?? child.sessionId;
        if (childId && !owned.has(childId)) {
          owned.add(childId);
          if (mode === 'child-quiet') {
            try { await subscribe(childId); }
            catch (error) { emit('child_subscription_unavailable', { sessionId: childId, message: error.message }); }
          }
          emit('child', { sessionId: childId });
        }
      }
      if (children.length && mode === 'close') {
        await sleep(8000);
        await tail();
        emit('stop', { response: await rpc('session/stop', { sessionId: sid }) });
        await sleep(4000);
        const result = await rpc('session/close', { sessionId: sid });
        closedAt = Date.now(); emit('close', { response: result });
        const read = await rpc('session/read', { sessionId: sid });
        emit('resident_check', { error: read.error, status: read.result?.projection?.status });
      }
    }
    await tail();
    if (closedAt && Date.now() - closedAt > 60000) break;
    if (mode !== 'close' && evidence.some(row => row.sessionId === sid && (row.kind === 'turn.completed' || row.kind === 'turn.failed'))) break;
  }
  emit('observation_end', { closeObserved: Boolean(closedAt) });
} catch (error) { emit('error', { message: error.message }); process.exitCode = 1; }
finally {
  await backend.close();
  await sleep(1500); await tail();
  emit('backend_closed', { exitCode: backend.proc.exitCode, signal: backend.proc.signalCode });
  await writeFile(path.join(root, 'receipt.json'), JSON.stringify(evidence, null, 2));
  console.log(JSON.stringify({ receipt: path.join(root, 'receipt.json') }));
}
