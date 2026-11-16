import path from "node:path";
import { stages } from "../entry-pack.mjs";
import { reconcileFlow, collectFlowStatistics } from "../execution/flow-observation.mjs";
import { preparedContextFor, subjectSessionFor } from "../execution/result-projection.mjs";
import { hitlEvidenceFor, mergeRetainedHitl } from "../hitl/hitl-retained.mjs";
import { errorRecord } from "../operation-errors.mjs";
import { executionSnapshotBinding } from "../recovery/snapshot-observation.mjs";
import { publishSubjectTechnicalNotes } from "../technical-notes.mjs";
import { failureStageAttribution } from "./stage-attribution.mjs";

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
