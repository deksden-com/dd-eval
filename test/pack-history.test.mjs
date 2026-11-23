import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, readFile, readdir, writeFile, rm, realpath } from 'node:fs/promises';
import { DatabaseSync } from 'node:sqlite';
import os from 'node:os';
import path from 'node:path';
import { readPackHistory, readPackPlanReviewBinding, readPackRevisionChain } from '../lib/recovery/pack-history.mjs';
import { readPackReviewerGraph } from '../lib/recovery/pack-review-graph.mjs';
import { assertLegacySnapshot } from '../lib/cases/frozen-evidence.mjs';
import { snapshotTreeHash } from '../lib/recovery/snapshot-tree.mjs';

const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const hybrid = input => { const canonical = value => Array.isArray(value) ? value.map(canonical) : value && typeof value === 'object'
  ? Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b, 'en')).map(([key, child]) => [key, canonical(child)])) : value;
  return hash(JSON.stringify(canonical(input))); };
const write = async (file, value) => { await mkdir(path.dirname(file), { recursive: true }); await writeFile(file, typeof value === 'string' ? value : JSON.stringify(value)); };

async function fixture(t, { pset = false, graph = false, revisionChain = false } = {}) {
  const snapshot = await realpath(await mkdtemp(path.join(os.tmpdir(), 'eval-pack-history-')));
  t.after(() => rm(snapshot, { recursive: true, force: true }));
  const runtime = path.join(snapshot, 'runtime'), runDir = path.join(runtime, 'projects/PRJ-one/runs/RUN-one');
  await mkdir(runDir, { recursive: true });
  const pack = { schema_id: 'dd-flow/flow-pack-bundle@1', project_commit: 'c'.repeat(40), canon_commit: 'd'.repeat(40), engine_checksum: 'a'.repeat(64), engine_version: '1', engine_manifest_sha256: 'b'.repeat(64) };
  const packBytes = JSON.stringify(pack), packSha = hash(packBytes), binding = { schema_id: 'dd-flow/run-engine-binding@1', run_id: 'RUN-one', project_root: '/project', engine: { integrity_checksum: pack.engine_checksum, engine_version: '1' } };
  await write(path.join(runDir, 'flow-pack-bundle/manifest.json'), packBytes);
  await write(path.join(runDir, 'engine-binding.json'), binding);
  const state = { schema_id: 'dd-flow/run-state@1', project_id: 'PRJ-one', run_id: 'RUN-one', pack: { flow_id: 'mb-sdlc', version: '1', sha256: packSha }, cursor: { stage: 'code', visit: 1 }, visits: revisionChain ? [
    { stage: 'plan', visit: 1, attempt: 1, status: 'done', outcome: 'review', result: 'run://plan/1/result.json' },
    { stage: 'plan-review', visit: 1, attempt: 1, status: 'done', outcome: 'revise', result: 'run://plan-review/1/result.json' },
    { stage: 'plan', visit: 2, attempt: 1, status: 'done', outcome: 'review', result: 'run://plan/2/result.json' },
    { stage: 'plan-review', visit: 2, attempt: 1, status: 'done', outcome: 'accepted', result: 'run://plan-review/2/result.json' },
    { stage: 'code', visit: 1, attempt: 1, status: 'running' }
  ] : [
    { stage: 'plan-review', visit: 1, attempt: 1, status: 'done', outcome: 'revise', result: 'run://plan-review/1/result.json' },
    { stage: 'plan', visit: 1, attempt: 1, status: 'done', outcome: 'review', result: 'run://plan/1/result.json' },
    { stage: 'plan-review', visit: 2, attempt: 1, status: 'done', outcome: 'accepted', result: 'run://plan-review/2/result.json' },
    { stage: 'code', visit: 1, attempt: 1, status: 'running' }
  ] };
  const index = JSON.stringify({ root_work_id: 'WRK-root', pack_state: state });
  const database = path.join(runtime, 'db.sqlite'), db = new DatabaseSync(database);
  db.exec('CREATE TABLE runs(project_id TEXT,id TEXT,run_root TEXT,index_json TEXT); CREATE TABLE works(project_id TEXT,run_id TEXT,work_id TEXT,parent_work_id TEXT,payload_json TEXT,task TEXT,launch_policy TEXT,result_schema TEXT,depends_on_json TEXT,status TEXT,result TEXT); CREATE TABLE audit_events(id INTEGER PRIMARY KEY,project_id TEXT,event_type TEXT,payload_json TEXT); CREATE TABLE work_sessions(id TEXT,work_id TEXT,status TEXT,start_receipt_json TEXT); CREATE TABLE stage_work_memberships(project_id TEXT,run_id TEXT,stage TEXT,attempt TEXT,work_id TEXT,cycle TEXT)');
  const anchor = { run_id: 'RUN-one', flow_id: 'mb-sdlc', pack_sha256: packSha };
  db.prepare('INSERT INTO runs VALUES(?,?,?,?)').run('PRJ-one', 'RUN-one', '/source/projects/PRJ-one/runs/RUN-one', index);
  db.prepare('INSERT INTO works(project_id,run_id,work_id,parent_work_id,payload_json) VALUES(?,?,?,?,?)').run('PRJ-one', 'RUN-one', 'WRK-root', null, JSON.stringify({ pack_run_coordinator: anchor }));
  db.prepare('INSERT INTO audit_events(project_id,event_type,payload_json) VALUES(?,?,?)').run('PRJ-one', 'flow_run.pack_root_work', JSON.stringify({ ...anchor, work_id: 'WRK-root' }));
  const members = ['PRT-one', 'PRT-two'].map(protocol_id => {
    const bytes = JSON.stringify({ schema_id: 'dd-flow/protocol-plan@6', protocol_id, revision: 2 });
    const sha256 = hash(bytes);
    return { bytes, schema_id: 'dd-flow/protocol-plan@6', protocol_id, ref: `run://plan/1/artifacts/${sha256}`, sha256, revision: 2 };
  });
  const planValue = pset ? { schema_id: 'dd-flow/protocol-plan-set@1', plans: members.map(({ bytes, ...member }) => member) }
    : { schema_id: 'dd-flow/protocol-plan@6', protocol_id: 'PRT-one', revision: 2 };
  const oldPlan = { schema_id: 'dd-flow/protocol-plan@6', protocol_id: 'PRT-one', plan_id: 'PLAN-one', revision: 1, objective: 'old' };
  const newPlan = { ...oldPlan, revision: 2, objective: 'new' };
  const revise = { schema_id: 'dd-flow/plan-review-transition@1', outcome: 'revise', plan_ref: 'run://plan/1/result.json', plan_sha256: hash(JSON.stringify(oldPlan)), reason: 'Fix scope' };
  const decision = { schema_id: 'dd-flow/plan-review-decision@4', outcome: 'accepted', correction: { status: 'not_required', previous_plan_revision: 2 } };
  for (const [i, visit] of state.visits.slice(0, -1).entries()) {
    const session = `WS-${String(i + 1).padStart(8, '0')}-0000-0000-0000-000000000000`, value = revisionChain ? [oldPlan, revise, newPlan, decision][i] : i === 1 ? planValue : i === 2 ? decision : { marker: i }, bytes = JSON.stringify(value), digest = hash(bytes);
    const retained = { schema_id: 'dd-flow/pack-artifacts@1', candidate: `candidate-${String(i + 1).padStart(8, '0')}-0000-0000-0000-000000000000`, owner: { host: 'fixture', pid: 1 }, entries: [{ ref: visit.result, sha256: digest }, ...(i === 1 && pset ? members.map(member => ({ ref: member.ref, sha256: member.sha256 })) : [])] };
    await write(path.join(runDir, 'pack-retained', retained.candidate, 'owner.json'), retained);
    await write(path.join(runDir, 'pack-retained', retained.candidate, digest), bytes);
    if (i === 1 && pset) for (const member of members) await write(path.join(runDir, 'pack-retained', retained.candidate, member.sha256), member.bytes);
    const issuedState = structuredClone(state); issuedState.cursor = { stage: visit.stage, visit: visit.visit };
    issuedState.visits[i] = { ...visit, status: 'running' };
    if (!revisionChain && i === 2) issuedState.flow = { plan: { visit: 1, ref: 'run://plan/1/result.json', sha256: hash(JSON.stringify(planValue)) } };
    if (revisionChain && [1, 2, 3].includes(i)) {
      const prior = i === 3 ? newPlan : oldPlan, number = i === 3 ? 2 : 1;
      issuedState.flow = { plan: { visit: number, ref: `run://plan/${number}/result.json`, sha256: hash(JSON.stringify(prior)) } };
    }
    const start = { generation: 0, run_state: JSON.stringify(issuedState), pack_start: { stage: visit.stage, visit: visit.visit, attempt: visit.attempt } }; start.run_state_sha256 = hash(start.run_state);
    db.prepare('INSERT INTO work_sessions VALUES(?,?,?,?)').run(session, 'WRK-root', 'completed', JSON.stringify(start));
    db.prepare('INSERT INTO stage_work_memberships VALUES(?,?,?,?,?,?)').run('PRJ-one', 'RUN-one', visit.stage, `visit-${visit.visit}`, 'WRK-root', '');
    if (i === 2 && graph) {
      const scope = { project_id: 'PRJ-one', run_id: 'RUN-one', stage: 'plan-review', attempt: 'visit-2', cycle: '', parent_work_id: 'WRK-root', request_key: 'review-v2' };
      const requestSha = hybrid(scope), batchSha = 'e'.repeat(64), workId = 'WRK-reviewer', childSession = 'WS-00000004-0000-0000-0000-000000000000';
      const workPayload = { kind: 'plan-review', read_only: true, plan_visit: 1, plan_sha256: hash(JSON.stringify(planValue)), review_visit: 2, group: { key: 'reviewer', protocol_id: 'PRT-one', plan_revision: 2, aspect_ids: [] },
        _dd_flow_batch_request: { request_sha256: requestSha, batch_sha256: batchSha, item_key: 'reviewer' } };
      const childValue = { schema_id: 'dd-flow/plan-review-result@1', plan_revision: 2, aspects: [] }, childBytes = JSON.stringify(childValue), childSha = hash(childBytes);
      const immutable = { work_id: workId, project_id: 'PRJ-one', run_id: 'RUN-one', parent_work_id: 'WRK-root', task: 'Review', launch_policy: 'fresh_agent_required',
        result_schema: 'dd-flow/plan-review-result@1', payload: workPayload, depends_on: [] };
      db.prepare('INSERT INTO works VALUES(?,?,?,?,?,?,?,?,?,?,?)').run('PRJ-one', 'RUN-one', workId, 'WRK-root', JSON.stringify(workPayload), 'Review', 'fresh_agent_required', immutable.result_schema, '[]', 'completed', childBytes);
      db.prepare('INSERT INTO stage_work_memberships VALUES(?,?,?,?,?,?)').run('PRJ-one', 'RUN-one', 'plan-review', 'visit-2', workId, '');
      db.prepare('INSERT INTO work_sessions VALUES(?,?,?,?)').run(childSession, workId, 'completed', '{}');
      const ids = { reviewer: workId }, batch = { run_id: 'RUN-one', scope, request_sha256: requestSha, batch_sha256: batchSha, work_ids: ids, work_sha256: { [workId]: hybrid(immutable) } };
      db.prepare('INSERT INTO audit_events(project_id,event_type,payload_json) VALUES(?,?,?)').run('PRJ-one', 'work.batch_registration', JSON.stringify(batch));
      const graphReceipt = { run_id: 'RUN-one', stage: 'plan-review', visit: 2, attempt: 1, generation: 0, work_session_id: session,
        plan_ref: 'run://plan/1/result.json', plan_visit: 1, plan_sha256: hash(JSON.stringify(planValue)), items_sha256: batchSha, work_ids: ids };
      db.prepare('INSERT INTO audit_events(project_id,event_type,payload_json) VALUES(?,?,?)').run('PRJ-one', 'flow_run.pack_review_graph_registered', JSON.stringify(graphReceipt));
      const componentInputs = { schema_id: 'dd-flow/pack-component-inputs@1', stages: ['plan-review'], files: [], listings: [], access_failures: false };
      const observation = { run_id: 'RUN-one', stage: 'plan-review', visit: 2, attempt: 1, generation: 0, work_id: 'WRK-root', work_session_id: session, command: 'dispatch',
        component_inputs: componentInputs, component_inputs_sha256: hash(JSON.stringify(componentInputs)) };
      db.prepare('INSERT INTO audit_events(project_id,event_type,payload_json) VALUES(?,?,?)').run('PRJ-one', 'flow_run.pack_component_observation', JSON.stringify(observation));
      const ref = `run://plan-review/2/work-results/${workId}/${childSession}/result.json`, childRetained = { schema_id: 'dd-flow/pack-artifacts@1',
        candidate: 'candidate-00000004-0000-0000-0000-000000000000', owner: { host: 'fixture', pid: 1 }, entries: [{ ref, sha256: childSha }] };
      await write(path.join(runDir, 'pack-retained', childRetained.candidate, 'owner.json'), childRetained);
      await write(path.join(runDir, 'pack-retained', childRetained.candidate, childSha), childBytes);
      const childReceipt = { run_id: 'RUN-one', stage: 'plan-review', visit: 2, attempt: 1, generation: 0, work_id: workId, work_session_id: childSession,
        operation: 'work', input_sha256: childSha, artifacts: childRetained };
      db.prepare('INSERT INTO audit_events(project_id,event_type,payload_json) VALUES(?,?,?)').run('PRJ-one', 'flow_run.pack_submission_accepted', JSON.stringify(childReceipt));
    }
    const successor = state.visits[i + 1], response = { ok: true, run_id: 'RUN-one', stage: visit.stage, visit: visit.visit, work_id: 'WRK-root', attempt_id: session, request_id: `request-${i}`, outcome: visit.outcome, value, result_ref: visit.result, next: { stage: successor.stage, visit: successor.visit } };
    const receipt = { run_id: 'RUN-one', stage: visit.stage, visit: visit.visit, attempt: visit.attempt, generation: 0, work_id: 'WRK-root', work_session_id: session, request_id: response.request_id, operation: 'finish', input_sha256: digest, artifacts: retained, response };
    db.prepare('INSERT INTO audit_events(project_id,event_type,payload_json) VALUES(?,?,?)').run('PRJ-one', 'flow_run.pack_submission_accepted', JSON.stringify(receipt));
  }
  db.close();
  async function seal() {
    const reader = new DatabaseSync(database, { readOnly: true });
    const rows = reader.prepare("SELECT id,event_type,payload_json FROM audit_events WHERE project_id=? AND event_type IN ('flow_run.pack_root_work','flow_run.pack_submission_accepted','flow_run.pack_review_graph_registered') AND json_extract(payload_json,'$.run_id')=? ORDER BY id").all('PRJ-one', 'RUN-one');
    const history = [
      ['works', reader.prepare('SELECT * FROM works WHERE project_id=? AND run_id=? ORDER BY work_id').all('PRJ-one', 'RUN-one')],
      ['work_sessions', reader.prepare('SELECT * FROM work_sessions WHERE work_id IN (SELECT work_id FROM works WHERE project_id=? AND run_id=?) ORDER BY id').all('PRJ-one', 'RUN-one')],
      ['stage_work_memberships', reader.prepare('SELECT * FROM stage_work_memberships WHERE project_id=? AND run_id=? ORDER BY rowid').all('PRJ-one', 'RUN-one')],
      ['batch', reader.prepare("SELECT * FROM audit_events WHERE project_id=? AND event_type='work.batch_registration' AND json_valid(payload_json) AND json_extract(payload_json,'$.run_id')=? ORDER BY id").all('PRJ-one', 'RUN-one')]
    ];
    reader.close();
    const files = [];
    for (const candidate of await readdir(path.join(runDir, 'pack-retained'))) for (const name of await readdir(path.join(runDir, 'pack-retained', candidate))) {
      const bytes = await readFile(path.join(runDir, 'pack-retained', candidate, name));
      files.push({ path: `pack-retained/${candidate}/${name}`, sha256: hash(bytes), size: bytes.length });
    }
    const manifest = { schema_id: 'dd-flow/eval-run-snapshot@5', purpose: 'candidate', run_id: 'RUN-one', project_id: 'PRJ-one', project_root: '/project', dd_flow_home: '/source', assessment_only: true, consistency: 'controller_boundary_writer_barrier@1', boundary_capture: {}, runtime_sha256: snapshotTreeHash(runtime), pack_evidence: { schema_id: 'dd-flow/pack-snapshot-evidence@1', run_id: 'RUN-one', project_id: 'PRJ-one', source_run_root: '/source/projects/PRJ-one/runs/RUN-one', index_sha256: hash(index), rows_sha256: hash(JSON.stringify({ rows, history })), files, publication: 'published' } };
    const bytes = JSON.stringify(manifest); await write(path.join(snapshot, 'snapshot.json'), bytes); return hash(bytes);
  }
  const snapshotSha256 = await seal();
  return { snapshot, snapshotSha256, database, runDir, seal };
}

