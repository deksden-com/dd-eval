import path from 'node:path';
import { createHash } from 'node:crypto';
import { frozenFile, withFrozenRuntimeDatabase } from './frozen-evidence-io.mjs';
import { snapshotTreeHash } from './snapshot-tree.mjs';
import { readPackPlanReviewBinding, readPackRevisionChain } from './pack-history.mjs';

const hash = value => createHash('sha256').update(value).digest('hex');
const digest = value => {
  const canonical = item => Array.isArray(item) ? item.map(canonical) : item && typeof item === 'object'
    ? Object.fromEntries(Object.entries(item).sort(([a], [b]) => a.localeCompare(b, 'en')).map(([key, child]) => [key, canonical(child)])) : item;
  return hash(JSON.stringify(canonical(value)));
};
const ensure = (value, message) => { if (!value) throw Object.assign(new Error(message), { code: 'pack_history_invalid' }); };
const json = value => JSON.parse(value);

/** Validate one registered reviewer graph. This is not full component coverage. */
export async function readPackReviewerGraph(input) {
  try {
    const binding = await readPackPlanReviewBinding(input), { snapshot, snapshotSha256, runId, reviewVisit } = input;
    const manifest = json((await frozenFile(snapshot, path.join(snapshot, 'snapshot.json'))).text), projectId = binding.source.project_id;
    const collected = await withFrozenRuntimeDatabase(snapshot, db => {
      const run = db.prepare('SELECT run_root,index_json FROM runs WHERE project_id=? AND id=?').get(projectId, runId);
      const index = json(run.index_json), root = index.root_work_id;
      const graphs = db.prepare("SELECT id,payload_json FROM audit_events WHERE project_id=? AND event_type='flow_run.pack_review_graph_registered' AND json_extract(payload_json,'$.run_id')=? AND json_extract(payload_json,'$.visit')=?").all(projectId, runId, reviewVisit);
      ensure(graphs.length === 1, 'Reviewer graph is missing or ambiguous');
      const graph = json(graphs[0].payload_json), entries = Object.entries(graph.work_ids ?? {});
      const rootAcceptance = db.prepare('SELECT payload_json FROM audit_events WHERE id=? AND project_id=?').get(binding.review.acceptance_receipt.id, projectId);
      ensure(rootAcceptance && hash(rootAcceptance.payload_json) === binding.review.acceptance_receipt.sha256
        && json(rootAcceptance.payload_json).generation === graph.generation, 'Reviewer generation differs');
      ensure(graph.run_id === runId && graph.stage === 'plan-review' && graph.visit === reviewVisit
        && graph.attempt === binding.review.attempt && graph.work_session_id === binding.review.start_receipt.id
        && graph.plan_visit === input.planVisit && graph.plan_ref === binding.plan.result.ref && graph.plan_sha256 === binding.plan.result.sha256
        && graphs[0].id < binding.review.acceptance_receipt.id && Number.isSafeInteger(graph.generation)
        && entries.length > 0 && entries.length <= 128 && new Set(entries.map(([, id]) => id)).size === entries.length,
      'Reviewer graph identity differs');
      const dispatches = db.prepare("SELECT id,payload_json FROM audit_events WHERE project_id=? AND event_type='flow_run.pack_component_observation' AND json_extract(payload_json,'$.run_id')=? AND json_extract(payload_json,'$.stage')='plan-review' AND json_extract(payload_json,'$.visit')=? AND json_extract(payload_json,'$.work_session_id')=? AND json_extract(payload_json,'$.command')='dispatch'").all(projectId, runId, reviewVisit, graph.work_session_id);
      ensure(dispatches.length === 1, 'Reviewer dispatch observation is missing or ambiguous');
      const dispatch = json(dispatches[0].payload_json);
      ensure(dispatches[0].id > graphs[0].id && dispatches[0].id < binding.review.acceptance_receipt.id && dispatch.work_id === root
        && dispatch.attempt === graph.attempt && dispatch.generation === graph.generation
        && dispatch.component_inputs?.schema_id === 'dd-flow/pack-component-inputs@1' && dispatch.component_inputs.access_failures === false
        && JSON.stringify(dispatch.component_inputs.stages) === JSON.stringify(['plan-review'])
        && Array.isArray(dispatch.component_inputs.files) && Array.isArray(dispatch.component_inputs.listings)
        && hash(JSON.stringify(dispatch.component_inputs)) === dispatch.component_inputs_sha256, 'Reviewer dispatch observation differs');
      const children = entries.map(([key, workId]) => {
        const work = db.prepare('SELECT * FROM works WHERE project_id=? AND run_id=? AND work_id=?').get(projectId, runId, workId);
        ensure(work && work.parent_work_id === root && work.status === 'completed' && work.result_schema === 'dd-flow/plan-review-result@1', 'Reviewer Work differs');
        const payload = json(work.payload_json), marker = payload._dd_flow_batch_request;
        ensure(marker?.item_key === key && payload.kind === 'plan-review' && payload.read_only === true
          && payload.plan_visit === input.planVisit && payload.plan_sha256 === graph.plan_sha256 && payload.review_visit === reviewVisit
          && payload.group?.key === key && Array.isArray(payload.group.aspect_ids)
          && (binding.plan.members ?? [binding.plan]).some(item => item.protocol_id === payload.group.protocol_id && item.revision === payload.group.plan_revision), 'Reviewer Work input differs');
        const batches = db.prepare("SELECT id,payload_json FROM audit_events WHERE project_id=? AND event_type='work.batch_registration' AND json_extract(payload_json,'$.request_sha256')=?").all(projectId, marker.request_sha256);
        ensure(batches.length === 1, 'Reviewer batch receipt is missing or ambiguous');
        const batch = json(batches[0].payload_json), scope = batch.scope;
        const immutable = { work_id: work.work_id, project_id: work.project_id, run_id: work.run_id, parent_work_id: work.parent_work_id,
          task: work.task, launch_policy: work.launch_policy, result_schema: work.result_schema, payload, depends_on: json(work.depends_on_json) };
        const membership = db.prepare('SELECT 1 FROM stage_work_memberships WHERE project_id=? AND run_id=? AND stage=? AND attempt=? AND cycle=? AND work_id=?').get(projectId, runId, 'plan-review', `visit-${reviewVisit}`, scope.cycle, workId);
        ensure(batch.run_id === runId && scope.project_id === projectId && scope.run_id === runId && scope.stage === 'plan-review'
          && scope.attempt === `visit-${reviewVisit}` && scope.parent_work_id === root && scope.request_key === `review-v${reviewVisit}`
          && batch.request_sha256 === marker.request_sha256 && digest(scope) === marker.request_sha256
          && batch.batch_sha256 === marker.batch_sha256 && graph.items_sha256 === marker.batch_sha256
          && JSON.stringify(batch.work_ids) === JSON.stringify(graph.work_ids) && batch.work_sha256?.[workId] === digest(immutable) && membership,
        'Reviewer batch custody differs');
        const rows = db.prepare("SELECT id,payload_json FROM audit_events WHERE project_id=? AND event_type='flow_run.pack_submission_accepted' AND json_extract(payload_json,'$.run_id')=? AND json_extract(payload_json,'$.stage')='plan-review' AND json_extract(payload_json,'$.visit')=? AND json_extract(payload_json,'$.work_id')=?").all(projectId, runId, reviewVisit, workId);
        ensure(rows.length === 1 && rows[0].id > graphs[0].id && rows[0].id < binding.review.acceptance_receipt.id, 'Reviewer acceptance is missing or ambiguous');
        const receipt = json(rows[0].payload_json), session = db.prepare('SELECT status FROM work_sessions WHERE id=? AND work_id=?').get(receipt.work_session_id, workId);
        const ref = `run://plan-review/${reviewVisit}/work-results/${workId}/${receipt.work_session_id}/result.json`;
        ensure(receipt.run_id === runId && receipt.stage === 'plan-review' && receipt.visit === reviewVisit && receipt.work_id === workId
          && receipt.operation === 'work' && receipt.attempt === graph.attempt && receipt.generation === graph.generation && session?.status === 'completed'
          && receipt.artifacts?.entries?.filter(entry => entry.ref === ref && entry.sha256 === receipt.input_sha256).length === 1,
        'Reviewer result scope differs');
        return { key, workId, work, receipt, ref, row: rows[0], batch: batches[0] };
      });
      return { graph, graphRow: graphs[0], dispatch: dispatches[0], children, relative: path.relative(manifest.dd_flow_home, run.run_root) };
    });
    const children = [];
    for (const child of collected.children) {
      const retained = child.receipt.artifacts;
      ensure(/^candidate-[0-9a-f-]{36}$/.test(retained.candidate ?? ''), 'Reviewer artifact owner differs');
      const base = `pack-retained/${retained.candidate}`, read = name => frozenFile(snapshot, path.join(snapshot, 'runtime', collected.relative, base, name));
      const owner = await read('owner.json'), result = await read(child.receipt.input_sha256);
      const value = json(result.text), group = json(child.work.payload_json).group;
      const aspects = value.aspects?.map(aspect => aspect.aspect_id).sort();
      ensure(owner.text === JSON.stringify(retained) && result.sha256 === child.receipt.input_sha256 && result.text === child.work.result
        && value.schema_id === 'dd-flow/plan-review-result@1' && value.plan_revision === group.plan_revision
        && Array.isArray(aspects) && new Set(aspects).size === aspects.length && JSON.stringify(aspects) === JSON.stringify([...group.aspect_ids].sort())
        && [ ['owner.json', owner], [child.receipt.input_sha256, result] ].every(([name, file]) => manifest.pack_evidence.files.filter(item => item.path === `${base}/${name}` && item.sha256 === file.sha256 && item.size === Buffer.byteLength(file.text)).length === 1),
      'Reviewer retained result differs');
      children.push({ key: child.key, work_id: child.workId, result: { ref: child.ref, sha256: result.sha256, path: result.path },
        acceptance_receipt: { table: 'audit_events', id: child.row.id, sha256: hash(child.row.payload_json) },
        batch_receipt: { table: 'audit_events', id: child.batch.id, sha256: hash(child.batch.payload_json) } });
    }
    ensure(snapshotTreeHash(path.join(snapshot, 'runtime')) === manifest.runtime_sha256
      && (await frozenFile(snapshot, path.join(snapshot, 'snapshot.json'))).sha256 === snapshotSha256, 'Snapshot changed during graph read');
    return { schema_id: 'dd-eval/pack-reviewer-graph@1', binding, graph: { table: 'audit_events', id: collected.graphRow.id, sha256: hash(collected.graphRow.payload_json) },
      dispatch: { table: 'audit_events', id: collected.dispatch.id, sha256: hash(collected.dispatch.payload_json) }, children,
      coverage: { matrix_components: 'unavailable', forkability: 'unverified' } };
  } catch (error) {
    if (error.code === 'pack_history_invalid') throw error;
    throw Object.assign(new Error(`Pack reviewer graph is unavailable: ${error.message}`, { cause: error }), { code: 'pack_history_invalid' });
  }
}


