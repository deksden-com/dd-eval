import assert from 'node:assert/strict';
import { mkdtemp, readFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { AcpBridge } from '../../dd-flow-cli/src/harness-runtime/lib/dd-zcode.mjs';
const tools = path.dirname(fileURLToPath(import.meta.url));
const config = JSON.parse(await readFile(path.join(os.homedir(), '.zcode/cli/config.json'), 'utf8'));
assert.ok(config.hooks?.enabled && config.hooks.events?.PreToolUse?.some(group => group.hooks?.some(hook => hook.args?.includes(path.join(tools, 'probe-zcode-native-hook.mjs')))), 'Install the narrowly scoped probe hook first; this script never edits user settings');
const cwd = await mkdtemp(path.join(os.tmpdir(), 'dd-native-hook-'));
const journal = path.join(cwd, 'adapter.events.jsonl');
const bridge = new AcpBridge({ bin: '/Users/deksden/Library/pnpm/zcode-acp', cwd, journal, permission: 'allow', env: {
  ZCODE_BIN: path.join(tools, 'probe-zcode-native-wrapper.mjs'),
  DD_ZCODE_HOOK_PROBE_DIR: cwd,
  ...(process.argv.includes('--inherit-hooks') ? { DD_ZCODE_PROBE_INHERIT_HOOKS: path.join(tools, 'probe-zcode-inherit-hooks.cjs') } : {}),
} });
console.log(JSON.stringify({ cwd, journal, inheritHooksExperiment: process.argv.includes('--inherit-hooks') }));
let sessionId;
try {
  await bridge.start();
  ({ sessionId } = await bridge.request('session/new', { cwd, mcpServers: [] }, 30000));
  console.log(JSON.stringify({ sessionId }));
  const base = `node ${path.join(tools, 'probe-zcode-native-hook.mjs')} execute`;
  const prompt = `Run this bounded native-hook diagnostic, not software development. Do not read files or change settings. Use Bash to run these THREE commands separately, exactly once each, in order: ${base} root rewrite ; ${base} root deny ; ${base} root error . The semicolons in this instruction separate calls: do not combine commands. An intentional denial/error is expected: do not retry or bypass it. Then create exactly ONE foreground subagent. Instruct it to run the same three separate Bash calls with child instead of root, once each, tolerating expected diagnostic failures, without reading files or spawning agents. Wait for it, then answer DONE. No other tools or commands. Do not add hook-event-id yourself; the hook supplies it.`;
  console.log(JSON.stringify({ result: await bridge.request('session/prompt', { sessionId, prompt: [{ type: 'text', text: prompt }] }, 240000) }));
  await bridge.flush();
  const topology = await bridge.request('zcode/session/subagents', { sessionId }, 15000);
  console.log(JSON.stringify({ topology }));
  assert.deepEqual(topology.running, []);
} catch (error) { console.log(JSON.stringify({ error: error.message, code: error.code })); process.exitCode = 1; }
finally { if (sessionId) bridge.notify('session/cancel', { sessionId }); await bridge.close(); }
if (process.exitCode) process.exit(process.exitCode);
const events = (await readFile(path.join(cwd, 'native-hook.jsonl'), 'utf8')).trim().split('\n').map(JSON.parse);
for (const role of ['root', 'child']) {
  const rows = events.filter(e => e.role === role);
  const saved = rows.find(e => e.kind === 'receipt_saved');
  const executed = rows.find(e => e.kind === 'executed' && e.mode === 'rewrite');
  const deniedExecution = rows.some(e => e.kind === 'executed' && e.mode === 'deny');
  const errorExecution = rows.some(e => e.kind === 'executed' && e.mode === 'error');
  console.log(JSON.stringify({ role, saved, executed, deniedExecution, errorExecution }));
  assert.ok(saved?.session && saved?.tool, `${role}: native identity missing`);
  assert.equal(executed?.receipt, saved.receipt, `${role}: rewrite not applied`);
  assert.ok(executed.at >= saved.at, `${role}: execution before saved receipt`);
  assert.ok(rows.some(e => e.kind === 'hook_deny'), `${role}: denial not tested`);
  assert.equal(deniedExecution, false, `${role}: denied command executed`);
  assert.ok(rows.some(e => e.kind === 'hook_error'), `${role}: ordinary error not tested`);
  assert.equal(errorExecution, true, `${role}: ordinary-error semantics changed; review admission policy`);
}
const identities = events.filter(e => e.kind === 'receipt_saved');
assert.notEqual(identities.find(e => e.role === 'root').session, identities.find(e => e.role === 'child').session, 'child identity must differ');
console.log('PASS: native root/child identity, durable-before-execution rewrite, and exit-2 denial');