test('selects the second accepted visit and preserves return, successor and pins', async t => {
  const f = await fixture(t), result = await readPackHistory({ ...f, runId: 'RUN-one', publications: [{ stage: 'plan-review', visit: 1 }, { stage: 'plan-review', visit: 2 }] });
  assert.deepEqual(result.visits.map(v => [v.visit, v.outcome, v.successor]), [[1, 'revise', { stage: 'plan', visit: 1 }], [2, 'accepted', { stage: 'code', visit: 1 }]]);
  assert.equal(result.pack.canon_commit, 'd'.repeat(40)); assert.equal(result.pack.engine_checksum, 'a'.repeat(64));
  assert.equal(result.coverage.matrix_components, 'unavailable');
});

test('rejects foreign RUN, absent visit, successor substitution and changed bytes', async t => {
  const f = await fixture(t), select = { ...f, runId: 'RUN-one', publications: [{ stage: 'plan-review', visit: 2 }] };
  await assert.rejects(readPackHistory({ ...select, runId: 'RUN-other' }), { code: 'pack_history_invalid' });
  await assert.rejects(readPackHistory({ ...select, publications: [{ stage: 'plan-review', visit: 3 }] }), { code: 'pack_history_invalid' });
  await assert.rejects(readPackHistory({ ...select, snapshotSha256: '0'.repeat(64) }), { code: 'pack_history_invalid' });
  const db = new DatabaseSync(f.database), row = db.prepare("SELECT id,payload_json FROM audit_events WHERE event_type='flow_run.pack_submission_accepted' AND json_extract(payload_json,'$.visit')=2").get();
  const receipt = JSON.parse(row.payload_json); receipt.response.next.stage = 'merge';
  db.prepare('UPDATE audit_events SET payload_json=? WHERE id=?').run(JSON.stringify(receipt), row.id); db.close();
  await assert.rejects(readPackHistory({ ...select, snapshotSha256: await f.seal() }), { code: 'pack_history_invalid' });
  await writeFile(path.join(f.runDir, 'engine-binding.json'), 'changed');
  await assert.rejects(readPackHistory(select), { code: 'pack_history_invalid' });
});


