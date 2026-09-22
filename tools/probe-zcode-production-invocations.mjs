// Bounded qualification of native identity -> real receipt -> lifecycle CLI.
// Only a newly created temporary RUN is mutated; no product E2E or app patches.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { randomUUID } from 'node:crypto';

const engineRoot = fs.realpathSync(process.env.DD_FLOW_ENGINE_ROOT ?? path.resolve(import.meta.dirname, '../../dd-flow-cli'));
const bridgeBin = fs.realpathSync(process.env.DD_ZCODE_ACP_BIN ?? '/Users/deksden/Library/pnpm/zcode-acp');
const engine = relative => import(pathToFileURL(path.join(engineRoot, relative)));
const { createContext } = await engine('dist/runtime/context.js');
const { startFlowRun } = await engine('dist/services/runs.js');
const { registerFlowSession } = await engine('dist/services/sessions.js');
const { managedLifecycleCommand } = await engine('dist/services/lifecycle-invocations.js');
const { flowCommand } = await engine('dist/services/stage-pause.js');
const { prepareHarnessFlowExecutable } = await engine('dist/services/harness-adapter.js');
const { storageSessionId } = await engine('dist/services/session-identity.js');
const { AcpBridge, zcodeInvocationObserver } = await engine('src/harness-runtime/lib/dd-zcode.mjs');

const directory = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'dd-zcode-production-')));
const projectRoot = path.join(directory, 'project'); fs.mkdirSync(projectRoot);
const home = path.join(directory, 'home');
const context = createContext({ ...process.env, DD_FLOW_HOME: home, DD_FLOW_BIN: undefined, DD_FLOW_ENGINE_MODE: '1' });
const bin = prepareHarnessFlowExecutable(context, directory);
context.env.DD_FLOW_BIN = bin;
const started = startFlowRun(context, { projectRoot, flowKind: 'custom', subjectType: 'test', subjectId: 'native-invocations', slug: 'native-invocations' });
const runId = started.run.id;
const project = context.db.get('SELECT project_id FROM runs WHERE id = ?', [runId]);
const roles = ['root', 'left', 'right'];
for (const role of roles) context.db.run("INSERT INTO works (work_id, project_id, run_id, parent_work_id, task, status, launch_policy, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 'created', ?, ?, ?)",
  [`WRK-probe-${role}`, project.project_id, runId, role === 'root' ? null : 'WRK-probe-root', 'Bounded native lifecycle qualification. Execute only the supplied start/finish commands; no product changes.', role === 'root' ? 'reuse_allowed' : 'fresh_agent_required', context.now(), context.now()]);
