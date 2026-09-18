// Bounded live transport qualification. No original RUN, project or user hooks are modified.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { spawn, spawnSync } from 'node:child_process';
import { quote, parse } from '../../dd-flow-cli/node_modules/shell-quote/index.js';
import { createContext } from '../../dd-flow-cli/dist/runtime/context.js';
import { registerProject } from '../../dd-flow-cli/dist/services/projects.js';
import { issueLifecycleInvocation, awaitLifecycleInvocation, settleLifecycleInvocation, assertLifecycleInvocationCurrent } from '../../dd-flow-cli/dist/services/lifecycle-invocations.js';
import { callDaemon, stopDaemon } from '../../dd-flow-cli/dist/harness-runtime/lib/dd-codex-daemon.mjs';

const source = fileURLToPath(import.meta.url);
const cli = fileURLToPath(new URL('../../dd-flow-cli/dist/cli.js', import.meta.url));
const adapter = fileURLToPath(new URL('../../dd-flow-cli/dist/harness-runtime/bin/dd-codex.mjs', import.meta.url));

// The probe substitutes only the business mutation with a harmless retained marker.
// Issuance, native hook, proof RPC, storage and CLI admission are production code.
export async function marker() {
  const context = createContext(process.env);
  try {
    const args = process.argv.slice(2), id = args[args.indexOf('--invocation-id') + 1];
    assert.ok(id);
    const command = quote([process.argv[1], ...args]);
    const result = await awaitLifecycleInvocation(context, { id, command, assertCurrent: scope => assertLifecycleInvocationCurrent(context, scope, command) });
    if (!result.replay) settleLifecycleInvocation(context, id, { result: { ok: true, marker: id } });
    process.stdout.write(JSON.stringify({ ok: true, marker: id, replay: result.replay }) + '\n');
  } finally { context.db.close(); }
}

function command(args, env, stdin = '') {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, args, { env, stdio: ['pipe', 'pipe', 'pipe'], timeout: 40000 });
    let stdout = '', stderr = '';
    child.stdout.on('data', chunk => { stdout += chunk; }); child.stderr.on('data', chunk => { stderr += chunk; });
    child.stdin.on('error', () => {}); child.stdin.end(stdin);
    child.on('error', reject); child.on('close', code => resolve({ code, stdout, stderr }));
  });
}
async function bounded(action, ms) {
  let timer;
  try { return await Promise.race([action, new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('Native probe deadline exceeded')), ms); })]); }
  finally { clearTimeout(timer); }
}

