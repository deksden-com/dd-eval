import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, cp, readFile, readdir, writeFile, rm, realpath } from 'node:fs/promises';
import { DatabaseSync } from 'node:sqlite';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import os from 'node:os';
import path from 'node:path';
import { readPackHistory, readPackCatalogHistory, readPackPlanReviewBinding, readPackRevisionChain } from '../lib/recovery/pack-history.mjs';
import { readPackReviewerGraph, readPackRevisionGraphs } from '../lib/recovery/pack-review-graph.mjs';
import { assertLegacySnapshot } from '../lib/cases/frozen-evidence.mjs';
import { attachCaseAcceptance } from '../lib/cases/acceptance-receipts.mjs';
import { snapshotTreeHash } from '../lib/recovery/snapshot-tree.mjs';
import { assertVerificationMatrixQualification, engineArtifactDigest } from '../lib/engine-admission.mjs';
import { matrixComponentFingerprint } from '../lib/verification-components.mjs';
import { verificationMatrixFingerprint } from '../lib/verification-matrix-schema.mjs';

const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const hybrid = input => { const canonical = value => Array.isArray(value) ? value.map(canonical) : value && typeof value === 'object'
  ? Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b, 'en')).map(([key, child]) => [key, canonical(child)])) : value;
  return hash(JSON.stringify(canonical(input))); };
const write = async (file, value) => { await mkdir(path.dirname(file), { recursive: true }); await writeFile(file, typeof value === 'string' ? value : JSON.stringify(value)); };