test('checker can expose exact requested visits while keeping acceptance unavailable', async t => {
  const f = await fixture(t);
  const checkpoint = { manifest_sha256: f.snapshotSha256, pack_history_request: {
    schema_id: 'dd-eval/pack-history-request@1', run_id: 'RUN-one', publications: [{ stage: 'plan-review', visit: 2 }]
  } };
  await assert.rejects(assertLegacySnapshot({ run_id: 'RUN-one', assessment_only: true }, { snapshot: f.snapshot, checkpoint }), error => {
    assert.equal(error.code, 'pack_history_checker_unavailable');
    assert.equal(error.history.visits[0].visit, 2);
    assert.equal(error.history.coverage.matrix_components, 'unavailable');
    return true;
  });
  checkpoint.pack_history_request = { schema_id: 'dd-eval/pack-plan-review-request@1', run_id: 'RUN-one', plan_visit: 1, review_visit: 2 };
  await assert.rejects(assertLegacySnapshot({ run_id: 'RUN-one', assessment_only: true }, { snapshot: f.snapshot, checkpoint }), error => {
    assert.equal(error.code, 'pack_history_checker_unavailable');
    assert.equal(error.history.plan.revision, 2);
    assert.equal(error.history.review.visit, 2);
    return true;
  });
  checkpoint.pack_history_request.run_id = 'RUN-foreign';
  await assert.rejects(assertLegacySnapshot({ run_id: 'RUN-one', assessment_only: true }, { snapshot: f.snapshot, checkpoint }), { code: 'pack_history_invalid' });
});


