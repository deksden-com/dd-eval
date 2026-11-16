import path from "node:path";
import { cleanupInventory, cleanupSidecars } from "../eval-retirement.mjs";
import { runnerControlStatus } from "../execution/control-status.mjs";
import { storedExecutionResults } from "../execution/result-projection.mjs";
import { hitlEvidenceFor, mergeRetainedHitl } from "../hitl/hitl-retained.mjs";
import { readJson } from "../json-file.mjs";
import { errorRecord } from "../operation-errors.mjs";
import { cleanupObservation, hasRetainedRetirementProof, observeScopeResources, resolveRetiredTechnicalNotes, statusCleanupState, projectStoppedControl } from "../recovery/cleanup-observation.mjs";
import { evalRunnerAttemptsStatus } from "../recovery/eval-worker-status.mjs";
import { readEvents, reduceEvents } from "../runner-events.mjs";
import { technicalNotes, projectSubjectTechnicalNotes } from "../technical-notes.mjs";
import { attachModelAttribution } from "./execution-conformance.mjs";
import { failureDiagnostic } from "./failure-diagnostic.mjs";
import { interactionCoverageSummary } from "./report-projections.mjs";

/** Observe retained execution, assessment and cleanup without mutating the journal. */
export async function runnerStatus({ evalRoot }) {
  const root = path.resolve(evalRoot), events = await readEvents(path.join(root, "events.jsonl")), manifest = await readJson(path.join(root, "manifest.json"));
  const projection = reduceEvents(events);
  if (manifest.kind === "qualification-owner") {
    const maintenance = await cleanupSidecars(root);
    let inventory;
    try { inventory = (await cleanupInventory(root, manifest)).inventory; }
    catch (error) { inventory = { unavailable: true, error: errorRecord(error) }; }
    const retained = maintenance.filter(item => item.intent.mode !== "defer" && item.result)
      .sort((left, right) => (Date.parse(left.updated_at) || 0) - (Date.parse(right.updated_at) || 0)).at(-1)?.result;
    return { root, ...projection, kind: manifest.kind, manifest, execution_results: [], technical_notes: technicalNotes(events),
      cleanup_state: retained?.cleanup_state ?? "pending",
      cleanup_observation: { physical_stopped: retained?.physical_stopped ?? null, native_settled: retained?.native_settled ?? null, inventory },
      cleanup_maintenance: maintenance.map(item => ({ request_id: item.intent.request_id, mode: item.intent.mode ?? "reconcile", status: item.status, result: item.result ?? null })),
      runner_attempts: await evalRunnerAttemptsStatus(root) };
  }
  let live;
  try { live = await runnerControlStatus({ evalRoot: root }); } catch (error) { live = { unavailable: true, error: errorRecord(error) }; }
  const controlStatus = projectStoppedControl(projection, live, manifest.run_id);
  // Observation enrichment must not mutate the retained event result/revision.
  const results = structuredClone(storedExecutionResults(events, manifest)).map(result => controlStatus ? { ...result, execution_state: result.state, state: "stopped", control_status: controlStatus } : result);
  const hitlReadbackErrors = [];
  if (manifest.profile?.interaction_judge || events.some(event => event.type === "dev.dd.eval.hitl.matched")) {
    for (const result of results) {
      try {
        const retained = await hitlEvidenceFor(events, result.execution, manifest.run_id, manifest.execution_contract);
        result.hitl = mergeRetainedHitl(result.hitl ?? [], retained);
      } catch (error) {
        // Status is observation, not permission to reuse an unverified answer.
        result.hitl_observation = { unavailable: true, error: errorRecord(error) };
        hitlReadbackErrors.push({ execution: result.execution, ...result.hitl_observation });
      }
    }
  }
  const interactions = interactionCoverageSummary(manifest, results);
  if (interactions && hitlReadbackErrors.length) {
    interactions.resolution = "unknown";
    interactions.verification = { complete: false, errors: hitlReadbackErrors };
  }
  const report = await readJson(path.join(root, "reports", "report.json")).catch(error => {
    if (error.code === "ENOENT") return null;
    return { unavailable: true };
  });
  const maintenance = await cleanupSidecars(root);
  const retiredScope = await hasRetainedRetirementProof({ root, manifest, live, maintenance });
  const physical = path.isAbsolute(manifest.runtime_control_bin ?? '') ? await observeScopeResources(root, live?.inventory, manifest.run_id) : null;
  const bindingUnconfirmed = (live?.executions ?? []).some(item => {
    if (item.unavailable || item.receipt?.scope?.run_id !== item.run_id) return true;
    const recovery = results.find(result => result.execution === item.execution)?.recovery, control = item.receipt.control;
    return recovery?.control_id && (control?.current !== true || control.control_id !== recovery.control_id || control.recovery_id !== recovery.recovery_id || control.generation !== recovery.generation);
  });
  const physicalProof = physical ? { ...physical, retiredScope: retiredScope && !bindingUnconfirmed,
    pending: bindingUnconfirmed || physical.pending && !retiredScope } : undefined;
  const notes = resolveRetiredTechnicalNotes(projectSubjectTechnicalNotes(events, manifest.run_id, live?.executions ?? []), live?.inventory, manifest.run_id, physicalProof);
  let cleanupState = statusCleanupState({ report, events, manifest, results });
  if (physicalProof) cleanupState = physicalProof.pending ? 'pending' : 'settled';
  else if (path.isAbsolute(manifest.runtime_control_bin ?? '') || notes.some(note => note.state === 'open' && note.consequence === 'cleanup_pending')) cleanupState = 'pending';
  const cleanup = await cleanupObservation({ root, manifest, results, live, report, reportState: cleanupState, maintenance, retiredScope: physicalProof?.retiredScope ?? false });
  return { root, ...projection, technical_notes: notes, assessment_state: report?.assessment_state ?? (report?.judge_status === 'completed' ? 'completed' : report?.judge_status === 'not_requested' ? 'not_requested' : report?.judge_status === 'in_progress' ? 'pending' : 'unavailable'), cleanup_state: cleanupState, cleanup_observation: cleanup, cleanup_maintenance: maintenance.map(item => ({ request_id: item.intent.request_id, mode: item.intent.mode ?? "reconcile", status: item.status,
    physical_stopped: item.result?.physical_stopped ?? null, native_settled: item.result?.native_settled ?? null, capture: item.result?.capture ?? "unknown", cleanup_state: item.result?.cleanup_state ?? "pending",
    ...(item.result?.cleanup_deferral ? { cleanup_deferral: item.result.cleanup_deferral } : {}), ...(item.error ? { error: failureDiagnostic(item.error) } : {}) })), ...(controlStatus ? { state: "stopped", control_status: controlStatus } : {}), ...(interactions ? { interaction_resolution: interactions.resolution, interaction_coverage: interactions } : {}), manifest, live, runner_attempts: await evalRunnerAttemptsStatus(root), observation: { last_event_at: events.at(-1)?.time ?? null, last_sequence: events.at(-1)?.data.sequence ?? null, pending_operations: Object.entries(projection.operations).filter(([, operation]) => operation.started && !operation.terminal).map(([id]) => id) }, execution_results: await attachModelAttribution(root, manifest, results) };
}
