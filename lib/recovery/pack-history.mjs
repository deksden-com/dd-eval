import path from 'node:path';
import { createHash } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import { realpath } from 'node:fs/promises';
import { frozenFile, withFrozenRuntimeDatabase } from './frozen-evidence-io.mjs';
import { snapshotTreeHash, framedSnapshotTreeHash } from './snapshot-tree.mjs';

const hash = value => createHash('sha256').update(value).digest('hex');
const ensure = (value, message) => { if (!value) throw Object.assign(new Error(message), { code: 'pack_history_invalid' }); };
const hex = value => /^[a-f0-9]{64}$/.test(value ?? '');
const commit = value => /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/.test(value ?? '');
const id = value => typeof value === 'string' && /^[A-Za-z0-9][A-Za-z0-9_.-]*$/.test(value);
const json = value => JSON.parse(value);

/** Read selected W08 accepted visits from a pinned assessment snapshot.
 * This contract proves visit/result identity, not component coverage or forkability. */
export async function readPackHistory(request) {
  try { return await readHistory(request); }
  catch (error) {
    if (error.code === 'pack_history_invalid') throw error;
    throw Object.assign(new Error(`Pack history is unavailable: ${error.message}`, { cause: error }), { code: 'pack_history_invalid' });
  }
}

async function readHistory({ snapshot, snapshotSha256, runId, publications }) {
  ensure(path.isAbsolute(snapshot ?? '') && hex(snapshotSha256) && id(runId), 'Missing pinned snapshot or RUN identity');
  ensure(Array.isArray(publications) && publications.length > 0 && publications.length <= 256
    && publications.every(item => id(item?.stage) && Number.isSafeInteger(item.visit) && item.visit > 0)
    && new Set(publications.map(item => `${item.stage}/${item.visit}`)).size === publications.length, 'Invalid visit selection');
  const root = await realpath(snapshot);
  ensure(root === path.resolve(snapshot), 'Snapshot path traverses a symlink');
  const manifestFile = await frozenFile(root, path.join(root, 'snapshot.json'));
  const manifest = json(manifestFile.text), evidence = manifest.pack_evidence;
  ensure(['dd-flow/eval-run-snapshot@5', 'dd-flow/eval-run-snapshot@7', 'dd-flow/eval-run-snapshot@10', 'dd-flow/eval-run-snapshot@12'].includes(manifest.schema_id)
    && ['stage_entry', 'candidate'].includes(manifest.purpose)
    && manifestFile.sha256 === snapshotSha256 && manifest.run_id === runId && id(manifest.project_id)
    && manifest.assessment_only === true && manifest.consistency === 'controller_boundary_writer_barrier@1'
    && manifest.boundary_capture && evidence?.schema_id === 'dd-flow/pack-snapshot-evidence@1'
    && evidence.run_id === runId && evidence.project_id === manifest.project_id && evidence.publication === 'published'
    && Array.isArray(evidence.files) && hex(evidence.rows_sha256)
    && hex(manifest.runtime_sha256) && snapshotTreeHash(path.join(root, 'runtime')) === manifest.runtime_sha256
    && (manifest.schema_id !== 'dd-flow/eval-run-snapshot@12' || manifest.payload_integrity?.schema_id === 'dd-flow/framed-payload@1'
      && framedSnapshotTreeHash(path.join(root, 'runtime')) === manifest.payload_integrity.runtime),
  'Snapshot identity, publication or runtime payload differs');
  const scope = await withFrozenRuntimeDatabase(root, db => {
    const run = db.prepare('SELECT run_root,index_json FROM runs WHERE project_id=? AND id=?').get(manifest.project_id, runId);
    ensure(run && hash(run.index_json) === evidence.index_sha256 && run.run_root === evidence.source_run_root
      && path.isAbsolute(manifest.dd_flow_home ?? '') && path.isAbsolute(run.run_root), 'Frozen RUN authority differs');
    const relative = path.relative(manifest.dd_flow_home, run.run_root);
    ensure(relative && relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative), 'RUN root escaped captured runtime');
    const index = json(run.index_json), state = index.pack_state, pack = state?.pack;
    ensure(state?.schema_id === 'dd-flow/run-state@1' && state.project_id === manifest.project_id && state.run_id === runId
      && pack?.flow_id === 'mb-sdlc' && typeof pack.version === 'string' && pack.version && hex(pack.sha256) && Array.isArray(state.visits), 'RUN pack state is invalid');
    const events = ['flow_run.pack_root_work', 'flow_run.pack_bootstrap_input', 'flow_run.pack_submission_accepted',
      'flow_run.pack_stage_wait', 'flow_run.pack_stage_wait_resumed', 'flow_run.protocolize_intent',
      'flow_run.pack_protocolize_published', 'flow_run.pack_review_graph_registered', 'flow_run.pack_code_graph_registered',
      'flow_run.pack_plan_intent', 'flow_run.pack_plan_published', 'flow_run.pack_plan_managed_owner',
      ...['intent', 'head_lease', 'index_lease', 'ref_lease', 'dispatch', 'process', 'result', 'complete', 'released'].map(name => `work.pack_code_base_${name}`)];
    const unknownScope = db.prepare(`SELECT 1 FROM audit_events WHERE project_id=? AND event_type IN (${events.map(() => '?').join(',')}) AND CASE WHEN NOT json_valid(payload_json) THEN 1 WHEN json_type(payload_json)<>'object' OR json_type(payload_json,'$.run_id') IS NOT 'text' OR (SELECT COUNT(*) FROM json_each(audit_events.payload_json) WHERE key='run_id')<>1 OR trim(json_extract(payload_json,'$.run_id'))='' OR trim(json_extract(payload_json,'$.run_id'))<>json_extract(payload_json,'$.run_id') THEN 1 ELSE 0 END LIMIT 1`).get(manifest.project_id, ...events);
    ensure(!unknownScope, 'Receipt scope is ambiguous');
    const rows = db.prepare(`SELECT id,event_type,payload_json FROM audit_events WHERE project_id=? AND event_type IN (${events.map(() => '?').join(',')}) AND json_valid(payload_json) AND json_extract(payload_json,'$.run_id')=? ORDER BY id`).all(manifest.project_id, ...events, runId);
    const history = [
      ['works', db.prepare('SELECT * FROM works WHERE project_id=? AND run_id=? ORDER BY work_id').all(manifest.project_id, runId)],
      ['work_sessions', db.prepare('SELECT * FROM work_sessions WHERE work_id IN (SELECT work_id FROM works WHERE project_id=? AND run_id=?) ORDER BY id').all(manifest.project_id, runId)],
      ['stage_work_memberships', db.prepare('SELECT * FROM stage_work_memberships WHERE project_id=? AND run_id=? ORDER BY rowid').all(manifest.project_id, runId)],
      ['batch', db.prepare("SELECT * FROM audit_events WHERE project_id=? AND event_type='work.batch_registration' AND json_valid(payload_json) AND json_extract(payload_json,'$.run_id')=? ORDER BY id").all(manifest.project_id, runId)]
    ];
    ensure(hash(JSON.stringify({ rows, history })) === evidence.rows_sha256, 'Snapshot history marker differs');
    const rootWork = index.root_work_id;
    const roots = db.prepare('SELECT work_id,payload_json FROM works WHERE project_id=? AND run_id=? AND parent_work_id IS NULL').all(manifest.project_id, runId);
    const anchors = db.prepare("SELECT payload_json FROM audit_events WHERE project_id=? AND event_type='flow_run.pack_root_work' AND json_extract(payload_json,'$.run_id')=?").all(manifest.project_id, runId);
    const binding = { run_id: runId, flow_id: pack.flow_id, pack_sha256: pack.sha256 };
    ensure(roots.length === 1 && roots[0].work_id === rootWork && roots[0].payload_json === JSON.stringify({ pack_run_coordinator: binding })
      && anchors.length === 1 && anchors[0].payload_json === JSON.stringify({ ...binding, work_id: rootWork }), 'Root Work authority differs');
    const counts = new Map();
    for (const visit of state.visits) {
      const n = (counts.get(visit.stage) ?? 0) + 1;
      ensure(id(visit.stage) && visit.visit === n && Number.isSafeInteger(visit.attempt) && visit.attempt > 0, 'Visit sequence is invalid');
      counts.set(visit.stage, n);
    }
    const visits = publications.map(selection => {
      const matches = state.visits.filter(v => v.stage === selection.stage && v.visit === selection.visit);
      ensure(matches.length === 1 && matches[0].status === 'done', 'Selected visit is missing or not accepted');
      const visit = matches[0], ref = `run://${visit.stage}/${visit.visit}/result.json`;
      const rows = db.prepare("SELECT id,payload_json FROM audit_events WHERE project_id=? AND event_type='flow_run.pack_submission_accepted' AND json_extract(payload_json,'$.run_id')=? AND json_extract(payload_json,'$.stage')=? AND json_extract(payload_json,'$.visit')=? AND json_extract(payload_json,'$.work_id')=?").all(manifest.project_id, runId, visit.stage, visit.visit, rootWork);
      ensure(rows.length === 1, 'Acceptance receipt is missing or ambiguous');
      const receipt = json(rows[0].payload_json), response = receipt.response;
      const member = db.prepare('SELECT 1 FROM stage_work_memberships WHERE project_id=? AND run_id=? AND stage=? AND attempt=? AND work_id=?').get(manifest.project_id, runId, visit.stage, `visit-${visit.visit}`, rootWork);
      const session = db.prepare('SELECT status,start_receipt_json FROM work_sessions WHERE id=? AND work_id=?').get(receipt.work_session_id, rootWork);
      ensure(member && session?.status === 'completed' && receipt.run_id === runId && receipt.stage === visit.stage
        && receipt.visit === visit.visit && receipt.attempt === visit.attempt && receipt.work_id === rootWork
        && Number.isSafeInteger(receipt.generation) && receipt.generation >= 0 && ['finish', 'exec'].includes(receipt.operation)
        && typeof receipt.request_id === 'string' && receipt.request_id && response?.ok === true
        && response.run_id === runId && response.stage === visit.stage && response.visit === visit.visit
        && response.work_id === rootWork && response.attempt_id === receipt.work_session_id && response.request_id === receipt.request_id
        && response.result_ref === ref && visit.result === ref && response.outcome === visit.outcome, 'Acceptance or Work scope differs');
      const start = json(session.start_receipt_json), issued = start.pack_start, issuedState = json(start.run_state);
      ensure(typeof start.run_state === 'string' && hash(start.run_state) === start.run_state_sha256
        && start.generation === receipt.generation && issued?.stage === visit.stage && issued.visit === visit.visit && issued.attempt === visit.attempt
        && issuedState.run_id === runId && issuedState.project_id === manifest.project_id && issuedState.pack?.sha256 === pack.sha256
        && issuedState.cursor?.stage === visit.stage && issuedState.cursor.visit === visit.visit
        && issuedState.visits?.filter(item => item.stage === visit.stage && item.visit === visit.visit && item.attempt === visit.attempt && item.status === 'running').length === 1, 'Start receipt differs');
      const next = state.visits[state.visits.indexOf(visit) + 1];
      const successor = next ? { stage: next.stage, visit: next.visit } : state.cursor?.terminal ? { terminal: state.cursor.terminal } : null;
      ensure(successor && JSON.stringify(response.next) === JSON.stringify(successor), 'Accepted successor differs or is unavailable');
      return { visit, receipt, receiptId: rows[0].id, raw: rows[0].payload_json, ref, successor, startSha256: hash(session.start_receipt_json) };
    });
    return { relative, pack, visits };
  });
  const runRoot = path.join(root, 'runtime', scope.relative);
  const read = async name => frozenFile(root, path.join(runRoot, name));
  const packFile = await read('flow-pack-bundle/manifest.json'), pack = json(packFile.text);
  const bindingFile = await read('engine-binding.json'), binding = json(bindingFile.text);
  ensure(packFile.sha256 === scope.pack.sha256 && pack.schema_id === 'dd-flow/flow-pack-bundle@1'
    && binding.schema_id === 'dd-flow/run-engine-binding@1' && binding.run_id === runId
    && typeof manifest.project_root === 'string' && binding.project_root === manifest.project_root
    && hex(pack.engine_checksum) && pack.engine_checksum === binding.engine?.integrity_checksum
    && pack.engine_version === binding.engine?.engine_version && hex(pack.engine_manifest_sha256)
    && commit(pack.canon_commit) && (commit(pack.project_commit) || pack.project_commit === null), 'Pack or engine binding differs');
  const visits = [];
  for (const selected of scope.visits) {
    const { receipt, visit, ref } = selected, retained = receipt.artifacts;
    ensure(retained?.schema_id === 'dd-flow/pack-artifacts@1' && /^candidate-[0-9a-f-]{36}$/.test(retained.candidate ?? '')
      && Array.isArray(retained.entries) && new Set(retained.entries.map(e => e.ref)).size === retained.entries.length, 'Retained result inventory invalid');
    const entries = retained.entries.filter(e => e.ref === ref);
    ensure(entries.length === 1 && hex(entries[0].sha256), 'Retained result missing or ambiguous');
    const base = `pack-retained/${retained.candidate}`;
    const owner = await read(`${base}/owner.json`), result = await read(`${base}/${entries[0].sha256}`);
    const retainedFiles = [`${base}/owner.json`, `${base}/${entries[0].sha256}`];
    ensure(retainedFiles.every((name, i) => evidence.files.filter(file => file.path === name && file.sha256 === [owner.sha256, result.sha256][i] && file.size === Buffer.byteLength([owner.text, result.text][i])).length === 1), 'Retained bytes are missing from snapshot inventory');
    ensure(owner.text === JSON.stringify(retained) && result.sha256 === entries[0].sha256
      && JSON.stringify(json(result.text)) === JSON.stringify(receipt.response.value)
      && (receipt.operation === 'exec' || receipt.input_sha256 === result.sha256), 'Retained result bytes differ');
    visits.push({ stage: visit.stage, visit: visit.visit, attempt: visit.attempt, outcome: visit.outcome,
      successor: selected.successor, result: { ref, sha256: result.sha256, path: result.path },
      acceptance_receipt: { table: 'audit_events', id: selected.receiptId, sha256: hash(selected.raw) },
      start_receipt: { table: 'work_sessions', id: receipt.work_session_id, sha256: selected.startSha256 } });
  }
  ensure(snapshotTreeHash(path.join(root, 'runtime')) === manifest.runtime_sha256
    && (await frozenFile(root, path.join(root, 'snapshot.json'))).sha256 === snapshotSha256, 'Snapshot changed during read');
  return { schema_id: 'dd-eval/pack-visit-history@1', source: { run_id: runId, project_id: manifest.project_id, snapshot_sha256: snapshotSha256 },
    pack: { manifest_sha256: packFile.sha256, flow_id: scope.pack.flow_id, version: scope.pack.version,
      project_commit: pack.project_commit, canon_commit: pack.canon_commit, engine_checksum: pack.engine_checksum,
      engine_manifest_sha256: pack.engine_manifest_sha256, engine_binding_sha256: bindingFile.sha256 }, visits,
    coverage: { matrix_components: 'unavailable', forkability: 'unverified' } };
}