test('binds a second review to its exact issued PLAN revision and rejects substitution', async t => {
  const f = await fixture(t), input = { ...f, runId: 'RUN-one', planVisit: 1, reviewVisit: 2 };
  const binding = await readPackPlanReviewBinding(input);
  assert.equal(binding.plan.revision, 2);
  assert.equal(binding.review.visit, 2);
  assert.equal(binding.coverage.reviewer_graph, 'unavailable');
  await assert.rejects(readPackPlanReviewBinding({ ...input, planVisit: 2 }), { code: 'pack_history_invalid' });
  const db = new DatabaseSync(f.database), row = db.prepare("SELECT id,start_receipt_json FROM work_sessions WHERE id LIKE 'WS-00000003-%'").get();
  const start = JSON.parse(row.start_receipt_json), issued = JSON.parse(start.run_state);
  issued.flow.plan.sha256 = 'f'.repeat(64); start.run_state = JSON.stringify(issued); start.run_state_sha256 = hash(start.run_state);
  db.prepare('UPDATE work_sessions SET start_receipt_json=? WHERE id=?').run(JSON.stringify(start), row.id); db.close();
  await assert.rejects(readPackPlanReviewBinding({ ...input, snapshotSha256: await f.seal() }), { code: 'pack_history_invalid' });
});