async function main() {
  const root = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'dd-codex-admission-')));
  const project = path.join(root, 'project'), home = path.join(root, 'home'), nativeHome = path.join(root, 'codex-home');
  const stateDir = path.join(root, 'daemon'), bin = path.join(root, 'bin'), journal = path.join(root, 'adapter.events.jsonl');
  const model = process.argv[2] ?? 'gpt-5.6-luna';
  await Promise.all([project, home, nativeHome, stateDir, bin].map(dir => fs.mkdir(dir, { recursive: true })));
  const auth = path.join(process.env.CODEX_HOME ?? path.join(os.homedir(), '.codex'), 'auth.json');
  await fs.access(auth); await fs.symlink(auth, path.join(nativeHome, 'auth.json'));
  await fs.writeFile(path.join(nativeHome, 'config.toml'), `model = ${JSON.stringify(model)}\nmodel_reasoning_effort = "low"\n[features]\nmulti_agent = true\n[agents]\nmax_threads = 8\nmax_depth = 1\n`);
  const flow = path.join(bin, 'dd-flow');
  await fs.writeFile(flow, `#!${process.execPath}\nif(process.argv[2]==='session' && process.argv[3]==='register') await (await import(${JSON.stringify(pathToFileURL(source).href)})).marker(); else await import(${JSON.stringify(pathToFileURL(cli).href)});\n`, { mode: 0o700 });
  await fs.writeFile(path.join(nativeHome, 'hooks.json'), JSON.stringify({ hooks: { PreToolUse: [{ matcher: 'Bash', hooks: [{ type: 'command', command: `${quote([flow])} codex hook handle --event PreToolUse --json`, timeout: 30, statusMessage: 'dd-flow runtime observation' }] }] } }));
  const env = { ...process.env, CODEX_HOME: nativeHome, DD_FLOW_HOME: home, DD_FLOW_BIN: flow, PATH: `${bin}:${process.env.PATH}` };
  delete env.DD_FLOW_RUNTIME_OWNER; delete env.DD_FLOW_RESOURCE_HOME; delete env.DD_EVAL_OPERATION_ID;
  const context = createContext({ DD_FLOW_HOME: home }); registerProject(context, { root: project });
  let started = false;
  const evidence = { root, model, cli, codex_version: spawnSync('codex', ['--version'], { encoding: 'utf8' }).stdout.trim(), phases: [] };
  process.stdout.write(JSON.stringify({ root, model }) + '\n');
  try {
    const launch = await command([adapter, 'daemon', 'start', '--state-dir', stateDir, '--cwd', project, '--journal', journal, '--dd-flow-home', home, '--dd-flow-bin', flow, '--project-root', project, '--json'], env);
    assert.equal(launch.code, 0, launch.stderr); started = true;
    const daemon = JSON.parse(launch.stdout);
    const session = await callDaemon(stateDir, 'session.create', { cwd: project, model, reasoning: 'low' });
    const rootId = session.provider_session_id;
    evidence.daemon_id = daemon.daemon_id; evidence.root_session_id = rootId;
    const scope = { projectRoot: project, daemonId: daemon.daemon_id, rootSessionId: rootId, runId: null, generation: 0 };
    const issue = () => issueLifecycleInvocation(context, `${quote([flow])} session register --project-root ${quote([project])} --json`, scope);
    const direct = issue(), nested = issue(), children = Array.from({ length: 6 }, issue);
    evidence.attempts = { direct, nested, children };
    await fs.writeFile(path.join(root, 'issued.json'), JSON.stringify(evidence, null, 2));
    const prompt = `This is a bounded transport diagnostic in an empty temporary project. No file reads, edits, project work or user questions. Commands below are harmless marker probes. Execute each command EXACTLY once, preserve every argument/ID, never invoke a hook handler, never retry or repair a rejected command.\nFirst run this command directly using your native shell tool:\n${direct.command}\nThen run this command using your native code-mode/orchestration tool calling the shell tool (if exposed); preserve the shell command verbatim:\n${nested.command}\nFinally spawn exactly SIX native subagents in parallel, one for each numbered command below. Each child must only run its assigned command once with its shell tool and report the output. Do not run children's commands yourself. Wait for all six children to finish and return their native IDs and outputs. Do not close the children until they finish.\n${children.map((child, i) => `${i + 1}. ${child.command}`).join('\n')}\nIf any command fails, report its exact error and end. If code-mode is unavailable, say so explicitly; do not simulate it.`;
    await fs.writeFile(path.join(root, 'prompt.txt'), prompt);
    const response = await bounded(callDaemon(stateDir, 'session.prompt', { sessionId: rootId, cwd: project, model, reasoning: 'low', prompt, timeoutMs: 300000 }), 330000);
    await fs.writeFile(path.join(root, 'response.json'), JSON.stringify(response, null, 2));
    const rows = context.db.all('SELECT i.id,i.status,i.identity_json,i.event_key,i.outcome_json,h.provider_session_id,h.parent_session_id,h.transcript_path,h.sanitized_summary FROM lifecycle_invocations i LEFT JOIN hook_events h ON h.event_key=i.event_key ORDER BY i.rowid');
    evidence.rows = rows;
    for (const attempt of [direct, nested, ...children]) {
      const row = rows.find(row => row.id === attempt.id);
      assert.equal(row?.status, 'settled', `${attempt.id} did not complete`);
      assert.equal(JSON.parse(row.outcome_json).result.marker, attempt.id);
    }
    assert.equal(rows[0].provider_session_id, rootId); assert.equal(rows[1].provider_session_id, rootId);
    const childRows = children.map(child => rows.find(row => row.id === child.id));
    assert.equal(new Set(childRows.map(row => row.provider_session_id)).size, 6);
    assert.ok(childRows.every(row => row.provider_session_id !== rootId));
    const manual = await command([cli, 'codex', 'hook', 'handle', '--event', 'PreToolUse', '--json'], { ...env, DD_FLOW_CODEX_STATE_DIR: stateDir, DD_FLOW_DAEMON_ID: daemon.daemon_id }, rows[0].sanitized_summary);
    assert.notEqual(manual.code, 0); assert.match(manual.stderr, /native_hook_unproven/);
    const replay = await command(parse(direct.command), env);
    assert.equal(replay.code, 0, replay.stderr); assert.equal(JSON.parse(replay.stdout).replay, true);
    evidence.root_native_calls = (await fs.readFile(rows[0].transcript_path, 'utf8')).split('\n').filter(Boolean).map(line => JSON.parse(line))
      .filter(row => row.type === 'response_item' && ['function_call', 'custom_tool_call'].includes(row.payload?.type))
      .map(row => ({ name: row.payload.name, call_id: row.payload.call_id, arguments: row.payload.arguments ?? row.payload.input }));
    evidence.manual_repair = manual; evidence.replay_probe = replay;
    assert.ok(evidence.root_native_calls.some(call => call.name === 'exec' && call.arguments?.includes(nested.command)), 'Native code-mode did not execute the nested command');
    const nativeEvents = (await fs.readFile(journal, 'utf8')).split('\n').filter(Boolean).map(JSON.parse);
    evidence.hook_timings = nativeEvents.filter(event => event.payload?.method === 'hook/completed')
      .map(event => ({ session_id: event.payload.params.threadId, ...event.payload.params.run }));
    assert.ok(evidence.hook_timings.length >= 8);
    assert.ok(evidence.hook_timings.every(run => run.status === 'completed' && run.durationMs < 20000));
    evidence.phases.push('root_and_six_children_committed', 'manual_handler_rejected');
    // Fault-inject real receipt storage failure in this isolated probe only.
    // An unissued ID is a CLI typo, not a native hook failure.
    const failureAttempt = issue();
    context.db.execSchema("CREATE TRIGGER probe_receipt_failure BEFORE INSERT ON hook_events BEGIN SELECT RAISE(FAIL, 'probe receipt storage failure'); END");
    const failedAt = Date.now();
    try {
      await bounded(callDaemon(stateDir, 'session.prompt', { sessionId: rootId, cwd: project, model, reasoning: 'low',
        prompt: `Transport failure diagnostic: run exactly this command once with your shell tool and stop. Do not retry or repair it:\n${failureAttempt.command}`, timeoutMs: 60000 }), 70000);
      assert.fail('Native hook failure was swallowed');
    } catch (error) {
      assert.equal(error.code, 'native_hook_failed', error.message);
      evidence.failure_probe = { code: error.code, message: error.message, elapsed_ms: Date.now() - failedAt };
    } finally { context.db.execSchema("DROP TRIGGER probe_receipt_failure"); }
    assert.equal(context.db.all('SELECT id FROM lifecycle_invocations').length, 9);
    evidence.phases.push('native_failure_reaches_daemon');
    evidence.status = 'PASS';
  } catch (error) { evidence.status = 'FAIL'; evidence.error = { code: error.code, message: error.message, stack: error.stack }; process.exitCode = 1; }
  finally {
    if (started) try { evidence.cleanup = await stopDaemon({ stateDir, cancelTree: true, timeoutMs: 30000 }); }
    catch (error) { evidence.cleanup_error = { code: error.code, message: error.message }; evidence.status = 'FAIL'; process.exitCode = 1; }
    context.db.close(); await fs.writeFile(path.join(root, 'summary.json'), JSON.stringify(evidence, null, 2));
    process.stdout.write(JSON.stringify({ root, status: evidence.status, error: evidence.error, cleanup_error: evidence.cleanup_error }) + '\n');
  }
}
if (process.argv[1] === source) await main();
