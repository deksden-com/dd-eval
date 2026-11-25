const invalid = message => { throw Object.assign(new Error(message), { code: 'pack_component_invocation_invalid' }); };

/** Read paired durable invocation records; this does not constrain host Node APIs. */
export function readPackInvocationObservations(db, history, visit, generation) {
  const events = db.prepare(`SELECT id,event_type,payload_json FROM audit_events WHERE project_id=?
    AND event_type IN ('flow_run.pack_component_invocation_started','flow_run.pack_component_invocation_completed')
    AND json_extract(payload_json,'$.run_id')=? AND json_extract(payload_json,'$.stage')=? AND json_extract(payload_json,'$.visit')=?
    AND json_extract(payload_json,'$.attempt')=? AND json_extract(payload_json,'$.generation')=? ORDER BY id LIMIT 2001`)
    .all(history.source.project_id, history.source.run_id, visit.stage, visit.visit, visit.attempt, generation);
  if (events.length > 2000) return invalid('Pack invocation journal exceeds its limit');
  const pending = new Map(), seen = new Set(), records = [], gaps = new Set();
  const accepted = db.prepare("SELECT payload_json FROM audit_events WHERE id=? AND project_id=? AND event_type='flow_run.pack_submission_accepted'").get(visit.acceptance_receipt.id, history.source.project_id);
  if (!accepted) return invalid('Pack invocation acceptance is missing');
  const root = JSON.parse(accepted.payload_json);
  const started = db.prepare('SELECT start_receipt_json FROM work_sessions WHERE id=?').get(visit.start_receipt.id);
  if (!started) return invalid('Pack invocation start receipt is missing');
  const startReceipt = JSON.parse(started.start_receipt_json);
  const expectedStart = startReceipt.pack_start?.component_invocation_id, expectedFinish = root.component_invocation_id;
  if (!expectedStart || !expectedFinish) gaps.add('invocation_binding_missing');
  const bound = new Set();
  let startObserved = false, finishObserved = false;
  if (!events.length) gaps.add('invocation_journal_missing');
  for (const event of events) {
    const value = JSON.parse(event.payload_json), { outcome, component_inputs, component_inputs_sha256, scope_unavailable, ...identity } = value;
    if (identity.schema_id !== 'dd-flow/pack-component-invocation@1' || !/^[0-9a-f-]{36}$/.test(identity.invocation_id ?? '')
      || identity.run_id !== history.source.run_id || identity.stage !== visit.stage || identity.visit !== visit.visit || identity.attempt !== visit.attempt || identity.generation !== generation
      || identity.pack_sha256 !== history.pack.manifest_sha256 || typeof identity.work_id !== 'string' || typeof identity.work_session_id !== 'string'
      || typeof identity.command !== 'string' || !identity.command || !['start', 'exec', 'finish', 'work'].includes(identity.operation)
      || !/^[a-f0-9]{64}$/.test(identity.args_sha256 ?? '') || event.id >= visit.acceptance_receipt.id) return invalid('Pack invocation identity differs');
    const member = db.prepare('SELECT 1 FROM stage_work_memberships WHERE project_id=? AND run_id=? AND stage=? AND attempt=? AND work_id=?').get(history.source.project_id, history.source.run_id, visit.stage, `visit-${visit.visit}`, identity.work_id);
    const session = db.prepare('SELECT 1 FROM work_sessions WHERE id=? AND work_id=?').get(identity.work_session_id, identity.work_id);
    if (!member || !session) gaps.add('invocation_owner_unproven');
    const key = identity.invocation_id, encoded = JSON.stringify(identity);
    if (event.event_type === 'flow_run.pack_component_invocation_started') {
      if (seen.has(key) || outcome !== undefined || component_inputs !== undefined || component_inputs_sha256 !== undefined || scope_unavailable !== undefined) return invalid('Pack invocation start is ambiguous');
      seen.add(key); pending.set(key, encoded);
    } else {
      if (pending.get(key) !== encoded || !['returned', 'threw'].includes(outcome)) return invalid('Pack invocation completion differs');
      pending.delete(key);
      if (outcome === 'threw') gaps.add('invocation_threw');
      if (outcome === 'returned' && identity.work_id === root.work_id && identity.work_session_id === root.work_session_id) {
        startObserved ||= identity.operation === 'start';
        finishObserved ||= identity.operation === root.operation && identity.command === root.command;
        if (key === expectedStart && identity.operation === 'start' && component_inputs_sha256 === startReceipt.pack_start?.component_inputs_sha256) bound.add(key);
        if (key === expectedFinish && identity.operation === root.operation && identity.command === root.command && component_inputs_sha256 === root.component_inputs_sha256) bound.add(key);
      }
      if (scope_unavailable === true && component_inputs === undefined && component_inputs_sha256 === undefined) gaps.add('invocation_scope_missing');
      else if (!component_inputs || scope_unavailable !== undefined) return invalid('Pack invocation scope is invalid');
      else records.push({ stage: visit.stage, visit: visit.visit, kind: 'invocation', scope: component_inputs, scopeSha256: component_inputs_sha256 });
    }
  }
  if (pending.size) gaps.add('invocation_completion_missing');
  if (events.length && (!startObserved || !finishObserved)) gaps.add('invocation_boundary_missing');
  if (expectedStart && expectedFinish && (!bound.has(expectedStart) || !bound.has(expectedFinish) || expectedStart === expectedFinish)) return invalid('Pack invocation receipt binding differs');
  return { records, gaps: [...gaps] };
}
