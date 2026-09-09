import test from 'node:test';
import assert from 'node:assert/strict';
import { cp, mkdtemp, mkdir, writeFile, readFile, chmod, rm } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import path from 'node:path';
import os from 'node:os';
import { commandJson, commandText } from '../lib/process-json.mjs';
import { appendEvent, hashJson, readEvents, recordOperation, sha256 } from '../lib/runner-events.mjs';
import { observeManagedRun } from '../lib/managed-flow-client.mjs';
import { evalResumeWorkerFile } from '../lib/eval-resume-worker.mjs';
import { processSnapshot } from '../lib/process-snapshot.mjs';

test('public background EVAL resume continues a real retained RUN through its next stage', { skip: !process.env.DD_EVAL_TEST_FLOW_CLI || !process.env.DD_EVAL_TEST_FLOW_ADAPTER, timeout: 180_000 }, async t => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'eval-managed-resume-'));
  const definition = path.join(root, 'definition'), evalRoot = path.join(root, 'eval'), attempt = path.join(evalRoot, 'executions', 'stages');
  const project = path.join(attempt, 'project'), home = path.join(attempt, 'dd-flow-home'), cli = path.resolve(process.env.DD_EVAL_TEST_FLOW_CLI);
  const evalId = 'EVAL-managed-resume', resources = path.join(root, 'resources');
  const budget = { schema_id: 'dd-flow/runtime-budget@1', scope_id: evalId, per_harness: {} };
  const env = { DD_FLOW_HOME: home, DD_FLOW_RESOURCE_HOME: resources, DD_FLOW_RECOVERY_HOME: path.join(root, 'recovery'), DD_FLOW_ENGINE_MODE: '1', DD_FLOW_RUNTIME_BUDGET: JSON.stringify(budget), CODEX_HOME: path.join(root, 'codex-home'), DD_FLOW_TEST_ROOT: root, DD_FLOW_TEST_UNCLEAN_STOP: '0', DD_FLOW_TEST_CAPTURE_FAILURE: '0' };
  const write = async (file, value) => { await mkdir(path.dirname(file), { recursive: true }); await writeFile(file, typeof value === 'string' ? value : JSON.stringify(value)); return file; };
  const json = async file => JSON.parse(await readFile(file, 'utf8'));
  const invoke = args => commandText(process.execPath, [path.join(definition, 'bin', 'dd-eval.mjs'), 'runner', ...args], { cwd: definition, env });
  let runId, settled = false, workerExited = true;
  const stopRun = () => commandJson(cli, ['run', 'control', 'stop', '--run', runId, '--project-root', project, '--request-id', 'test-cleanup', '--force', '--wait-ms', '10000'], { cwd: project, env, signal: AbortSignal.timeout(20_000) });
  const abort = () => { if (runId && !settled) void stopRun().catch(() => {}); };
  t.signal.addEventListener('abort', abort, { once: true });
  try {
    await cp(new URL('../lib', import.meta.url), path.join(definition, 'lib'), { recursive: true });
    await cp(new URL('../bin', import.meta.url), path.join(definition, 'bin'), { recursive: true });
    for (const name of ['index', 'spec/engineering/index', 'epics/index', 'epics/EP-001-tasks/index', 'protocol/index']) await write(path.join(project, '.memory-bank', `${name}.md`), '# Fixture\n');
    await write(path.join(project, '.memory-bank/dd-flow/project-workspace.json'), { schema_id: 'dd-flow/project-workspace@1', workspace: { route: 'integration_branch_direct', integration_branch: 'main', feature_branch_template: null, provision_stage: 'protocolize_start' } });
    await write(path.join(project, '.memory-bank/dd-flow/project-execution.json'), { schema_id: 'dd-flow/project-execution@3', stage_session_mode: 'same_session', plan_review_mode: 'off', code_review_mode: 'off', merge_mode: 'server', merge_delivery: { strategy: 'local' }, merge_cleanup: { source: 'retain' }, stop_target: 'code_completed', code_bootstrap: { command: 'true', policy_ref: '.memory-bank/spec/operations/workspace-bootstrap-policy.md' }, execution: { agent_profile_id: 'first', stage_overrides: { protocolize: { agent_profile_id: 'second' } } } });
    await write(path.join(project, '.memory-bank/dd-flow/vnext/mb-sdlc-vnext-protocolize.json'), { id: 'mb-sdlc-vnext-protocolize', version: 5, stages: { specify: { entries: { default: { actions: [{ handler: 'specify.bootstrap' }, { agent: {} }, { handler: 'specify.accept' }] } } } } });
    for (const stage of ['specify', 'protocolize']) await write(path.join(project, `.memory-bank/dd-flow/vnext/${stage}.md`), 'Use the assigned authoritative Stage packet.\n');
    await write(path.join(project, '.memory-bank/dd-flow/mb-sdlc/specify/stage-report-template.html'), '<script>__STAGE_REPORT_DATA__</script>');
    for (const id of ['first', 'second']) await write(path.join(home, `agent-profiles/${id}.json`), { schema_id: 'dd-flow/agent-profile@1', id, harness: 'codex', provider: 'fixture', model: `model-${id}`, reasoning: 'low', mode: 'agent', permission: 'deny' });
    const adapter = await write(path.join(root, 'adapter.mjs'), `#!${process.execPath}\nawait import(${JSON.stringify(pathToFileURL(path.resolve(process.env.DD_EVAL_TEST_FLOW_ADAPTER)).href)});\n`); await chmod(adapter, 0o700);
    await write(path.join(home, 'harnesses.json'), { schema_id: 'dd-flow/harness-config@1', harnesses: { 'codex-desktop': { adapter_command: adapter, runtime_command: process.execPath } } });
    await mkdir(env.CODEX_HOME);
    const launcher = await write(path.join(home, 'bin', 'dd-flow'), `#!${process.execPath}\nimport(${JSON.stringify(pathToFileURL(cli).href)});\n`);
    await chmod(launcher, 0o700);
    const git = args => commandText('git', args, { cwd: project });
    await git(['init', '--quiet', '-b', 'main']); await git(['add', '.']); await git(['-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.test', 'commit', '--quiet', '-m', 'fixture']);
    const installed = await commandJson(cli, ['engine', 'install'], { cwd: project, env });
    const resolved = await commandJson(cli, ['engine', 'resolve', '--project-root', project], { cwd: project, env });
    const engine = resolved.selection.selected;
    assert.equal(engine.snapshot_root, installed.engine.snapshot_root);
    const started = await commandJson(cli, ['run', 'start', '--project-root', project, '--flow-kind', 'vnext_protocolize', '--subject-type', 'discussion', '--subject-id', 'controller-fixture', '--slug', 'controller-stages'], { cwd: project, env });
    runId = started.run.id;

    // Isolated definition pins the installed CLI, never changes the user's case.
    const checkpoint = { id: 'cp-fixture', source: { commit: await git(['rev-parse', 'HEAD']) }, flow_pack: { commit: 'b'.repeat(40), path: '.memory-bank', engine: { repository: 'fixture', commit: 'c'.repeat(40), version: engine.package_version, artifact_sha256: engine.integrity_checksum ?? engine.integrity.checksum } } };
    const cpFile = await write(path.join(definition, 'checkpoints/cp-fixture.json'), checkpoint), cpHash = sha256(await readFile(cpFile));
    const caseRoot = path.join(definition, 'cases/fixture');
    await write(path.join(caseRoot, 'assessment.json'), {});
    await write(path.join(caseRoot, 'case.json'), { schema_id: 'dd-eval/case@7', id: 'fixture', assessment: 'assessment.json', input: [], entry_pack: null, baseline_admission: { sha256: 'd'.repeat(64) }, input_checkpoint: { id: checkpoint.id, sha256: cpHash }, flow: { contour: ['specify', 'protocolize'], terminal_stage: 'protocolize' } });
    const blueprint = { schema_id: 'dd-eval/stage-context-blueprint@1', stages: Object.fromEntries(['specify', 'protocolize'].map(stage => [stage, { schema_id: 'dd-eval/stage-context@1', stage, objective: 'Fixture', task_input: [] }])) };
    await write(path.join(caseRoot, 'entry-pack-source/stage-context.json'), blueprint);
    const fixture = stage => ({ schema_id: 'dd-eval/canonical-responses@1', stage, mode: 'forbidden', max_rounds: 0, responses: [] });
    for (const stage of ['specify', 'protocolize']) await write(path.join(caseRoot, `entry-pack-source/interactions/${stage}.json`), fixture(stage));
    const execution = { id: 'stages', stage: 'specify', terminal_stage: 'protocolize', mode: 'e2e' };
    const manifest = { schema_id: 'dd-eval/runner-manifest@1', run_id: evalId, case_id: 'fixture', runtime_control_bin: cli, runtime_resource_home: resources, executions: [execution], input_checkpoint: { id: checkpoint.id, sha256: cpHash }, interaction_fixtures: Object.fromEntries(['specify', 'protocolize'].map(stage => [stage, { interaction_fixture_sha256: hashJson(fixture(stage)) }])), subject_profile: { id: 'first', harness: 'codex-desktop', model: 'model-first', reasoning: 'low' }, profile: { concurrency: { global: 1, per_harness: {} }, judge: { enabled: false } } };
    await write(path.join(evalRoot, 'manifest.json'), manifest);
    await write(path.join(attempt, 'managed-runtime.json'), { schema_id: 'dd-eval/managed-runtime@1', run_id: runId, project_root: project, runtime_root: home, runtime_budget: budget });
    const admission = await write(path.join(attempt, 'baseline.json'), { status: 'passed', checkpoint_sha256: cpHash, checkpoint_id: checkpoint.id, source_commit: checkpoint.source.commit, policy_sha256: 'd'.repeat(64), checks: [{ exit_code: 0 }] });
    const intake = await write(path.join(root, 'task.md'), 'Add task priority so members can order existing tasks.\n');
    const eventsFile = path.join(evalRoot, 'events.jsonl'), references = {};
    for (const stage of ['specify', 'protocolize']) {
      const file = await write(path.join(attempt, `${stage}.context.json`), { schema_id: 'dd-flow/stage-context@1', stage, objective: 'Specify and structure a task priority change.', task_input: [{ role: 'task', path: intake, sha256: sha256(await readFile(intake)) }] });
      references[stage] = { file, sha256: sha256(await readFile(file)) };
      await appendEvent(eventsFile, { source: 'fixture', runId: evalId, executionId: execution.id, type: 'dev.dd.eval.execution.context_prepared', data: { stage, context_file: file, materialized_context_sha256: references[stage].sha256, semantic_package_sha256: 'f'.repeat(64), context_slice_sha256: 'e'.repeat(64), baseline_admission: { file: admission, sha256: sha256(await readFile(admission)) } } });
    }
    const packageFile = await write(path.join(attempt, 'managed-context.json'), { schema_id: 'dd-flow/managed-context@1', stages: { specify: references.specify } });
    const operationId = `${evalId}:stages:launch`, requestId = `eval:${sha256(operationId)}`;
    const input = { bin: cli, env, projectRoot: project, runId, requestId, contextFile: packageFile, stopAfter: 'protocolize', captureRoot: path.join(attempt, 'boundaries'), contextFor: async () => assert.fail('successor belongs to background observer'), answerFor: async () => assert.fail('fixture must not pause'), pollMs: 100 };
    let controllerId;
    await assert.rejects(recordOperation({ eventsFile, source: 'fixture', runId: evalId, executionId: execution.id, operationId, operation: 'execution.stages.launch', action: () => observeManagedRun({ ...input, onEvent: async (event, controller) => {
      controllerId = controller.controller_id;
      if (event.type === 'context_required') throw Object.assign(new Error('initial observer disconnected'), { code: 'rpc_timeout' });
    } }) }), { code: 'rpc_timeout' });
    const held = await observeManagedRun({ ...input, controllerId, contextFor: async () => null });
    assert.equal(held.controller.status, 'waiting_for_context');
    const firstCapture = await readFile(held.boundary.manifest);
    await invoke(['control', 'pause', '--eval', evalRoot, '--request-id', 'pause']);
    const scope = args => commandJson(cli, ['runtime', 'scope', ...args], { cwd: root, env: { ...env, DD_FLOW_HOME: path.join(evalRoot, 'control-runtime') } });
    const deadline = performance.now() + 100_000;
    for (;;) {
      const status = await scope(['status', '--scope-id', evalId]);
      if (status.drain?.capture?.journal?.event_count === (await readEvents(eventsFile)).length) break;
      assert.ok(performance.now() < deadline, JSON.stringify(status)); await delay(100);
    }
    const accepted = JSON.parse(await invoke(['control', 'resume', '--eval', evalRoot, '--from', 'pause', '--request-id', 'resume']));
    assert.equal(accepted.accepted, true); workerExited = false;
    const workerFile = evalResumeWorkerFile(evalRoot, 'resume');
    let worker;
    for (;;) {
      worker = await json(workerFile);
      assert.notEqual(worker.status, 'failed', JSON.stringify(worker));
      assert.notEqual(worker.status, 'superseded', JSON.stringify(worker));
      if (worker.status === 'completed' && !(await processSnapshot()).some(item => item.pid === worker.owner_pid)) { workerExited = true; break; }
      assert.ok(performance.now() < deadline, JSON.stringify(worker)); await delay(100);
    }
    assert.equal(worker.result.state, 'completed');
    assert.equal(worker.result.executions[0].run_id, runId);
    assert.equal(worker.result.executions[0].driver.controller.controller_id, controllerId);
    const status = await commandJson(cli, ['run', 'drive', 'status', '--run', runId, '--project-root', project], { cwd: project, env });
    settled = status.controller.sessions.every(session => session.stopped);
    assert.equal(status.controller.status, 'stop_target_reached'); assert.equal(settled, true);
    assert.equal(status.controller.sessions.length, 2);
    assert.deepEqual(await readFile(held.boundary.manifest), firstCapture);
    for (const reference of Object.values(references)) assert.equal(sha256(await readFile(reference.file)), reference.sha256);
    const events = await readEvents(eventsFile);
    assert.equal(events.filter(event => event.type === 'dev.dd.eval.operation.started').length, 1);
    assert.equal(events.filter(event => event.type === 'dev.dd.eval.operation.completed').length, 1);
    const inventory = await scope(['status', '--scope-id', evalId]);
    const observers = inventory.processes.filter(record => record.kind === 'eval-observer');
    assert.equal(observers.length, 1); assert.equal(observers[0].state, 'stopped');
    const calls = (await readFile(path.join(root, 'adapter-calls.jsonl'), 'utf8')).trim().split('\n').map(JSON.parse);
    const packets = calls.filter(item => item.event === 'stage_packet');
    assert.deepEqual(packets.map(item => item.stage), ['specify', 'protocolize']);
    assert.deepEqual(packets.map(item => item.model), ['model-first', 'model-second']);
    assert.deepEqual(calls.filter(item => item.event === 'recovery_ack').map(item => item.session_id), [packets[0].session_id]);
  } finally {
    if (runId && (!settled || !workerExited)) {
      await commandJson(cli, ['runtime', 'scope', 'stop', '--scope-id', evalId, '--request-id', 'cleanup'], { cwd: root, env: { ...env, DD_FLOW_HOME: path.join(evalRoot, 'control-runtime') } });
      const receipt = await stopRun();
      settled = receipt.settled === true;
      const worker = await json(evalResumeWorkerFile(evalRoot, 'resume')).catch(() => null);
      workerExited = !worker?.owner_pid || !(await processSnapshot()).some(item => item.pid === worker.owner_pid);
    }
    t.signal.removeEventListener('abort', abort);
    if ((!runId || settled) && workerExited) await rm(root, { recursive: true, force: true });
    else throw new Error(`Owned integration did not settle; retained ${root}`);
  }
});