/** Reconcile a K02 catalog selection with the pinned assessment bytes, not target authority. */
export async function readPackCatalogHistory({ snapshot, snapshotSha256, runId, catalog }) {
  try {
    const boundary = catalog?.pack_boundary;
    ensure(catalog?.available === true && typeof catalog.snapshot_id === 'string' && catalog.snapshot_id
      && catalog.manifest_sha256 === snapshotSha256 && boundary && Array.isArray(boundary.accepted)
      && boundary.accepted.length > 0 && boundary.accepted.length <= 256, 'Catalog selection is unavailable');
    const manifestFile = await frozenFile(snapshot, path.join(snapshot, 'snapshot.json'));
    const manifest = json(manifestFile.text), capture = manifest.boundary_capture;
    const identity = { run_id: runId, stage: catalog.after_stage, pack_boundary: boundary };
    ensure(manifestFile.sha256 === snapshotSha256 && manifest.run_id === runId
      && capture?.operation_id === catalog.snapshot_id && capture.boundary_key === hash(JSON.stringify(identity))
      && (manifest.purpose === 'stage_entry' ? manifest.stage_entry : null) === boundary.next_stage,
    'Catalog selection differs from snapshot boundary');
    const history = await readPackHistory({ snapshot, snapshotSha256, runId,
      publications: boundary.accepted.map(({ stage, visit }) => ({ stage, visit })) });
    const state = await withFrozenRuntimeDatabase(snapshot, db => {
      const row = db.prepare('SELECT index_json FROM runs WHERE project_id=? AND id=?').get(manifest.project_id, runId);
      ensure(row, 'Catalog RUN authority is missing');
      return json(row.index_json).pack_state;
    });
    const done = state.visits.filter(visit => visit.status === 'done');
    ensure(isDeepStrictEqual(state.pack, boundary.pack) && isDeepStrictEqual(state.cursor, boundary.cursor)
      && done.length === boundary.accepted.length && catalog.after_stage === done.at(-1)?.stage
      && (boundary.next_stage === null ? typeof state.cursor?.terminal === 'string' && done.length === state.visits.length
        : state.cursor?.stage === boundary.next_stage && state.visits.length === done.length + 1
          && state.visits.at(-1)?.status === 'running' && state.visits.at(-1)?.stage === state.cursor.stage
          && state.visits.at(-1)?.visit === state.cursor.visit),
    'Catalog pack, cursor or accepted inventory differs');
    for (const [i, accepted] of boundary.accepted.entries()) {
      const visit = done[i], checked = history.visits[i];
      ensure(visit.stage === accepted.stage && visit.visit === accepted.visit && visit.attempt === accepted.attempt
        && visit.outcome === accepted.outcome && visit.result === accepted.result
        && checked.acceptance_receipt.sha256 === accepted.receipt_sha256 && checked.result.sha256 === accepted.artifact_sha256,
      'Catalog accepted visit or retained bytes differ');
    }
    ensure(snapshotTreeHash(path.join(snapshot, 'runtime')) === manifest.runtime_sha256
      && (await frozenFile(snapshot, path.join(snapshot, 'snapshot.json'))).sha256 === snapshotSha256,
    'Snapshot changed during catalog reconciliation');
    return { ...history, schema_id: 'dd-eval/pack-catalog-history@1',
      source: { ...history.source, snapshot_id: catalog.snapshot_id, boundary_key: capture.boundary_key } };
  } catch (error) {
    if (error.code === 'pack_history_invalid') throw error;
    throw Object.assign(new Error(`Pack catalog history is unavailable: ${error.message}`, { cause: error }), { code: 'pack_history_invalid' });
  }
}

