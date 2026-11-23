import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, readFile, readdir, writeFile, rm, realpath } from 'node:fs/promises';
import { DatabaseSync } from 'node:sqlite';
import os from 'node:os';
import path from 'node:path';
import { readPackHistory } from '../lib/recovery/pack-history.mjs';
import { snapshotTreeHash } from '../lib/recovery/snapshot-tree.mjs';

const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const write = async (file, value) => { await mkdir(path.dirname(file), { recursive: true }); await writeFile(file, typeof value === 'string' ? value : JSON.stringify(value)); };

async function fixture(t) {
  const snapshot = await realpath(await mkdtemp(path.join(os.tmpdir(), 'eval-pack-history-')));
  t.after(() => rm(snapshot, { recursive: true, force: true }));
  const runtime = path.join(snapshot, 'runtime'), runDir = path.join(runtime, 'projects/PRJ-one/runs/RUN-one');
  await mkdir(runDir, { recursive: true });
  const pack = { schema_id: 'dd-flow/flow-pack-bundle@1', project_commit: 'c'.repeat(40), canon_commit: 'd'.repeat(40), engine_checksum: 'a'.repeat(64), engine_version: '1', engine_manifest_sha256: 'b'.repeat(64) };
  const packBytes = JSON.stringify(pack), packSha = hash(packBytes), binding = { schema_id: 'dd-flow/run-engine-binding@1', run_id: 'RUN-one', project_root: '/project', engine: { integrity_checksum: pack.engine_checksum, engine_version: '1' } };
  await write(path.join(runDir, 'flow-pack-bundle/manifest.json'), packBytes);
  await write(path.join(runDir, 'engine-binding.json'), binding);
  const state = { schema_id: 'dd-flow/run-state@1', project_id: 'PRJ-one', run_id: 'RUN-one', pack: { flow_id: 'mb-sdlc', version: '1', sha256: packSha }, cursor: { stage: 'code', visit: 1 }, visits: [
    { stage: 'plan-review', visit: 1, attempt: 1, status: 'done', outcome: 'revise', result: 'run://plan-review/1/result.json' },
    { stage: 'plan', visit: 1, attempt: 1, status: 'done', outcome: 'review', result: 'run://plan/1/result.json' },
    { stage: 'plan-review', visit: 2, attempt: 1, status: 'done', outcome: 'accepted', result: 'run://plan-review/2/result.json' },
    { stage: 'code', visit: 1, attempt: 1, status: 'running' }
  ] };
  const index = JSON.stringify({ root_work_id: 'WRK-root', pack_state: state });
  const database = path.join(runtime, 'db.sqlite'), db = new DatabaseSync(database);
  db.exec('CREATE TABLE runs(project_id TEXT,id TEXT,run_root TEXT,index_json TEXT); CREATE TABLE works(project_id TEXT,run_id TEXT,work_id TEXT,parent_work_id TEXT,payload_json TEXT); CREATE TABLE audit_events(id INTEGER PRIMARY KEY,project_id TEXT,event_type TEXT,payload_json TEXT); CREATE TABLE work_sessions(id TEXT,work_id TEXT,status TEXT,start_receipt_json TEXT); CREATE TABLE stage_work_memberships(project_id TEXT,run_id TEXT,stage TEXT,attempt TEXT,work_id TEXT)');
  const anchor = { run_id: 'RUN-one', flow_id: 'mb-sdlc', pack_sha256: packSha };
  db.prepare('INSERT INTO runs VALUES(?,?,?,?)').run('PRJ-one', 'RUN-one', '/source/projects/PRJ-one/runs/RUN-one', index);
  db.prepare('INSERT INTO works VALUES(?,?,?,?,?)').run('PRJ-one', 'RUN-one', 'WRK-root', null, JSON.stringify({ pack_run_coordinator: anchor }));
  db.prepare('INSERT INTO audit_events(project_id,event_type,payload_json) VALUES(?,?,?)').run('PRJ-one', 'flow_run.pack_root_work', JSON.stringify({ ...anchor, work_id: 'WRK-root' }));
  for (const [i, visit] of state.visits.slice(0, 3).entries()) {
    const session = `WS-${String(i + 1).padStart(8, '0')}-0000-0000-0000-000000000000`, value = { marker: i }, bytes = JSON.stringify(value), digest = hash(bytes);
    const retained = { schema_id: 'dd-flow/pack-artifacts@1', candidate: `candidate-${String(i + 1).padStart(8, '0')}-0000-0000-0000-000000000000`, owner: { host: 'fixture', pid: 1 }, entries: [{ ref: visit.result, sha256: digest }] };
    await write(path.join(runDir, 'pack-retained', retained.candidate, 'owner.json'), retained);
    await write(path.join(runDir, 'pack-retained', retained.candidate, digest), bytes);
    const issuedState = structuredClone(state); issuedState.cursor = { stage: visit.stage, visit: visit.visit };
    issuedState.visits[i] = { ...visit, status: 'running' };
    const start = { generation: 0, run_state: JSON.stringify(issuedState), pack_start: { stage: visit.stage, visit: visit.visit, attempt: visit.attempt } }; start.run_state_sha256 = hash(start.run_state);
    db.prepare('INSERT INTO work_sessions VALUES(?,?,?,?)').run(session, 'WRK-root', 'completed', JSON.stringify(start));
    db.prepare('INSERT INTO stage_work_memberships VALUES(?,?,?,?,?)').run('PRJ-one', 'RUN-one', visit.stage, `visit-${visit.visit}`, 'WRK-root');
    const successor = state.visits[i + 1], response = { ok: true, run_id: 'RUN-one', stage: visit.stage, visit: visit.visit, work_id: 'WRK-root', attempt_id: session, request_id: `request-${i}`, outcome: visit.outcome, value, result_ref: visit.result, next: { stage: successor.stage, visit: successor.visit } };
    const receipt = { run_id: 'RUN-one', stage: visit.stage, visit: visit.visit, attempt: visit.attempt, generation: 0, work_id: 'WRK-root', work_session_id: session, request_id: response.request_id, operation: 'finish', input_sha256: digest, artifacts: retained, response };
    db.prepare('INSERT INTO audit_events(project_id,event_type,payload_json) VALUES(?,?,?)').run('PRJ-one', 'flow_run.pack_submission_accepted', JSON.stringify(receipt));
  }
  db.close();
  async function seal() {
    const reader = new DatabaseSync(database, { readOnly: true });
    const rows = reader.prepare("SELECT id,event_type,payload_json FROM audit_events WHERE project_id=? AND event_type IN ('flow_run.pack_root_work','flow_run.pack_submission_accepted') AND json_extract(payload_json,'$.run_id')=? ORDER BY id").all('PRJ-one', 'RUN-one');
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