/** Resolve both explicitly selected reviewer graphs without claiming full matrix coverage. */
export async function readPackRevisionGraphs(input) {
  try {
    const chain = await readPackRevisionChain(input);
    const scope = { snapshot: input.snapshot, snapshotSha256: input.snapshotSha256, runId: input.runId };
    const previous = await readPackReviewerGraph({ ...scope, planVisit: input.previousPlanVisit, reviewVisit: input.previousReviewVisit });
    const current = await readPackReviewerGraph({ ...scope, planVisit: input.planVisit, reviewVisit: input.reviewVisit });
    ensure(previous.binding.plan.result.sha256 === chain.previous.plan.result.sha256 && previous.binding.review.result.sha256 === chain.previous.review.result.sha256
      && current.binding.plan.result.sha256 === chain.current.plan.result.sha256 && current.binding.review.result.sha256 === chain.current.review.result.sha256,
    'Reviewer graphs differ from the selected revision chain');
    const manifest = json((await frozenFile(input.snapshot, path.join(input.snapshot, 'snapshot.json'))).text);
    ensure(snapshotTreeHash(path.join(input.snapshot, 'runtime')) === manifest.runtime_sha256
      && (await frozenFile(input.snapshot, path.join(input.snapshot, 'snapshot.json'))).sha256 === input.snapshotSha256, 'Snapshot changed during graph selection');
    return { schema_id: 'dd-eval/pack-revision-graphs@1', source: chain.source, pack: chain.pack, chain, previous_graph: previous, current_graph: current,
      coverage: { matrix_components: 'unavailable', forkability: 'unverified' } };
  } catch (error) {
    if (error.code === 'pack_history_invalid') throw error;
    throw Object.assign(new Error(`Pack revision graphs are unavailable: ${error.message}`, { cause: error }), { code: 'pack_history_invalid' });
  }
}
