import path from "node:path";
import { readFile, readdir, appendFile } from "node:fs/promises";
import { readEvents, reduceEvents, appendEvent, hashJson, repairLegacyEventSequences, writeJsonAtomic, publishObservation } from "./runner-events.mjs";
import { withRunnerLock } from './runner-lock.mjs';
import { executionState } from "./execution-state.mjs";
import { processSnapshot } from "./process-snapshot.mjs";
import { workerLiveness } from "./eval-resume-worker.mjs";
import { commandJson } from "./process-json.mjs";
import { cleanupSidecars } from "./eval-retirement.mjs";
import { isTechnicalNote } from './technical-notes.mjs';

const terminal = state => ["completed", "completed_with_failures", "failed", "cancelled", "finished", "stopped"].includes(state);
export const progressEvent = event => !isTechnicalNote(event) && !["dev.dd.eval.health.reconciled", "dev.dd.eval.observer.heartbeat"].includes(event.type);
const latest = values => values.filter(value => typeof value === "string" && Number.isFinite(Date.parse(value))).sort((a,b) => Date.parse(b)-Date.parse(a))[0] ?? null;

export function assessEvalHealth({ state, events, owners, flowHealth = [], now, noProgressMs, projection:providedProjection }) {
  const progress = events.filter(progressEvent), lastProgress = progress.at(-1)?.time ?? null;
  const live = owners.some(owner => owner.state === "alive");
  const absent = owners.length > 0 && owners.every(owner => owner.state === "absent");
  const childrenActive = flowHealth.some(flow => ["active","no_progress"].includes(flow.health?.state));
  const technicalPause = flowHealth.some(flow => flow.complete && flow.health?.reason === "native_writer_dependency_blocked");
  const incompleteFlow = flowHealth.some(flow => !flow.complete);
  let health = "unknown", reason = "owner_identity_missing", phase = null;
  if (terminal(state)) { health = "settled"; reason = "saved_terminal_result"; }
  else if (state === "planned" && !events.some(event => event.type === "dev.dd.eval.operation.started")) { health = "waiting"; reason = "not_started"; phase = "planned"; }
  else if (state === "recovery_blocked" || state === "recovery_failed") { health = "waiting"; reason = state; phase = state; }
  else if (owners.some(owner => owner.phase === "waiting_for_user" && (!lastProgress||Date.parse(owner.observed_at)>=Date.parse(lastProgress)))) { health = "waiting"; reason = "waiting_for_user"; phase = reason; }
  else if (technicalPause && !childrenActive) {
    health = incompleteFlow ? "unknown" : "waiting";
    reason = incompleteFlow ? "flow_observation_incomplete" : "native_writer_dependency_blocked";
    phase = incompleteFlow ? null : "dependency_blocked";
  }
  else if (live) {
    const age = Date.parse(now)-Date.parse(lastProgress);
    health = Number.isFinite(age) && age > noProgressMs ? "no_progress" : "active";
    reason = health === "no_progress" ? "progress_overdue" : "physical_owner_observed";
  } else if (childrenActive) { health = absent ? "owner_lost" : "unknown"; reason = absent ? "native_execution_still_active" : "observer_identity_missing"; }
  else if (absent) { health = "owner_lost"; reason = "physical_owner_retired"; }
  // A durable operator pause is still a pause, even with an exited observer.
  const projection = providedProjection ?? reduceEvents(events);
  if (!terminal(state) && projection.control?.mode === "pause") { health = "waiting"; reason = "operator_pause_requested"; phase = "pause_requested"; }
  return { schema_id: "dd-eval/run-health@1", state: health, reason, phase, owner_state:live?'alive':absent?'absent':'unknown', last_progress_at: lastProgress, last_heartbeat_at: latest([...events.filter(event => event.type === "dev.dd.eval.observer.heartbeat").map(event => event.time),...owners.map(owner=>owner.heartbeat_at)]), observed_at: now, no_progress_ms: noProgressMs };
}