async function fixture(t, { pset = false, graph = false, revisionChain = false, aspectOnly = false, components = false, codeCustody = false, extraExec = false, engineChecksum = 'a'.repeat(64) } = {}) {
  const snapshot = await realpath(await mkdtemp(path.join(os.tmpdir(), 'eval-pack-history-')));
  t.after(() => rm(snapshot, { recursive: true, force: true }));
  const runtime = path.join(snapshot, 'runtime'), runDir = path.join(runtime, 'projects/PRJ-one/runs/RUN-one');
  await mkdir(runDir, { recursive: true });
  const componentFiles = { 'descriptor.json': '{}', 'modules/helper.mjs': 'export const value = 1;', 'modules/plan.mjs': "import { value } from './helper.mjs'; export { value };", 'modules/plan-review.mjs': "import { value } from './helper.mjs'; export { value };", 'modules/unused.mjs': 'export const unused = true;', 'modules/independent.mjs': 'export const independent = true;', 'schemas/result.json': '{"$ref":"ref.json"}', 'schemas/ref.json': '{"type":"object"}' };
  const pack = { schema_id: 'dd-flow/flow-pack-bundle@1', project_commit: 'c'.repeat(40), canon_commit: 'd'.repeat(40), engine_checksum: engineChecksum, engine_version: '1', engine_manifest_sha256: 'b'.repeat(64),
    ...(components ? { descriptor: 'descriptor.json', inventory: Object.entries(componentFiles).map(([path, bytes]) => ({ path, sha256: hash(bytes) })) } : {}) };
  const packBytes = JSON.stringify(pack), packSha = hash(packBytes), binding = { schema_id: 'dd-flow/run-engine-binding@1', run_id: 'RUN-one', project_root: '/project', engine: { integrity_checksum: pack.engine_checksum, engine_version: '1' } };
  await write(path.join(runDir, 'flow-pack-bundle/manifest.json'), packBytes);
  if (components) for (const [name, bytes] of Object.entries(componentFiles)) await write(path.join(runDir, 'flow-pack-bundle/files', name), bytes);
  const scopeFor = stage => ({ schema_id: 'dd-flow/pack-component-inputs@1', stages: [stage],
    files: ['descriptor.json', 'modules/helper.mjs', `modules/${stage}.mjs`, 'schemas/ref.json', 'schemas/result.json'].sort().map(name => ({ path: name, sha256: hash(componentFiles[name]) })), listings: [], access_failures: false });
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
  if (codeCustody) for (const event of ['flow_run.pack_code_review_graph_registered', 'flow_run.pack_code_git_stage_decision'])
    db.prepare('INSERT INTO audit_events(project_id,event_type,payload_json) VALUES(?,?,?)').run('PRJ-one', event, JSON.stringify({ run_id: 'RUN-one' }));
  const members = ['PRT-one', 'PRT-two'].map(protocol_id => {
    const bytes = JSON.stringify({ schema_id: 'dd-flow/protocol-plan@6', protocol_id, revision: 2 });
    const sha256 = hash(bytes);
    return { bytes, schema_id: 'dd-flow/protocol-plan@6', protocol_id, ref: `run://plan/1/artifacts/${sha256}`, sha256, revision: 2 };
  });
  const planValue = pset ? { schema_id: 'dd-flow/protocol-plan-set@1', plans: members.map(({ bytes, ...member }) => member) }
    : { schema_id: 'dd-flow/protocol-plan@6', protocol_id: 'PRT-one', revision: 2 };
  const oldPlan = { schema_id: 'dd-flow/protocol-plan@6', protocol_id: 'PRT-one', plan_id: 'PLAN-one', revision: 1, objective: 'old' };
  const newPlan = aspectOnly ? { ...oldPlan } : { ...oldPlan, revision: 2, objective: 'new' };
  const oldMap = { schema_id: 'dd-flow/plan-aspect-map@3', protocol_id: 'PRT-one', plan_id: 'PLAN-one', plan_revision: 1, aspects: ['before'] };
  const newMap = { ...oldMap, plan_revision: newPlan.revision, aspects: ['after'] };
  const mapBinding = (value, visit) => { const bytes = JSON.stringify(value), sha256 = hash(bytes);
    return { protocol_id: value.protocol_id, ref: `run://plan/${visit}/artifacts/${sha256}`, sha256, bytes }; };
  const revise = { schema_id: 'dd-flow/plan-review-transition@1', outcome: 'revise', plan_ref: 'run://plan/1/result.json', plan_sha256: hash(JSON.stringify(oldPlan)), reason: 'Fix scope' };
  const decision = { schema_id: 'dd-flow/plan-review-decision@4', outcome: 'accepted', correction: { status: 'not_required', previous_plan_revision: newPlan.revision } };
  for (const [i, visit] of state.visits.slice(0, -1).entries()) {
    const session = `WS-${String(i + 1).padStart(8, '0')}-0000-0000-0000-000000000000`, value = revisionChain ? [oldPlan, revise, newPlan, decision][i] : i === 1 ? planValue : i === 2 ? decision : { marker: i }, bytes = JSON.stringify(value), digest = hash(bytes);
    const map = revisionChain && visit.stage === 'plan' ? mapBinding(visit.visit === 1 ? oldMap : newMap, visit.visit) : null;
    const retained = { schema_id: 'dd-flow/pack-artifacts@1', candidate: `candidate-${String(i + 1).padStart(8, '0')}-0000-0000-0000-000000000000`, owner: { host: 'fixture', pid: 1 }, entries: [{ ref: visit.result, sha256: digest }, ...(i === 1 && pset ? members.map(member => ({ ref: member.ref, sha256: member.sha256 })) : []), ...(map ? [{ ref: map.ref, sha256: map.sha256 }] : [])] };
    await write(path.join(runDir, 'pack-retained', retained.candidate, 'owner.json'), retained);
    await write(path.join(runDir, 'pack-retained', retained.candidate, digest), bytes);
    if (i === 1 && pset) for (const member of members) await write(path.join(runDir, 'pack-retained', retained.candidate, member.sha256), member.bytes);
    if (map) await write(path.join(runDir, 'pack-retained', retained.candidate, map.sha256), map.bytes);
    const issuedState = structuredClone(state); issuedState.cursor = { stage: visit.stage, visit: visit.visit };
    issuedState.visits[i] = { ...visit, status: 'running' };
    if (!revisionChain && i === 2) issuedState.flow = { plan: { visit: 1, ref: 'run://plan/1/result.json', sha256: hash(JSON.stringify(planValue)) } };
    if (revisionChain && [1, 2, 3].includes(i)) {
      const prior = i === 3 ? newPlan : oldPlan, number = i === 3 ? 2 : 1;
      const selectedMap = mapBinding(number === 1 ? oldMap : newMap, number);
      issuedState.flow = { plan: { visit: number, ref: `run://plan/${number}/result.json`, sha256: hash(JSON.stringify(prior)), aspect_maps: [{ protocol_id: selectedMap.protocol_id, ref: selectedMap.ref, sha256: selectedMap.sha256 }] } };
    }
    const componentScope = components ? scopeFor(visit.stage) : null;
    const start = { generation: 0, run_state: JSON.stringify(issuedState), pack_start: { stage: visit.stage, visit: visit.visit, attempt: visit.attempt,
      ...(componentScope ? { component_inputs: componentScope, component_inputs_sha256: hash(JSON.stringify(componentScope)) } : {}) } }; start.run_state_sha256 = hash(start.run_state);
    db.prepare('INSERT INTO work_sessions VALUES(?,?,?,?)').run(session, 'WRK-root', 'completed', JSON.stringify(start));
    db.prepare('INSERT INTO stage_work_memberships VALUES(?,?,?,?,?,?)').run('PRJ-one', 'RUN-one', visit.stage, `visit-${visit.visit}`, 'WRK-root', '');
    if (graph && visit.stage === 'plan-review' && (revisionChain || i === 2)) {
      const reviewNumber = visit.visit, selectedPlan = revisionChain ? (reviewNumber === 1 ? oldPlan : newPlan) : planValue;
      const planNumber = revisionChain ? reviewNumber : 1, revision = selectedPlan.revision ?? 2;
      const scope = { project_id: 'PRJ-one', run_id: 'RUN-one', stage: 'plan-review', attempt: `visit-${reviewNumber}`, cycle: '', parent_work_id: 'WRK-root', request_key: `review-v${reviewNumber}` };
      const childIndex = revisionChain ? 4 + reviewNumber : 4;
      const requestSha = hybrid(scope), batchSha = (reviewNumber === 1 ? 'd' : 'e').repeat(64), workId = revisionChain ? `WRK-reviewer-${reviewNumber}` : 'WRK-reviewer';
      const childSession = `WS-${String(childIndex).padStart(8, '0')}-0000-0000-0000-000000000000`;
      const workPayload = { kind: 'plan-review', read_only: true, plan_visit: planNumber, plan_sha256: hash(JSON.stringify(selectedPlan)), review_visit: reviewNumber, group: { key: 'reviewer', protocol_id: 'PRT-one', plan_revision: revision, aspect_ids: [] },
        _dd_flow_batch_request: { request_sha256: requestSha, batch_sha256: batchSha, item_key: 'reviewer' } };
      const childValue = { schema_id: 'dd-flow/plan-review-result@1', plan_revision: revision, aspects: [] }, childBytes = JSON.stringify(childValue), childSha = hash(childBytes);
      const immutable = { work_id: workId, project_id: 'PRJ-one', run_id: 'RUN-one', parent_work_id: 'WRK-root', task: 'Review', launch_policy: 'fresh_agent_required',
        result_schema: 'dd-flow/plan-review-result@1', payload: workPayload, depends_on: [] };
      db.prepare('INSERT INTO works VALUES(?,?,?,?,?,?,?,?,?,?,?)').run('PRJ-one', 'RUN-one', workId, 'WRK-root', JSON.stringify(workPayload), 'Review', 'fresh_agent_required', immutable.result_schema, '[]', 'completed', childBytes);
      db.prepare('INSERT INTO stage_work_memberships VALUES(?,?,?,?,?,?)').run('PRJ-one', 'RUN-one', 'plan-review', `visit-${reviewNumber}`, workId, '');
      db.prepare('INSERT INTO work_sessions VALUES(?,?,?,?)').run(childSession, workId, 'completed', '{}');
      const ids = { reviewer: workId }, batch = { run_id: 'RUN-one', scope, request_sha256: requestSha, batch_sha256: batchSha, work_ids: ids, work_sha256: { [workId]: hybrid(immutable) } };
      db.prepare('INSERT INTO audit_events(project_id,event_type,payload_json) VALUES(?,?,?)').run('PRJ-one', 'work.batch_registration', JSON.stringify(batch));
      const graphReceipt = { run_id: 'RUN-one', stage: 'plan-review', visit: reviewNumber, attempt: 1, generation: 0, work_session_id: session,
        plan_ref: `run://plan/${planNumber}/result.json`, plan_visit: planNumber, plan_sha256: hash(JSON.stringify(selectedPlan)), items_sha256: batchSha, work_ids: ids };
      db.prepare('INSERT INTO audit_events(project_id,event_type,payload_json) VALUES(?,?,?)').run('PRJ-one', 'flow_run.pack_review_graph_registered', JSON.stringify(graphReceipt));
      const componentInputs = components ? scopeFor('plan-review') : { schema_id: 'dd-flow/pack-component-inputs@1', stages: ['plan-review'], files: [], listings: [], access_failures: false };
      const observation = { run_id: 'RUN-one', stage: 'plan-review', visit: reviewNumber, attempt: 1, generation: 0, work_id: 'WRK-root', work_session_id: session, command: 'dispatch',
        component_inputs: componentInputs, component_inputs_sha256: hash(JSON.stringify(componentInputs)) };
      db.prepare('INSERT INTO audit_events(project_id,event_type,payload_json) VALUES(?,?,?)').run('PRJ-one', 'flow_run.pack_component_observation', JSON.stringify(observation));
      const ref = `run://plan-review/${reviewNumber}/work-results/${workId}/${childSession}/result.json`, childRetained = { schema_id: 'dd-flow/pack-artifacts@1',
        candidate: `candidate-${String(childIndex).padStart(8, '0')}-0000-0000-0000-000000000000`, owner: { host: 'fixture', pid: 1 }, entries: [{ ref, sha256: childSha }] };
      await write(path.join(runDir, 'pack-retained', childRetained.candidate, 'owner.json'), childRetained);
      await write(path.join(runDir, 'pack-retained', childRetained.candidate, childSha), childBytes);
      const childReceipt = { run_id: 'RUN-one', stage: 'plan-review', visit: reviewNumber, attempt: 1, generation: 0, work_id: workId, work_session_id: childSession,
        operation: 'work', input_sha256: childSha, artifacts: childRetained };
      db.prepare('INSERT INTO audit_events(project_id,event_type,payload_json) VALUES(?,?,?)').run('PRJ-one', 'flow_run.pack_submission_accepted', JSON.stringify(childReceipt));
    }
    const successor = state.visits[i + 1], response = { ok: true, run_id: 'RUN-one', stage: visit.stage, visit: visit.visit, work_id: 'WRK-root', attempt_id: session, request_id: `request-${i}`, outcome: visit.outcome, value, result_ref: visit.result, next: { stage: successor.stage, visit: successor.visit } };
    const receipt = { run_id: 'RUN-one', stage: visit.stage, visit: visit.visit, attempt: visit.attempt, generation: 0, work_id: 'WRK-root', work_session_id: session, request_id: response.request_id, operation: 'finish', input_sha256: digest, artifacts: retained, response,
      ...(componentScope ? { component_inputs: componentScope, component_inputs_sha256: hash(JSON.stringify(componentScope)) } : {}) };
    if (components && revisionChain && visit.visit === 2 && ['plan', 'plan-review'].includes(visit.stage)) {
      const planBytes = JSON.stringify(newPlan), planSha = hash(planBytes), planPath = 'visits/plan/visit-2/result.json', reviewPath = 'visits/plan-review/visit-2/result.json';
      await write(path.join(runDir, planPath), planBytes);
      const sources = [{ role: 'plan:PRT-one', root: 'run', path: planPath, sha256: planSha }];
      if (visit.stage === 'plan-review') { await write(path.join(runDir, reviewPath), bytes); sources.push({ role: 'plan_review', root: 'run', path: reviewPath, sha256: digest }); }
      const matrix = { schema_id: 'dd-flow/verification-matrix@1', header: { project_id: 'PRJ-one', run_id: 'RUN-one', stage: visit.stage,
        stage_attempt: `visit-${visit.visit}-try-${visit.attempt}`, role: 'output', completeness: 'declared', source_fingerprint: '' }, sources, requirements: [], criteria: [], policy_checks: [] };
      matrix.header.source_fingerprint = verificationMatrixFingerprint(matrix);
      const base = `visits/${visit.stage}/visit-${visit.visit}/verification/${matrix.header.source_fingerprint}`;
      const jsonBytes = JSON.stringify(matrix), markdown = 'Generated matrix\n';
      receipt.verification_matrix = { contract: matrix.schema_id, role: 'output', completeness: 'declared', source_fingerprint: matrix.header.source_fingerprint,
        json: { path: `${base}/verification-matrix.json`, sha256: hash(jsonBytes) }, markdown: { path: `${base}/verification-matrix.md`, sha256: hash(markdown) } };
      for (const [key, content] of [['json', jsonBytes], ['markdown', markdown]]) {
        const descriptor = receipt.verification_matrix[key]; await write(path.join(runDir, descriptor.path), content);
        const packet = { run_id: 'RUN-one', stage: visit.stage, attempt: `visit-${visit.visit}-try-${visit.attempt}`, file: `/source/projects/PRJ-one/runs/RUN-one/${descriptor.path}`, sha256: descriptor.sha256, base64: Buffer.from(content).toString('base64') };
        db.prepare('INSERT INTO audit_events(project_id,event_type,payload_json) VALUES(?,?,?)').run('PRJ-one', 'flow_run.stage_packet', JSON.stringify(packet));
      }
    }
    if (extraExec && visit.stage === 'plan' && visit.visit === 2) {
      const scope = scopeFor('plan');
      scope.files.push({ path: 'modules/unused.mjs', sha256: hash(componentFiles['modules/unused.mjs']) });
      scope.files.sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0);
      db.prepare('INSERT INTO audit_events(project_id,event_type,payload_json) VALUES(?,?,?)').run('PRJ-one', 'flow_run.pack_component_observation', JSON.stringify({
        run_id: 'RUN-one', stage: 'plan', visit: 2, attempt: 1, generation: 0, work_id: 'WRK-root', work_session_id: session,
        command: 'inspect', component_inputs: scope, component_inputs_sha256: hash(JSON.stringify(scope)) }));
    }
    db.prepare('INSERT INTO audit_events(project_id,event_type,payload_json) VALUES(?,?,?)').run('PRJ-one', 'flow_run.pack_submission_accepted', JSON.stringify(receipt));
  }
  db.close();
  async function seal({ omitCodeCustody = false } = {}) {
    const reader = new DatabaseSync(database, { readOnly: true });
    const rows = reader.prepare(`SELECT id,event_type,payload_json FROM audit_events WHERE project_id=? AND event_type IN ('flow_run.pack_root_work','flow_run.pack_submission_accepted','flow_run.pack_review_graph_registered'${omitCodeCustody ? '' : ",'flow_run.pack_code_review_graph_registered','flow_run.pack_code_git_stage_decision'"}) AND json_extract(payload_json,'$.run_id')=? ORDER BY id`).all('PRJ-one', 'RUN-one');
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
  return { snapshot, snapshotSha256, database, runDir, seal, componentFiles };
}