/** Bind one review to the PLAN bytes it was issued, without claiming reviewer-graph coverage. */
export async function readPackPlanReviewBinding({ snapshot, snapshotSha256, runId, planVisit, reviewVisit }) {
  try {
    const history = await readPackHistory({ snapshot, snapshotSha256, runId, publications: [
      { stage: 'plan', visit: planVisit }, { stage: 'plan-review', visit: reviewVisit }
    ] });
    const [plan, review] = history.visits;
    ensure(plan.successor.stage === 'plan-review' && plan.successor.visit === reviewVisit, 'PLAN did not lead to selected review');
    const planResult = json((await frozenFile(snapshot, path.join(snapshot, plan.result.path))).text);
    const reviewResult = json((await frozenFile(snapshot, path.join(snapshot, review.result.path))).text);
    const manifest = json((await frozenFile(snapshot, path.join(snapshot, 'snapshot.json'))).text);
    const authority = await withFrozenRuntimeDatabase(snapshot, db => {
      const row = db.prepare('SELECT start_receipt_json FROM work_sessions WHERE id=?').get(review.start_receipt.id);
      ensure(row && hash(row.start_receipt_json) === review.start_receipt.sha256, 'Review start receipt changed');
      const start = json(row.start_receipt_json), issued = json(start.run_state), issuedPlan = issued.flow?.plan;
      ensure(issuedPlan?.visit === planVisit && issuedPlan.ref === plan.result.ref && issuedPlan.sha256 === plan.result.sha256,
        'Review was issued a different PLAN');
      const accepted = db.prepare('SELECT payload_json FROM audit_events WHERE id=? AND project_id=?').get(review.acceptance_receipt.id, manifest.project_id);
      const planAccepted = db.prepare('SELECT payload_json FROM audit_events WHERE id=? AND project_id=?').get(plan.acceptance_receipt.id, manifest.project_id);
      const run = db.prepare('SELECT run_root FROM runs WHERE project_id=? AND id=?').get(manifest.project_id, runId);
      ensure(accepted && hash(accepted.payload_json) === review.acceptance_receipt.sha256 && planAccepted
        && hash(planAccepted.payload_json) === plan.acceptance_receipt.sha256 && run, 'Acceptance changed');
      return { receipt: json(planAccepted.payload_json), relative: path.relative(manifest.dd_flow_home, run.run_root) };
    });
    const revisions = [];
    if (planResult.schema_id === 'dd-flow/protocol-plan@6') {
      ensure(Number.isSafeInteger(planResult.revision) && planResult.revision > 0, 'PLAN revision is unavailable');
      revisions.push({ protocol_id: planResult.protocol_id ?? null, ref: plan.result.ref, sha256: plan.result.sha256, revision: planResult.revision });
    } else {
      ensure(planResult.schema_id === 'dd-flow/protocol-plan-set@1' && Array.isArray(planResult.plans)
        && planResult.plans.length >= 2 && planResult.plans.length <= 128, 'PLAN set is unavailable or unsupported');
      const retained = authority.receipt.artifacts, base = `pack-retained/${retained.candidate}`;
      const owner = await frozenFile(snapshot, path.join(snapshot, 'runtime', authority.relative, base, 'owner.json'));
      ensure(owner.text === JSON.stringify(retained), 'PLAN set owner differs');
      for (const member of planResult.plans) {
        ensure(typeof member.protocol_id === 'string' && /^PRT-[A-Za-z0-9][A-Za-z0-9._-]*$/.test(member.protocol_id)
          && member.schema_id === 'dd-flow/protocol-plan@6' && hex(member.sha256)
          && member.ref === `run://plan/${planVisit}/artifacts/${member.sha256}`
          && Number.isSafeInteger(member.revision) && member.revision > 0
          && retained.entries.filter(entry => entry.ref === member.ref && entry.sha256 === member.sha256).length === 1,
        'PLAN set member identity differs');
        const relative = `${base}/${member.sha256}`;
        const file = await frozenFile(snapshot, path.join(snapshot, 'runtime', authority.relative, relative));
        ensure(manifest.pack_evidence.files.filter(item => item.path === relative && item.sha256 === file.sha256
          && item.size === Buffer.byteLength(file.text)).length === 1 && file.sha256 === member.sha256, 'PLAN set member bytes differ');
        const value = json(file.text);
        ensure(value.schema_id === member.schema_id && value.protocol_id === member.protocol_id && value.revision === member.revision, 'PLAN set member revision differs');
        revisions.push({ protocol_id: member.protocol_id, ref: member.ref, sha256: member.sha256, revision: member.revision, path: file.path });
      }
      ensure(new Set(revisions.map(item => item.protocol_id)).size === revisions.length
        && new Set(revisions.map(item => item.ref)).size === revisions.length, 'PLAN set members are ambiguous');
    }
    if (reviewResult.schema_id === 'dd-flow/plan-review-transition@1') {
      ensure(reviewResult.plan_ref === plan.result.ref && reviewResult.plan_sha256 === plan.result.sha256
        && reviewResult.outcome === review.outcome, 'Review transition belongs to another PLAN or outcome');
    } else {
      ensure(reviewResult.schema_id === 'dd-flow/plan-review-decision@4' && reviewResult.outcome === review.outcome
        && reviewResult.correction?.status === 'not_required' && reviewResult.correction.previous_plan_revision === revisions[0].revision,
      'Review decision or PLAN revision is unavailable or unsupported');
    }
    ensure(snapshotTreeHash(path.join(snapshot, 'runtime')) === manifest.runtime_sha256
      && (await frozenFile(snapshot, path.join(snapshot, 'snapshot.json'))).sha256 === snapshotSha256, 'Snapshot changed during review binding');
    return { schema_id: 'dd-eval/pack-plan-review-binding@1', source: history.source, pack: history.pack,
      plan: { ...plan, ...(revisions.length === 1 ? { revision: revisions[0].revision, protocol_id: revisions[0].protocol_id } : { members: revisions }) }, review,
      coverage: { reviewer_graph: 'unavailable', matrix_components: 'unavailable', forkability: 'unverified' } };
  } catch (error) {
    if (error.code === 'pack_history_invalid') throw error;
    throw Object.assign(new Error(`Pack review binding is unavailable: ${error.message}`, { cause: error }), { code: 'pack_history_invalid' });
  }
}