/** RUN control status is a bound durable read, not a provider observation. */
export function boundFlowHealth(item) {
  const receipt = item?.receipt, control = receipt?.control;
  if (item?.unavailable || !item?.run_id || receipt?.scope?.run_id !== item.run_id) return { id: item?.execution, complete: false };
  const technical = receipt.run_status === "paused" && control?.current === true && control.requested_mode === "pause"
    && typeof control.request_id === "string" && control.request_id.startsWith("technical:")
    && receipt.technical_notes?.some(note => note.run_id === item.run_id && note.state === "open" && note.consequence === "dependency_blocked");
  return { id: item.execution, complete: true, health: technical
    ? { state: "waiting", reason: "native_writer_dependency_blocked" }
    : { state: receipt.run_status === "running" ? "active" : ["done", "failed", "cancelled"].includes(receipt.run_status) ? "settled" : "unknown", reason: "bound_run_status" } };
}

/** Observation and projection repair only. Never resumes or runs Judge. */
export async function reconcileEvalHealth({ evalRoot, apply = false, flowCli = null, observeFlow = null, noProgressMs = 30*60_000 }) {
  if (!Number.isSafeInteger(noProgressMs) || noProgressMs < 1000) throw Object.assign(new Error("no-progress-ms must be an integer of at least 1000"), { code: "usage" });
  const root = path.resolve(evalRoot), file = path.join(root,"events.jsonl");
  const manifestBytes = await readFile(path.join(root,"manifest.json")), manifest = JSON.parse(manifestBytes);
  if (!manifest.run_id || !Array.isArray(manifest.executions) || manifest.executions.some(execution => typeof execution?.id !== 'string' || !execution.id || path.basename(execution.id)!==execution.id || ['.','..'].includes(execution.id) || /[\\\u0000]/.test(execution.id))) throw Object.assign(new Error("Eval manifest has no safe execution scope"), { code: "runner_manifest_invalid" });
  let sequenceRepair;
  let events;
  try{events=await readEvents(file);}catch(error){
    if(error.code!=='journal_conflict')throw error;
    sequenceRepair=await repairLegacyEventSequences(file,manifest.run_id,apply);
    events=await readEvents(file,{previewLegacySequences:!apply});
  }
  if (events.some(event => event.runid !== manifest.run_id)) throw Object.assign(new Error("Journal belongs to another Eval"), { code: "journal_conflict" });
  let projection,journalConflict=false;
  try{projection=reduceEvents(events);}catch(error){if(error.code!=='journal_conflict')throw error;journalConflict=true;projection={state:'unconfirmed',operations:{}};}
  let report = null;
  try { report = JSON.parse(await readFile(path.join(root,"reports/report.json"),"utf8")); } catch (error) { if (error.code !== "ENOENT") throw error; }
  const results = manifest.executions.map(execution => executionState(events,manifest.run_id,execution));
  const terminalSequence = events.findLast(event => event.type === 'dev.dd.eval.completed')?.data.sequence ?? 0;
  const newerRecovery = results.some(item => item.generation > 0 && (item.started && !['candidate_ready','failed','cancelled'].includes(item.result.state)
    || events.some(event => event.data.operation_id === item.operation_id && ['dev.dd.eval.operation.requested','dev.dd.eval.operation.started'].includes(event.type) && event.data.sequence > terminalSequence)));
  let reportCurrent = report?.run_id === manifest.run_id && !newerRecovery && !projection.control && !projection.cancellation;
  const candidateHash = events.findLast(event => event.type === 'dev.dd.eval.candidate.frozen')?.data.candidate_sha256;
  if (reportCurrent && candidateHash && report.candidate?.immutable_hash && candidateHash !== report.candidate.immutable_hash) reportCurrent = false;
  let baseState = reportCurrent && terminal(report.state) ? report.state : projection.state;
  // Repair the historical projection, preserving the original Report and
  // Judge evidence. A successful Subject is not a successful evaluation.
  if(reportCurrent) {
    if(baseState === 'completed' && report.judge_status === 'failed')baseState='completed_with_failures';
    else if(baseState === 'completed' && manifest.profile?.judge?.enabled && ['in_progress','not_run_cleanup_only'].includes(report.judge_status))baseState='awaiting_provider';
  }
  let processes;
  try { processes = await processSnapshot(); } catch { processes = null; }
  const ownerEvents = events.filter(event => event.type === "dev.dd.eval.operation.started" && !projection.operations[event.data.operation_id]?.terminal && event.data.owner_pid && event.data.owner_started_at);
  const admission=events.findLast(event=>event.type==='dev.dd.eval.operation.started'&&!projection.operations[event.data.operation_id]?.terminal)?.time;
  const identities = [...new Map(ownerEvents.map(event => [event.data.owner_pid, event.data])).values()];
  const owners = identities.map(saved => processes ? workerLiveness(saved, processes) : {state:"unknown"});
  // New detached workers and historical continuation records retain exact PID
  // birth identities. Do not use process names or age as ownership evidence.
  for (const directory of ["runner-attempts", "control-resumes"]) {
    let names; try { names = await readdir(path.join(root,directory)); } catch (error) { if (error.code === "ENOENT") continue; throw error; }
    for (const name of names) {
      if (!/^[a-f0-9]{64}(?:\.json)?$/.test(name)) continue;
      const attempt = path.join(root,directory,name,...(directory === "runner-attempts" ? ["attempt.json"] : []));
      try { const saved = JSON.parse(await readFile(attempt,"utf8")); if (saved.intent?.eval_root !== root || admission && Date.parse(saved.updated_at)<Date.parse(admission)) continue; owners.push({...processes ? workerLiveness(saved, processes) : {state:"unknown"}, phase:saved.status,observed_at:saved.updated_at,heartbeat_at:saved.heartbeat_at}); } catch { owners.push({state:"unknown"}); }
    }
  }
  const flowHealth = [];
  if (flowCli || observeFlow) for (const execution of manifest.executions) {
    const home = path.join(root,"executions",execution.id,"dd-flow-home");
    try {
      const result = observeFlow ? await observeFlow(home,apply,noProgressMs) : await commandJson(flowCli,["run","reconcile","--json",...(apply?["--apply"]:[]),"--no-progress-ms",String(noProgressMs)], { env: { DD_FLOW_HOME:home, DD_FLOW_ENGINE_MODE:"1", ...(manifest.runtime_resource_home ? {DD_FLOW_RESOURCE_HOME:manifest.runtime_resource_home}:{}) }, timeoutMs:20_000 });
      if (result.results.length === 1) flowHealth.push({ id:execution.id, complete:true, health:result.results[0].health }); else flowHealth.push({id:execution.id,complete:false});
    } catch { flowHealth.push({ id:execution.id,complete:false }); }
  }
  if (!flowCli && !observeFlow && !terminal(baseState) && path.isAbsolute(manifest.runtime_control_bin ?? "") && manifest.executions.length) {
    try {
      const { runnerControlStatus } = await import('./runner.mjs');
      const bound = await runnerControlStatus({ evalRoot: root });
      for (const execution of manifest.executions) flowHealth.push(boundFlowHealth(bound.executions?.find(item => item.execution === execution.id) ?? { execution: execution.id, unavailable: true }));
    } catch { for (const execution of manifest.executions) flowHealth.push({ id: execution.id, complete: false }); }
  }
  const health = assessEvalHealth({ state:baseState, events, owners, flowHealth, now:new Date().toISOString(), noProgressMs,projection });
  if(journalConflict){health.state='unknown';health.reason='journal_conflict';}
  const completedExecutions = results.length > 0 && results.every(item => ["candidate_ready","failed","cancelled"].includes(item.result.state));
  let state = baseState;
  let controlStatus=null;
  if(projection.control)try {
    const {runnerControlStatus,projectStoppedControl}=await import('./runner.mjs');
    const live=await runnerControlStatus({evalRoot:root,signal:AbortSignal.timeout(5000)});
    controlStatus=projectStoppedControl(projection,live,manifest.run_id);
    if(controlStatus){state='stopped';health.state='waiting';health.phase='stopped';health.reason='operator_stop_settled';}
    else {
      const control=live.inventory?.control,drain=live.inventory?.drain??live.inventory?.worker?.snapshot?.drain;
      if(projection.control.mode==='pause'&&control?.request_id===projection.control.request_id&&control.requested_mode==='pause'&&drain?.scope_id===manifest.run_id&&drain.generation===control.generation&&drain.physical_settled===true){controlStatus={request_id:control.request_id,generation:control.generation,physical_settled:true};state='paused';health.state='waiting';health.phase='paused';health.reason='operator_pause';}
    }
  }catch{/* Unavailable control observation cannot settle an operator request. */}
  if(journalConflict)state='unconfirmed';
  if (!journalConflict && !terminal(baseState) && !["recovery_blocked","recovery_failed"].includes(baseState) && !projection.cancellation && !projection.control) {
    if (health.state === "owner_lost") state = "recovery_required";
    else if (health.state === "unknown") state = "unconfirmed";
    else if (health.state === "waiting") state = health.reason === "not_started" ? "planned" : health.reason === "waiting_for_user" ? "waiting_for_user" : "paused";
    else if (completedExecutions) state = 'awaiting_provider'; // Final assessment/publication, not resource retirement.
    else state = "running";
  }
  const controlled=Boolean(projection.control||projection.cancellation);
  let previous = events.findLast(event => event.type === "dev.dd.eval.health.reconciled");
  if(controlled)try{previous={data:JSON.parse(await readFile(path.join(root,'health.json'),'utf8'))};}catch(error){if(error.code!=='ENOENT')throw error;}
  // Preserve a previously proven control settlement while its exact journal
  // and manifest remain unchanged; a transient read error is not a new request.
  if (controlled && !controlStatus && previous?.data?.control_status?.physical_settled === true
      && previous.data.basis_sequence === (events.at(-1)?.data.sequence ?? 0)
      && previous.data.manifest_sha256 === hashJson(manifest)) {
    controlStatus = previous.data.control_status; state = previous.data.state;
    health.state = 'waiting'; health.phase = state;
    health.reason = state === 'stopped' ? 'operator_stop_settled' : 'operator_pause';
  }
  const payload = { state:controlled&&!controlStatus?projection.state:state, health, flows:flowHealth, basis_sequence:events.at(-1)?.data.sequence ?? 0, manifest_sha256:hashJson(manifest),...(controlStatus?{control_status:controlStatus}:{}) };
  const stable = item => hashJson({ state:item?.state, health:item?.health && {...item.health,observed_at:null},flows:item?.flows?.map(flow => ({...flow,health:flow.health&&{...flow.health,observed_at:null}})),control_status:item?.control_status });
  const unchanged = previous && stable(previous.data) === stable(payload) && (controlled?previous.data.basis_sequence===payload.basis_sequence:events.slice(events.indexOf(previous)+1).every(event => !progressEvent(event)));
  let changed = false;
  if (apply && !unchanged) {
    if (hashJson(JSON.parse(await readFile(path.join(root,"manifest.json"),"utf8"))) !== payload.manifest_sha256) throw Object.assign(new Error("Manifest changed during observation"), {code:"runner_definition_drift"});
    if(controlled)changed=await withRunnerLock(file,async()=>{
      const current=await readEvents(file);if((current.at(-1)?.data.sequence??0)!==payload.basis_sequence)return false;
      await writeJsonAtomic(path.join(root,'health.json'),{schema_id:'dd-eval/health-certificate@1',run_id:manifest.run_id,...payload});
      await appendFile(path.join(root,'health-audit.jsonl'),JSON.stringify({at:health.observed_at,...payload})+'\n',{mode:0o600});
      await publishObservation(file,current);return true;
    });else {
      const committed = await appendEvent(file, { source:"dd-eval://runner", runId:manifest.run_id, type:"dev.dd.eval.health.reconciled", data:payload, beforeAppend:current => (current.at(-1)?.data.sequence ?? 0) === payload.basis_sequence });
      changed = Boolean(committed);
    }
  }
  const maintenance = await cleanupSidecars(root);
  return {root,run_id:manifest.run_id,previous_state:projection.state,state:payload.state,health,changed,would_change:!unchanged,
    cleanup_maintenance: maintenance.map(item => ({request_id:item.intent.request_id,status:item.status,physical_stopped:item.result?.physical_stopped??null,native_settled:item.result?.native_settled??null,...(item.result?.cleanup_deferral?{cleanup_deferral:item.result.cleanup_deferral}:{})})),
    ...(sequenceRepair?.corrections?{sequence_repair:sequenceRepair}:{})};
}