test('selects the second accepted visit and preserves return, successor and pins', async t => {
  const f = await fixture(t), result = await readPackHistory({ ...f, runId: 'RUN-one', publications: [{ stage: 'plan-review', visit: 1 }, { stage: 'plan-review', visit: 2 }] });
  assert.deepEqual(result.visits.map(v => [v.visit, v.outcome, v.successor]), [[1, 'revise', { stage: 'plan', visit: 1 }], [2, 'accepted', { stage: 'code', visit: 1 }]]);
  assert.equal(result.pack.canon_commit, 'd'.repeat(40)); assert.equal(result.pack.engine_checksum, 'a'.repeat(64));
  assert.equal(result.coverage.matrix_components, 'unavailable');
});

test('includes CODE review and Git custody in the snapshot history marker', async t => {
  const f = await fixture(t, { codeCustody: true });
  const selection = { snapshot: f.snapshot, snapshotSha256: f.snapshotSha256, runId: 'RUN-one', publications: [{ stage: 'plan', visit: 1 }] };
  assert.equal((await readPackHistory(selection)).visits[0].stage, 'plan');
  await assert.rejects(readPackHistory({ ...selection, snapshotSha256: await f.seal({ omitCodeCustody: true }) }), { code: 'pack_history_invalid' });
});