/** Trace a substantive correction through revise and the following PLAN/review visits. */
export async function readPackRevisionChain({ snapshot, snapshotSha256, runId, previousPlanVisit, previousReviewVisit, planVisit, reviewVisit }) {
  try {
    const scope = { snapshot, snapshotSha256, runId };
    const previous = await readPackPlanReviewBinding({ ...scope, planVisit: previousPlanVisit, reviewVisit: previousReviewVisit });
    const current = await readPackPlanReviewBinding({ ...scope, planVisit, reviewVisit });
    ensure(previous.review.outcome === 'revise' && previous.review.successor.stage === 'plan' && previous.review.successor.visit === planVisit,
      'Selected previous review did not return to the selected PLAN');
    const manifest = json((await frozenFile(snapshot, path.join(snapshot, 'snapshot.json'))).text);
    await withFrozenRuntimeDatabase(snapshot, db => {
      const row = db.prepare('SELECT start_receipt_json FROM work_sessions WHERE id=?').get(current.plan.start_receipt.id);
      ensure(row && hash(row.start_receipt_json) === current.plan.start_receipt.sha256, 'Revised PLAN start changed');
      const issued = json(json(row.start_receipt_json).run_state), prior = issued.flow?.plan;
      ensure(prior?.visit === previousPlanVisit && prior.ref === previous.plan.result.ref && prior.sha256 === previous.plan.result.sha256,
        'Revised PLAN was issued a different predecessor');
    });
    const members = async plan => {
      const items = plan.members ?? [{ protocol_id: plan.protocol_id, revision: plan.revision, sha256: plan.result.sha256, path: plan.result.path }];
      return Promise.all(items.map(async item => ({ ...item, value: json((await frozenFile(snapshot, path.join(snapshot, item.path))).text) })));
    };
    const before = await members(previous.plan), after = await members(current.plan);
    ensure(before.length === after.length && before.length > 0, 'Revised PLAN membership differs');
    const aspectMaps = async (item, plans) => {
      const authority = await withFrozenRuntimeDatabase(snapshot, db => {
        const start = db.prepare('SELECT start_receipt_json FROM work_sessions WHERE id=?').get(item.review.start_receipt.id);
        const accepted = db.prepare('SELECT payload_json FROM audit_events WHERE id=? AND project_id=?').get(item.plan.acceptance_receipt.id, manifest.project_id);
        const run = db.prepare('SELECT run_root FROM runs WHERE project_id=? AND id=?').get(manifest.project_id, runId);
        ensure(start && hash(start.start_receipt_json) === item.review.start_receipt.sha256 && accepted
          && hash(accepted.payload_json) === item.plan.acceptance_receipt.sha256 && run, 'PLAN aspect map authority changed');
        return { state: json(json(start.start_receipt_json).run_state).flow.plan,
          retained: json(accepted.payload_json).artifacts, relative: path.relative(manifest.dd_flow_home, run.run_root) };
      });
      const result = json((await frozenFile(snapshot, path.join(snapshot, item.plan.result.path))).text);
      const bindings = result.schema_id === 'dd-flow/protocol-plan-set@1'
        ? result.plans.map(entry => ({ protocol_id: entry.protocol_id, ...entry.aspect_map })) : authority.state.aspect_maps;
      ensure(Array.isArray(bindings) && bindings.length === plans.length, 'PLAN aspect maps are unavailable');
      const base = `pack-retained/${authority.retained.candidate}`;
      const owner = await frozenFile(snapshot, path.join(snapshot, 'runtime', authority.relative, base, 'owner.json'));
      ensure(owner.text === JSON.stringify(authority.retained), 'PLAN aspect map owner differs');
      return Promise.all(bindings.map(async (binding, i) => {
        ensure(binding?.protocol_id === plans[i].protocol_id && hex(binding.sha256)
          && binding.ref === `run://plan/${item.plan.visit}/artifacts/${binding.sha256}`
          && authority.retained.entries.filter(entry => entry.ref === binding.ref && entry.sha256 === binding.sha256).length === 1,
        'PLAN aspect map reference differs');
        const relative = `${base}/${binding.sha256}`;
        const file = await frozenFile(snapshot, path.join(snapshot, 'runtime', authority.relative, relative));
        ensure(file.sha256 === binding.sha256 && manifest.pack_evidence.files.filter(entry => entry.path === relative
          && entry.sha256 === file.sha256 && entry.size === Buffer.byteLength(file.text)).length === 1, 'PLAN aspect map bytes differ');
        const value = json(file.text);
        ensure(value.schema_id === 'dd-flow/plan-aspect-map@3' && value.protocol_id === plans[i].protocol_id
          && value.plan_id === plans[i].value.plan_id && value.plan_revision === plans[i].revision, 'PLAN aspect map identity differs');
        return { ref: binding.ref, sha256: binding.sha256, path: file.path, value };
      }));
    };
    const beforeMaps = await aspectMaps(previous, before), afterMaps = await aspectMaps(current, after);
    let changed = false;
    for (const [i, old] of before.entries()) {
      const next = after[i];
      ensure(old.protocol_id && old.protocol_id === next.protocol_id && old.value.plan_id && old.value.plan_id === next.value.plan_id,
        'Revised PLAN identity differs');
      if (old.sha256 !== next.sha256) {
        const oldContent = { ...old.value }, newContent = { ...next.value }; delete oldContent.revision; delete newContent.revision;
        ensure(next.revision > old.revision && !isDeepStrictEqual(oldContent, newContent), 'Changed PLAN lacks a substantive revision');
        changed = true;
      } else ensure(old.revision === next.revision, 'Unchanged PLAN revision differs');
      if (!isDeepStrictEqual(beforeMaps[i].value, afterMaps[i].value)) changed = true;
    }
    ensure(changed, 'No retained PLAN or aspect map change');
    ensure(snapshotTreeHash(path.join(snapshot, 'runtime')) === manifest.runtime_sha256
      && (await frozenFile(snapshot, path.join(snapshot, 'snapshot.json'))).sha256 === snapshotSha256, 'Snapshot changed during revision read');
    return { schema_id: 'dd-eval/pack-revision-chain@1', source: previous.source, pack: previous.pack, previous, current, aspect_maps: { previous: beforeMaps.map(({ value, ...item }) => item), current: afterMaps.map(({ value, ...item }) => item) },
      coverage: { reviewer_graph: 'unavailable', matrix_components: 'unavailable', forkability: 'unverified' } };
  } catch (error) {
    if (error.code === 'pack_history_invalid') throw error;
    throw Object.assign(new Error(`Pack revision chain is unavailable: ${error.message}`, { cause: error }), { code: 'pack_history_invalid' });
  }
}