test('binds each retained PLAN set member to the selected review', async t => {
  const f = await fixture(t, { pset: true }), input = { ...f, runId: 'RUN-one', planVisit: 1, reviewVisit: 2 };
  const binding = await readPackPlanReviewBinding(input);
  assert.deepEqual(binding.plan.members.map(member => [member.protocol_id, member.revision]), [['PRT-one', 2], ['PRT-two', 2]]);
  const member = binding.plan.members[0];
  await writeFile(path.join(f.runDir, 'pack-retained', 'candidate-00000002-0000-0000-0000-000000000000', member.sha256), 'substituted');
  await assert.rejects(readPackPlanReviewBinding({ ...input, snapshotSha256: await f.seal() }), { code: 'pack_history_invalid' });
});


test('binds reviewer graph, dispatch and child receipt and rejects missing dispatch', async t => {
  const f = await fixture(t, { graph: true }), input = { ...f, runId: 'RUN-one', planVisit: 1, reviewVisit: 2 };
  const graph = await readPackReviewerGraph(input);
  assert.equal(graph.children[0].work_id, 'WRK-reviewer');
  assert.equal(graph.coverage.matrix_components, 'unavailable');
  const db = new DatabaseSync(f.database);
  const row = db.prepare("SELECT id,payload_json FROM audit_events WHERE event_type='flow_run.pack_review_graph_registered'").get();
  const changed = JSON.parse(row.payload_json); changed.plan_sha256 = 'f'.repeat(64);
  db.prepare('UPDATE audit_events SET payload_json=? WHERE id=?').run(JSON.stringify(changed), row.id); db.close();
  await assert.rejects(readPackReviewerGraph({ ...input, snapshotSha256: await f.seal() }), { code: 'pack_history_invalid' });
  const restored = new DatabaseSync(f.database);
  restored.prepare('UPDATE audit_events SET payload_json=? WHERE id=?').run(row.payload_json, row.id);
  restored.prepare("DELETE FROM audit_events WHERE event_type='flow_run.pack_component_observation'").run(); restored.close();
  await assert.rejects(readPackReviewerGraph({ ...input, snapshotSha256: await f.seal() }), { code: 'pack_history_invalid' });
});