const journal = path.join(directory, 'adapter.events.jsonl');
const daemonId = `probe-${randomUUID()}`;
const bridge = new AcpBridge({ bin: bridgeBin, cwd: projectRoot, journal, permission: 'allow', env: {
  DD_FLOW_BIN: bin, DD_FLOW_HOME: home, DD_FLOW_DAEMON_ID: daemonId,
} });
let sessionId;
console.log(JSON.stringify({ directory, runId }));
try {
  await bridge.start();
  ({ sessionId } = await bridge.request('session/new', { cwd: projectRoot, mcpServers: [] }, 30000));
  registerFlowSession(context, { sessionId, payloadJson: JSON.stringify({
    harness: 'zcode-acp', provider_session_id: sessionId, project_root: projectRoot,
    flow_kind: 'implementation', run_id: runId, session_kind: 'orchestrator',
    continuation_policy: 'go_router', workspace_path: projectRoot, cwd: projectRoot,
  }) });
  const scope = { projectRoot, daemonId, rootSessionId: sessionId, runId, generation: 0 };
  context.env.DD_FLOW_INVOCATION_SCOPE = JSON.stringify(scope);
  bridge.configure({ onLifecycleNotification: await zcodeInvocationObserver({ ddFlowBin: bin, ddFlowHome: home, projectRoot, daemonId: scope.daemonId, adapterSessionId: sessionId, journal }, sessionId) });
  const commands = Object.fromEntries(roles.map(role => [role, {
    start: managedLifecycleCommand(context, `${flowCommand(context)} work start WRK-probe-${role} --project-root ${JSON.stringify(projectRoot)} --json`),
    result: path.join(projectRoot, `${role}-result.json`),
    finish: null,
  }]));
  for (const role of roles) commands[role].finish = managedLifecycleCommand(context, `${flowCommand(context)} work finish WRK-probe-${role} --result-file ${JSON.stringify(commands[role].result)} --project-root ${JSON.stringify(projectRoot)} --json --progress-jsonl`);
  const task = role => `Use the file-writing tool to create exactly this JSON file containing {}: ${commands[role].result}\nUse Bash separately to execute exactly this start command:\n${commands[role].start}\nThen use Bash separately to execute exactly this finish command:\n${commands[role].finish}\nWait for each process to exit; never retry it or change its arguments. Report any error verbatim. Do not use shell redirection, heredoc, or create any other file.`;
  const leftTask = `Execute only this start command yourself:\n${commands.left.start}\nThen return STARTED to the parent and stop this turn. Do not finish the Work yet. No other commands, file edits, or children.`;
  const prompt = `Bounded native runtime qualification in an isolated temporary RUN, not product work. Use only the exact public commands below, no inspection or help commands. Never invent or add an invocation ID. Poll the same process handle until it exits, never retry. First use the file-writing tool to create exactly this JSON file containing {}: ${commands.root.result}\nThen use Bash separately to execute this root start command:\n${commands.root.start}\nThen create exactly two fresh subagents concurrently. LEFT task:\n${leftTask}\nRIGHT task:\n${task('right')}\nWait until LEFT returns STARTED and RIGHT completes. Use SendMessage to continue the SAME LEFT agent, with its returned agentId, asking it first to create exactly this JSON file containing {} using the file-writing tool: ${commands.left.result}\nand then use Bash separately to execute exactly:\n${commands.left.finish}\nWait for LEFT to complete. Then use Bash separately to execute this root finish command:\n${commands.root.finish}\nDo not use shell redirection or heredoc. Never execute a child's command yourself or replace an unavailable operation with a new agent. If any command or required tool is unavailable, report its actual error and stop. Answer DONE after all commands succeed.`;
  fs.writeFileSync(path.join(directory, 'request.json'), JSON.stringify({ scope, commands, prompt }, null, 2));
  const response = await bridge.request('session/prompt', { sessionId, prompt: [{ type: 'text', text: prompt }] }, 240000);
  await bridge.flush();
  const works = context.db.all('SELECT work_id, status FROM works ORDER BY work_id');
  const sessions = context.db.all('SELECT ws.work_id, s.provider_session_id, s.provider_parent_session_id FROM work_sessions ws JOIN sessions s ON s.session_id = ws.session_id AND s.project_id = ? ORDER BY ws.work_id', [project.project_id]);
  const attempts = context.db.all('SELECT status, event_key, identity_json, outcome_json FROM lifecycle_invocations');
  const evidence = { response, works, sessions, attempts, topology: await bridge.request('zcode/session/subagents', { sessionId }, 15000) };
  fs.writeFileSync(path.join(directory, 'result.json'), JSON.stringify(evidence, null, 2));
  assert.equal(works.length, 3); assert.ok(works.every(work => work.status === 'completed'));
  assert.equal(new Set(sessions.map(session => session.provider_session_id)).size, 3);
  const byRole = Object.fromEntries(sessions.map(session => [session.work_id.replace('WRK-probe-', ''), session]));
  assert.equal(byRole.root.provider_session_id, sessionId);
  const rootStorageId = storageSessionId({ harness_id: 'zcode-acp', session_id: sessionId });
  assert.equal(byRole.left.provider_parent_session_id, rootStorageId);
  assert.equal(byRole.right.provider_parent_session_id, rootStorageId);
  const settled = attempts.filter(attempt => attempt.status === 'settled');
  assert.equal(settled.length, 6);
  for (const attempt of settled) {
    const [, root, session, parent] = JSON.parse(attempt.identity_json);
    assert.equal(root, sessionId); assert.equal(parent, session === sessionId ? null : sessionId);
    assert.equal(JSON.parse(attempt.outcome_json).result.ok, true);
  }
  const events = fs.readFileSync(journal, 'utf8').trim().split('\n').map(JSON.parse);
  assert.ok(events.some(event => event.payload?.params?.update?._meta?.claudeCode?.toolName === 'SendMessage'), 'Child continuation was not exercised');
  assert.equal(evidence.topology.childSessionIds.length, 2);
  assert.deepEqual(evidence.topology.running, []);
  console.log(JSON.stringify({ status: 'PASS', capabilities: ['root', 'concurrent_children', 'child_continuation'], nested: 'not_supported_by_child_toolset', directory, works, sessions }));
} catch (error) {
  fs.writeFileSync(path.join(directory, 'failure.json'), JSON.stringify({ message: error.message, stack: error.stack }, null, 2));
  throw error;
} finally {
  if (sessionId) bridge.notify('session/cancel', { sessionId });
  await bridge.close(); context.db.close?.();
}