test('reconciles the complete catalog boundary against retained visits and rejects substitutions', async t => {
  const f = await fixture(t);
  const db = new DatabaseSync(f.database, { readOnly: true });
  const state = JSON.parse(db.prepare('SELECT index_json FROM runs WHERE id=?').get('RUN-one').index_json).pack_state;
  const accepted = state.visits.filter(visit => visit.status === 'done').map(visit => {
    const row = db.prepare("SELECT payload_json FROM audit_events WHERE event_type='flow_run.pack_submission_accepted' AND json_extract(payload_json,'$.stage')=? AND json_extract(payload_json,'$.visit')=?").get(visit.stage, visit.visit);
    const receipt = JSON.parse(row.payload_json);
    return { stage: visit.stage, visit: visit.visit, attempt: visit.attempt, outcome: visit.outcome, result: visit.result,
      receipt_sha256: hash(row.payload_json), artifact_sha256: receipt.input_sha256 };
  });
  db.close();
  const boundary = { pack: state.pack, accepted, cursor: state.cursor, next_stage: 'code' };
  const catalog = { snapshot_id: 'controller:boundary:fixture', after_stage: 'plan-review', available: true, pack_boundary: boundary };
  const identity = { run_id: 'RUN-one', stage: catalog.after_stage, pack_boundary: boundary };
  const manifest = JSON.parse(await readFile(path.join(f.snapshot, 'snapshot.json'), 'utf8'));
  Object.assign(manifest, { purpose: 'stage_entry', stage_entry: 'code', boundary_capture: { operation_id: catalog.snapshot_id, boundary_key: hash(JSON.stringify(identity)) } });
  const manifestBytes = JSON.stringify(manifest); await writeFile(path.join(f.snapshot, 'snapshot.json'), manifestBytes);
  catalog.manifest_sha256 = hash(manifestBytes);
  const request = { snapshot: f.snapshot, snapshotSha256: catalog.manifest_sha256, runId: 'RUN-one', catalog };
  const history = await readPackCatalogHistory(request);
  assert.deepEqual(history.visits.map(v => [v.stage, v.visit, v.outcome]), [
    ['plan-review', 1, 'revise'], ['plan', 1, 'review'], ['plan-review', 2, 'accepted']
  ]);
  assert.equal(history.source.snapshot_id, catalog.snapshot_id);
  assert.equal(history.coverage.forkability, 'unverified');
  const checker = { schema_id: 'dd-eval/pack-catalog-history-request@1', run_id: 'RUN-one', catalog };
  await assert.rejects(assertLegacySnapshot(manifest, { snapshot: f.snapshot, checkpoint: { manifest_sha256: catalog.manifest_sha256, pack_history_request: checker } }),
    error => error.code === 'pack_history_checker_unavailable' && error.history?.visits.length === 3);
  for (const mutate of [
    c => { c.pack_boundary.accepted[2].visit = 1; },
    c => { c.pack_boundary.accepted[2].artifact_sha256 = '0'.repeat(64); },
    c => { c.pack_boundary.accepted.pop(); },
    c => { c.snapshot_id = 'another'; },
    c => { c.pack_boundary.next_stage = 'merge'; }
  ]) {
    const changed = structuredClone(catalog); mutate(changed);
    await assert.rejects(readPackCatalogHistory({ ...request, catalog: changed }), { code: 'pack_history_invalid' });
    // Even a self-consistent catalog and manifest cannot change the frozen RUN or receipts.
    const forgedManifest = structuredClone(manifest);
    forgedManifest.boundary_capture.boundary_key = hash(JSON.stringify({ run_id: 'RUN-one', stage: changed.after_stage, pack_boundary: changed.pack_boundary }));
    const forgedBytes = JSON.stringify(forgedManifest); await writeFile(path.join(f.snapshot, 'snapshot.json'), forgedBytes);
    changed.manifest_sha256 = hash(forgedBytes);
    await assert.rejects(readPackCatalogHistory({ ...request, snapshotSha256: changed.manifest_sha256, catalog: changed }), { code: 'pack_history_invalid' });
    await writeFile(path.join(f.snapshot, 'snapshot.json'), manifestBytes);
  }
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


test('accepts a retained aspect-map-only correction and rejects changed map bytes', async t => {
  const f = await fixture(t, { revisionChain: true, aspectOnly: true });
  const input = { ...f, runId: 'RUN-one', previousPlanVisit: 1, previousReviewVisit: 1, planVisit: 2, reviewVisit: 2 };
  const chain = await readPackRevisionChain(input);
  assert.equal(chain.previous.plan.revision, 1); assert.equal(chain.current.plan.revision, 1);
  assert.notEqual(chain.aspect_maps.previous[0].sha256, chain.aspect_maps.current[0].sha256);
  const file = path.join(f.snapshot, chain.aspect_maps.current[0].path);
  await writeFile(file, 'substituted');
  await assert.rejects(readPackRevisionChain({ ...input, snapshotSha256: await f.seal() }), { code: 'pack_history_invalid' });
});


test('selects both graphs of the revision chain and refuses a missing second dispatch', async t => {
  const f = await fixture(t, { revisionChain: true, graph: true, aspectOnly: true });
  const input = { ...f, runId: 'RUN-one', previousPlanVisit: 1, previousReviewVisit: 1, planVisit: 2, reviewVisit: 2 };
  const result = await readPackRevisionGraphs(input);
  assert.equal(result.previous_graph.children[0].work_id, 'WRK-reviewer-1');
  assert.equal(result.current_graph.children[0].work_id, 'WRK-reviewer-2');
  assert.equal(result.coverage.matrix_components, 'unavailable');
  const checkpoint = { manifest_sha256: f.snapshotSha256, pack_history_request: { schema_id: 'dd-eval/pack-revision-graphs-request@1', run_id: 'RUN-one',
    previous_plan_visit: 1, previous_review_visit: 1, plan_visit: 2, review_visit: 2 } };
  await assert.rejects(assertLegacySnapshot({ run_id: 'RUN-one', assessment_only: true }, { snapshot: f.snapshot, checkpoint }), error => {
    assert.equal(error.code, 'pack_history_checker_unavailable'); assert.equal(error.history.current_graph.children[0].work_id, 'WRK-reviewer-2'); return true;
  });
  const db = new DatabaseSync(f.database);
  db.prepare("DELETE FROM audit_events WHERE event_type='flow_run.pack_component_observation' AND json_extract(payload_json,'$.visit')=2").run(); db.close();
  await assert.rejects(readPackRevisionGraphs({ ...input, snapshotSha256: await f.seal() }), { code: 'pack_history_invalid' });
});

test('pack qualifier compares retained scopes before publishing a receipt', async t => {
  const engineRoot = await realpath(await mkdtemp(path.join(os.tmpdir(), 'eval-pack-engine-')));
  t.after(() => rm(engineRoot, { recursive: true, force: true }));
  const roots = ['services/verification-matrix.js', 'services/stage-report-renderer.js', 'services/accepted-intent.js', 'services/check-runner-evidence.js'];
  for (const file of roots) await write(path.join(engineRoot, 'dist', file), 'export {};\n');
  await write(path.join(engineRoot, 'dist/verification-components.json'), { schema_id: 'dd-flow/verification-components@1', matrix: { files: roots } });
  await write(path.join(engineRoot, 'dist/build-info.json'), { built_with_canon: { version: 'fixture', commit: 'd'.repeat(40) } });
  const checksum = await engineArtifactDigest(engineRoot);
  const f = await fixture(t, { revisionChain: true, graph: true, aspectOnly: true, components: true, extraExec: true, engineChecksum: checksum });
  const target = path.join(f.snapshot, 'target-bundle');
  await cp(path.join(f.runDir, 'flow-pack-bundle'), target, { recursive: true });
  const targetManifest = JSON.parse(await readFile(path.join(target, 'manifest.json'), 'utf8'));
  const checkpointFile = path.join(f.snapshot, 'checkpoint.json'), historyFile = path.join(f.snapshot, 'selection.json');
  const engineFile = path.join(f.snapshot, 'engine.json'), output = path.join(f.snapshot, 'qualification.json');
  await write(engineFile, { snapshot_root: engineRoot, integrity_checksum: checksum });
  await write(historyFile, { schema_id: 'dd-eval/pack-revision-graphs-request@1', snapshot: '.', snapshot_sha256: f.snapshotSha256, run_id: 'RUN-one',
    previous_plan_visit: 1, previous_review_visit: 1, plan_visit: 2, review_visit: 2 });
  const setTarget = async (name, bytes) => {
    if (name) { await writeFile(path.join(target, 'files', name), bytes); targetManifest.inventory.find(item => item.path === name).sha256 = hash(bytes); }
    const content = JSON.stringify(targetManifest); await writeFile(path.join(target, 'manifest.json'), content);
    await write(checkpointFile, { flow_pack: { pack_bundle: { root: 'target-bundle', manifest_sha256: hash(content) } } });
  };
  await setTarget();
  const command = new URL('../bin/qualify-verification-matrix.mjs', import.meta.url);
  const run = () => promisify(execFile)(process.execPath, [command.pathname, '--pack-history', historyFile, '--checkpoint', checkpointFile,
    '--engine-json', engineFile, '--flow-commit', 'c'.repeat(40), '--output', output]);
  await assert.rejects(run(), error => error.stderr.includes('verification_matrix_qualification_unavailable'));
  await assert.rejects(readFile(output), { code: 'ENOENT' });
  await setTarget('modules/independent.mjs', 'export const independent = false;');
  await assert.rejects(run(), error => error.stderr.includes('verification_matrix_qualification_unavailable'));
  await setTarget('modules/unused.mjs', 'export const unused = false;');
  await assert.rejects(run(), error => error.stderr.includes('verification_matrix_qualification_invalid'));
  await setTarget('modules/unused.mjs', f.componentFiles['modules/unused.mjs']);
  for (const name of ['modules/plan.mjs', 'modules/helper.mjs', 'schemas/result.json', 'schemas/ref.json']) {
    const changed = name.endsWith('.json') ? JSON.stringify({ ...JSON.parse(f.componentFiles[name]), title: 'changed' }) : `${f.componentFiles[name]}\n// changed`;
    await setTarget(name, changed);
    await assert.rejects(run(), error => error.stderr.includes('verification_matrix_qualification_invalid'), name);
    await setTarget(name, f.componentFiles[name]);
  }
  await assert.rejects(readFile(output), { code: 'ENOENT' });
});

test('pack qualification uses selected T03 visits but refuses partial matrix coverage', async t => {
  const f = await fixture(t, { revisionChain: true, graph: true, aspectOnly: true, components: true });
  const engineRoot = path.join(f.snapshot, 'engine'), roots = ['services/verification-matrix.js', 'services/stage-report-renderer.js', 'services/accepted-intent.js', 'services/check-runner-evidence.js'];
  for (const file of roots) await write(path.join(engineRoot, 'dist', file), 'export {};\n');
  await write(path.join(engineRoot, 'dist/verification-components.json'), { schema_id: 'dd-flow/verification-components@1', matrix: { files: roots } });
  const component = await matrixComponentFingerprint(engineRoot);
  const receipt = { schema_id: 'dd-eval/verification-matrix-qualification@5', status: 'passed', contract: 'dd-flow/verification-matrix@1',
    coverage_contract: 'dd-flow/final-check-coverage@1', component_sha256: component, engine_artifact_sha256: 'a'.repeat(64),
    flow_commit: 'c'.repeat(40), built_with_canon: { version: 'fixture', commit: 'd'.repeat(40) },
    pack_history: { schema_id: 'dd-eval/pack-revision-graphs-request@1', snapshot: '.', snapshot_sha256: f.snapshotSha256, run_id: 'RUN-one',
      previous_plan_visit: 1, previous_review_visit: 1, plan_visit: 2, review_visit: 2 } };
  const check = async value => {
    const bytes = Buffer.from(JSON.stringify(value));
    const checkpoint = { file: path.join(f.snapshot, 'checkpoint.json'), value: { flow_pack: { verification_matrix: { contract: value.contract, file: 'qualification.json', sha256: hash(bytes), canon_commit: 'd'.repeat(40) } } } };
    return assertVerificationMatrixQualification(checkpoint, { snapshot_root: engineRoot }, { checker: 'task-priority@4' }, bytes);
  };
  await assert.rejects(check(receipt), error => error.code === 'verification_matrix_qualification_unavailable'
    && error.details?.selected_run === 'RUN-one' && error.details.gaps.includes('snapshot_component_marker_unavailable'));
  const foreign = structuredClone(receipt); foreign.pack_history.review_visit = 1;
  await assert.rejects(check(foreign), { code: 'verification_matrix_qualification_invalid' });
  const engineChanged = structuredClone(receipt); engineChanged.component_sha256 = '0'.repeat(64);
  await assert.rejects(check(engineChanged), { code: 'verification_matrix_qualification_invalid' });
  const canonChanged = structuredClone(receipt); canonChanged.built_with_canon.commit = 'e'.repeat(40);
  await assert.rejects(check(canonChanged), { code: 'verification_matrix_qualification_invalid' });
  const noCanonVersion = structuredClone(receipt); delete noCanonVersion.built_with_canon.version;
  await assert.rejects(check(noCanonVersion), { code: 'verification_matrix_qualification_invalid' });
});

test('pack admission rejects participating target mutations and retains unrelated reuse as unavailable', async t => {
  const f = await fixture(t, { revisionChain: true, graph: true, aspectOnly: true, components: true });
  const snapshotManifest = JSON.parse(await readFile(path.join(f.snapshot, 'snapshot.json'), 'utf8'));
  const snapshotDb = new DatabaseSync(f.database, { readOnly: true });
  const markerRows = snapshotDb.prepare("SELECT id,event_type,payload_json FROM audit_events WHERE project_id=? AND event_type IN ('flow_run.pack_component_observation','flow_run.stage_packet') AND json_extract(payload_json,'$.run_id')=? ORDER BY id").all('PRJ-one', 'RUN-one');
  snapshotDb.close();
  const paths = ['engine-binding.json', 'flow-pack-bundle/manifest.json', ...Object.keys(f.componentFiles).map(name => `flow-pack-bundle/files/${name}`),
    ...markerRows.filter(row => row.event_type === 'flow_run.stage_packet').map(row => path.relative('/source/projects/PRJ-one/runs/RUN-one', JSON.parse(row.payload_json).file))].sort();
  const files = await Promise.all(paths.map(async name => { const bytes = await readFile(path.join(f.runDir, name)); return { path: name, sha256: hash(bytes), size: bytes.length }; }));
  const sourcePack = JSON.parse(await readFile(path.join(f.runDir, 'flow-pack-bundle/manifest.json'), 'utf8'));
  const sourceBinding = await readFile(path.join(f.runDir, 'engine-binding.json'));
  snapshotManifest.pack_matrix_evidence = { schema_id: 'dd-flow/pack-matrix-snapshot@1', coverage: 'partial', project_id: 'PRJ-one', run_id: 'RUN-one',
    pack_sha256: hash(JSON.stringify(sourcePack)), engine_binding_sha256: hash(sourceBinding), rows_sha256: hash(JSON.stringify(markerRows)), files };
  const snapshotBytes = JSON.stringify(snapshotManifest); await writeFile(path.join(f.snapshot, 'snapshot.json'), snapshotBytes);
  const engineRoot = path.join(f.snapshot, 'engine'), roots = ['services/verification-matrix.js', 'services/stage-report-renderer.js', 'services/accepted-intent.js', 'services/check-runner-evidence.js'];
  for (const file of roots) await write(path.join(engineRoot, 'dist', file), 'export {};\n');
  await write(path.join(engineRoot, 'dist/verification-components.json'), { schema_id: 'dd-flow/verification-components@1', matrix: { files: roots } });
  const target = path.join(f.snapshot, 'target-bundle'), source = path.join(f.runDir, 'flow-pack-bundle');
  await cp(source, target, { recursive: true });
  const manifest = JSON.parse(await readFile(path.join(target, 'manifest.json'), 'utf8'));
  const writeTarget = async (name, bytes) => {
    await writeFile(path.join(target, 'files', name), bytes);
    manifest.inventory.find(item => item.path === name).sha256 = hash(bytes);
    const content = JSON.stringify(manifest); await writeFile(path.join(target, 'manifest.json'), content); return hash(content);
  };
  let targetSha = hash(await readFile(path.join(target, 'manifest.json')));
  const receipt = { schema_id: 'dd-eval/verification-matrix-qualification@5', status: 'passed', contract: 'dd-flow/verification-matrix@1',
    coverage_contract: 'dd-flow/final-check-coverage@1', component_sha256: await matrixComponentFingerprint(engineRoot), engine_artifact_sha256: 'a'.repeat(64),
    flow_commit: 'c'.repeat(40), built_with_canon: { version: 'fixture', commit: 'd'.repeat(40) },
    pack_history: { schema_id: 'dd-eval/pack-revision-graphs-request@1', snapshot: '.', snapshot_sha256: hash(snapshotBytes), run_id: 'RUN-one',
      previous_plan_visit: 1, previous_review_visit: 1, plan_visit: 2, review_visit: 2 } };
  const check = async (packBundle = { root: 'target-bundle', manifest_sha256: targetSha }) => {
    const bytes = Buffer.from(JSON.stringify(receipt));
    const checkpoint = { file: path.join(f.snapshot, 'checkpoint.json'), value: { flow_pack: { ...(packBundle === false ? {} : { pack_bundle: packBundle }),
      verification_matrix: { contract: receipt.contract, file: 'qualification.json', sha256: hash(bytes), canon_commit: 'd'.repeat(40) } } } };
    return assertVerificationMatrixQualification(checkpoint, { snapshot_root: engineRoot }, { checker: 'task-priority@4' }, bytes);
  };
  const unavailable = error => error.code === 'verification_matrix_qualification_unavailable' && error.details?.compared_scopes === 5
    && error.details.gaps.includes('snapshot_component_coverage_partial');
  await assert.rejects(check(), unavailable);
  await assert.rejects(check(false), error => error.code === 'verification_matrix_qualification_unavailable'
    && error.details.gaps.includes('target_pack_authority_missing'));
  await assert.rejects(check(null), { code: 'verification_matrix_qualification_invalid' });
  await assert.rejects(check({ root: 'target-bundle', manifest_sha256: 'bad' }), { code: 'verification_matrix_qualification_invalid' });
  const sourceModule = path.join(source, 'files/modules/plan.mjs');
  await writeFile(sourceModule, 'tampered');
  receipt.pack_history.snapshot_sha256 = await f.seal();
  await assert.rejects(check(false), { code: 'verification_matrix_qualification_invalid' });
  await writeFile(sourceModule, f.componentFiles['modules/plan.mjs']);
  await writeFile(path.join(f.snapshot, 'snapshot.json'), snapshotBytes); receipt.pack_history.snapshot_sha256 = hash(snapshotBytes);
  const changedMarker = structuredClone(snapshotManifest); changedMarker.pack_matrix_evidence.rows_sha256 = '0'.repeat(64);
  const changedSnapshot = JSON.stringify(changedMarker); await writeFile(path.join(f.snapshot, 'snapshot.json'), changedSnapshot);
  receipt.pack_history.snapshot_sha256 = hash(changedSnapshot);
  await assert.rejects(check(), { code: 'verification_matrix_qualification_invalid' });
  await writeFile(path.join(f.snapshot, 'snapshot.json'), snapshotBytes); receipt.pack_history.snapshot_sha256 = hash(snapshotBytes);
  targetSha = await writeTarget('modules/unused.mjs', 'export const unused = false;');
  await assert.rejects(check(), unavailable);
  for (const name of ['modules/plan.mjs', 'modules/helper.mjs', 'schemas/result.json', 'schemas/ref.json']) {
    const changed = name.endsWith('.json') ? JSON.stringify({ ...JSON.parse(f.componentFiles[name]), title: 'changed' }) : `${f.componentFiles[name]}\n// changed`;
    targetSha = await writeTarget(name, changed);
    await assert.rejects(check(), { code: 'verification_matrix_qualification_invalid' }, `${name} must invalidate old scoped inputs`);
    targetSha = await writeTarget(name, f.componentFiles[name]);
  }
});


test('retains distinct unavailable checker receipts for explicit accepted visits', async t => {
  const f = await fixture(t), root = await realpath(await mkdtemp(path.join(os.tmpdir(), 'eval-pack-checker-')));
  t.after(() => rm(root, { recursive: true, force: true }));
  const snapshot = path.join(root, 'executions/e2e/boundaries/candidate');
  await mkdir(path.dirname(snapshot), { recursive: true }); await cp(f.snapshot, snapshot, { recursive: true });
  const manifest = { case_id: 'sdlc-eval-2026-summer-task-priority', case_acceptance: { case_id: 'sdlc-eval-2026-summer-task-priority', checker: 'task-priority@1' } };
  const result = { execution: 'e2e', state: 'candidate_ready', stage: 'merge', run_id: 'RUN-one', candidate: {
    manifest: path.join(snapshot, 'snapshot.json'), manifest_sha256: f.snapshotSha256,
    pack_history_request: { schema_id: 'dd-eval/pack-history-request@1', run_id: 'RUN-one', publications: [{ stage: 'plan-review', visit: 1 }] }
  } };
  await attachCaseAcceptance(root, manifest, [result]);
  const first = result.case_acceptance;
  assert.equal(first.receipt.status, 'unavailable'); assert.equal(first.receipt.facts.selected_pack_visits.visits[0].visit, 1);
  result.candidate.pack_history_request.publications[0].visit = 2;
  await attachCaseAcceptance(root, manifest, [result]);
  assert.notEqual(result.case_acceptance.file, first.file);
  assert.equal(result.case_acceptance.receipt.status, 'unavailable');
  assert.equal(result.case_acceptance.receipt.facts.selected_pack_visits.visits[0].visit, 2);
  result.candidate.pack_history_request.publications[0].visit = 1;
  await attachCaseAcceptance(root, manifest, [result]);
  assert.equal(result.case_acceptance.file, first.file);
});
