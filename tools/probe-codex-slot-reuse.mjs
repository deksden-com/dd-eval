// Isolated native lifecycle probe; does not start or modify an EVAL.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import assert from 'node:assert/strict';

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'dd-codex-slot-reuse-'));
const home = path.join(root, 'home'), project = path.join(root, 'project');
fs.mkdirSync(home); fs.mkdirSync(project);
fs.symlinkSync(path.join(process.env.CODEX_HOME ?? path.join(os.homedir(), '.codex'), 'auth.json'), path.join(home, 'auth.json'));
const prompt = `Run only this small native subagent lifecycle experiment. Do not read/edit files, use shell tools or ask questions. Spawn child A with instruction "Reply A immediately; no tools". Wait for its terminal result and retain its ID. Before closing A, attempt to spawn child B with instruction "Reply B immediately; no tools"; the configured native limit is one. Retain the exact refusal or unexpected success. Close only completed A using native close_agent with its returned ID. Spawn child C with instruction "Reply C immediately; no tools". Wait for terminal C then close C. If B unexpectedly succeeded, wait for and close B too. Report each actual tool outcome and ID. Do not substitute interrupt for close. Do not claim success without actual native calls.`;
fs.writeFileSync(path.join(root, 'prompt.txt'), prompt);
console.log(JSON.stringify({ root }));
const out = fs.openSync(path.join(root, 'events.jsonl'), 'w');
const err = fs.openSync(path.join(root, 'stderr.log'), 'w');
const child = spawn('/Users/deksden/.local/bin/codex', ['exec', '--ignore-user-config', '--ignore-rules', '--skip-git-repo-check', '--json', '-C', project, '-s', 'read-only', '-m', 'gpt-5.6-luna', '-c', 'features.multi_agent=true', '-c', 'agents.max_threads=1', '-c', 'agents.max_depth=1', '-c', 'model_reasoning_effort="low"', prompt], { env: { ...process.env, CODEX_HOME: home }, stdio: ['ignore', out, err], timeout: 240000 });
child.on('error', error => { console.error(error.message); process.exitCode = 1; });
child.on('close', code => {
  fs.closeSync(out); fs.closeSync(err);
  console.log(JSON.stringify({ root, code }));
  process.exitCode = code ?? 1;
  if (code !== 0) return;
  const calls = fs.readFileSync(path.join(root, 'events.jsonl'), 'utf8').trim().split('\n').map(JSON.parse)
    .filter(row => row.type === 'item.completed' && row.item.type === 'collab_tool_call').map(row => row.item);
  assert.deepEqual(calls.map(call => [call.tool, call.status]), [
    ['spawn_agent', 'completed'], ['wait', 'completed'], ['spawn_agent', 'failed'],
    ['close_agent', 'completed'], ['spawn_agent', 'completed'], ['wait', 'completed'], ['close_agent', 'completed']
  ]);
  assert.deepEqual(calls[0].receiver_thread_ids, calls[3].receiver_thread_ids);
  assert.deepEqual(calls[4].receiver_thread_ids, calls[6].receiver_thread_ids);
  console.log('PASS: completed child retains the slot; native close releases it for the next wave');
});