test('traces revise through a substantive new PLAN and second review', async t => {
  const f = await fixture(t, { revisionChain: true });
  const input = { ...f, runId: 'RUN-one', previousPlanVisit: 1, previousReviewVisit: 1, planVisit: 2, reviewVisit: 2 };
  const chain = await readPackRevisionChain(input);
  assert.equal(chain.previous.review.outcome, 'revise');
  assert.equal(chain.previous.plan.revision, 1); assert.equal(chain.current.plan.revision, 2);
  assert.equal(chain.coverage.matrix_components, 'unavailable');
  const checkpoint = { manifest_sha256: f.snapshotSha256, pack_history_request: { schema_id: 'dd-eval/pack-revision-chain-request@1', run_id: 'RUN-one',
    previous_plan_visit: 1, previous_review_visit: 1, plan_visit: 2, review_visit: 2 } };
  await assert.rejects(assertLegacySnapshot({ run_id: 'RUN-one', assessment_only: true }, { snapshot: f.snapshot, checkpoint }), error => {
    assert.equal(error.code, 'pack_history_checker_unavailable'); assert.equal(error.history.current.plan.revision, 2); return true;
  });
  const db = new DatabaseSync(f.database), row = db.prepare("SELECT id,start_receipt_json FROM work_sessions WHERE id LIKE 'WS-00000003-%'").get();
  const start = JSON.parse(row.start_receipt_json), issued = JSON.parse(start.run_state);
  issued.flow.plan.sha256 = 'f'.repeat(64); start.run_state = JSON.stringify(issued); start.run_state_sha256 = hash(start.run_state);
  db.prepare('UPDATE work_sessions SET start_receipt_json=? WHERE id=?').run(JSON.stringify(start), row.id); db.close();
  await assert.rejects(readPackRevisionChain({ ...input, snapshotSha256: await f.seal() }), { code: 'pack_history_invalid' });
});
