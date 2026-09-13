// Direct native RPC experiment. Credentials stay inside the backend environment.
import { mkdtemp } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { ZcodeBackend } from '../../zcode-acp/dist/backend/client.js';
import { resolveZcodeCommand } from '../../zcode-acp/dist/backend/resolve.js';
import { loadZcodeCredentials, mergeEnvWithCreds } from '../../zcode-acp/dist/backend/credentials.js';

const cwd = await mkdtemp(path.join(os.tmpdir(), 'dd-zcode-native-stop-'));
const backend = new ZcodeBackend(resolveZcodeCommand(), mergeEnvWithCreds(loadZcodeCredentials()));
let id = 1;
const rpc = (method, params) => backend.request(id++, method, params, 15000);
const emit = (event, data = {}) => console.log(JSON.stringify({ at: new Date().toISOString(), event, ...data }));
let sessionId;
const mode = process.argv[2] ?? 'stop';
if (!['stop', 'close'].includes(mode)) throw new Error('Expected stop or close');
const markerProcesses = () => execFileSync('ps', ['-axo', 'pid,ppid,command'], { encoding: 'utf8' }).split('\n').filter(line => /node -e .*DD_NATIVE_BEGIN/.test(line));
emit('probe', { cwd, pid: backend.proc.pid });
try {
  const created = await rpc('session/create', { workspace: { workspacePath: cwd, workspaceKey: cwd }, mode: 'yolo' });
  sessionId = created.result?.session?.sessionId;
  if (!sessionId) throw new Error(JSON.stringify(created));
  emit('session', { sessionId });
  emit('mode', { response: await rpc('session/setMode', { sessionId, mode: 'yolo' }) });
  emit('send', { response: await rpc('session/send', { sessionId, content: 'Bounded stop diagnostic in this empty directory. No files, other directories or subagents. Run Bash exactly: node -e \'console.log("DD_NATIVE_BEGIN");setTimeout(()=>console.log("DD_NATIVE_END"),20000)\'. If it completes, run Bash exactly: node -e \'console.log("DD_NATIVE_AFTER")\'. Then say DONE. Stop immediately on interruption, never retry.' }) });
  let stopAt = null, idle = 0;
  const deadline = Date.now() + 85000;
  while (Date.now() < deadline) {
    await new Promise(resolve => setTimeout(resolve, 2000));
    const read = await rpc('session/read', { sessionId });
    const p = read.result?.projection;
    emit('status', { status: p?.status, active: p?.activeToolCalls?.length, tools: p?.activeToolCalls, elapsed: stopAt ? Date.now() - stopAt : null, error: read.error });
    if (!stopAt && p?.activeToolCalls?.length) {
      stopAt = Date.now();
      emit('marker_processes_before', { processes: markerProcesses() });
      emit('stop_response', { response: await rpc('session/stop', { sessionId }) });
      if (mode === 'close') {
        await new Promise(resolve => setTimeout(resolve, 4000));
        emit('marker_processes_before_close', { processes: markerProcesses() });
        emit('active_close_response', { response: await rpc('session/close', { sessionId }) });
        await new Promise(resolve => setTimeout(resolve, 3000));
        emit('marker_processes_after_close', { processes: markerProcesses() });
        break;
      }
    }
    idle = stopAt && p?.status === 'idle' ? idle + 1 : 0;
    if (idle === 3) break;
  }
} catch (error) { emit('error', { message: error.message }); process.exitCode = 1; }
finally {
  if (sessionId) emit('close_response', { response: await rpc('session/close', { sessionId }) });
  await backend.close();
  emit('closed', { pid: backend.proc.pid, exitCode: backend.proc.exitCode, signal: backend.proc.signalCode });
  emit('marker_processes_after_backend_close', { processes: markerProcesses() });
}
