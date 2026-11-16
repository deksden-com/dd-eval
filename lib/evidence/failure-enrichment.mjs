import { readRegularFile } from "../regular-file.mjs";
import { appendEvent, readEvents, sha256 } from "../runner-events.mjs";
import { executionState } from "../execution/execution-state.mjs";
import { storedExecutionResults, preparedContextFor, subjectSessionFor } from "../execution/result-projection.mjs";
import { captureRecoveryEvidence } from "../recovery/capture-evidence.mjs";
import { failureEvidenceRevision } from "./report-projections.mjs";
import path from "node:path";
import { stages } from "../entry-pack.mjs";
import { reconcileFlow, collectFlowStatistics } from "../execution/flow-observation.mjs";
import { hitlEvidenceFor, mergeRetainedHitl } from "../hitl/hitl-retained.mjs";
import { errorRecord } from "../operation-errors.mjs";
import { executionSnapshotBinding } from "../recovery/snapshot-observation.mjs";
import { publishSubjectTechnicalNotes } from "../technical-notes.mjs";
import { failureStageAttribution } from "./stage-attribution.mjs";

const fail = (message, code) => { throw Object.assign(new Error(message), { code }); };

/** Enrich a failure from retained RUN, stage, HITL and statistics observations. */
export async function enrichFailureEvidence({ root, manifest, result, events }, observe = { executionSnapshotBinding, reconcileFlow, hitlEvidenceFor, collectFlowStatistics }) {
  const attempt = path.join(root, "executions", result.execution);
  const projectRoot = path.join(attempt, "project"), runtimeRoot = path.join(attempt, "dd-flow-home");
  result.session_id ??= subjectSessionFor(events, result.execution);
  result.boundaries ??= events.filter(event => event.executionid === result.execution && event.type === "dev.dd.eval.stage.boundary_captured").map(event => event.data);
  result.hitl = mergeRetainedHitl(result.hitl ?? [], await observe.hitlEvidenceFor(events, result.execution, manifest.run_id, manifest.execution_contract));
  try {
    const { binding } = await observe.executionSnapshotBinding(root, result.execution, result);
    result.lifecycle = await observe.reconcileFlow({ projectRoot, runtimeRoot, expectedStage: result.stage, runId: binding.run_id,
      onTechnicalNotes: notes => publishSubjectTechnicalNotes(path.join(root, 'events.jsonl'), manifest.run_id, binding.run_id, notes) });
    result.run_id = result.lifecycle.run_id;
    Object.assign(result, failureStageAttribution({ result, events, status: result.lifecycle.status, flowContour: manifest.flow?.contour ?? stages }));
    const prepared = preparedContextFor(events, result.execution, result.stage);
    for (const field of ["runtime_engine", "semantic_package_sha256", "context_slice_sha256", "materialized_context_sha256", "started_at"]) result[field] ??= prepared?.[field] ?? null;
    result.launcher ??= prepared?.launcher_file ?? null;
    result.statistics ??= await observe.collectFlowStatistics({ projectRoot, runtimeRoot, runId: result.run_id });
    delete result.evidence_error;
  } catch (error) { result.evidence_error = errorRecord(error); }
}

/** Persist newly captured failure evidence without changing a different manifest. */
export async function refreshFailureEvidence({ root, manifest, eventsFile, projectedEvents, manifestSha }) {
  const results = storedExecutionResults(projectedEvents, manifest);
  for (const result of results) {
    if (result.state !== "failed" || result.recovery?.recovery_id) continue;
    const before = failureEvidenceRevision(result);
    result.attempt ??= path.join(root, "executions", result.execution);
    await enrichFailureEvidence({ root, manifest, result, events: projectedEvents });
    result.recovery = await captureRecoveryEvidence({ root, manifest, result });
    if (result.recovery?.recovery_id && result.incomplete_evidence?.missing === "Waiting for the managed controller's sealed recovery capture") result.incomplete_evidence = null;
    else if (!result.incomplete_evidence) result.incomplete_evidence = { snapshot: null, missing: "Waiting for the managed controller's sealed recovery capture", failure: result.recovery?.capture_error ?? null };
    if (failureEvidenceRevision(result) === before) continue;
    const execution = manifest.executions.find(item => item.id === result.execution);
    const origin = executionState(projectedEvents, manifest.run_id, execution).operation_id;
    if (sha256(await readRegularFile(path.join(root, "manifest.json"))) !== manifestSha) fail("Cleanup manifest changed before ingestion", "runner_definition_drift");
    await appendEvent(eventsFile, { source: "dd-eval://runner", runId: manifest.run_id, executionId: result.execution, traceId: manifest.run_id, type: "dev.dd.eval.execution.failed", data: { ...result, execution_operation_id: origin } });
  }
  return readEvents(eventsFile);
}
