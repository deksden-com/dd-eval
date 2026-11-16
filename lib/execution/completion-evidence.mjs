import { createHash } from "node:crypto";
import { acceptedManagedExecution } from "../completion-scope.mjs";
import { errorRecord } from "../operation-errors.mjs";
import { readRegularFile } from "../regular-file.mjs";
import { writeJsonAtomic } from "../runner-events.mjs";
import { recordTechnicalNote } from "../technical-notes.mjs";

const fail = (message, code) => { throw Object.assign(new Error(message), { code }); };

/** Require a terminal stage to have been durably reconciled. */
export function assertTerminalReconciliation(execution, currentStage, record) {
  if (currentStage !== execution.terminal_stage || !(record?.status === "done" || execution.completion_scope?.requested_stop_after && record?.status === "skipped")) fail(`execution ${execution.id} has not durably completed ${execution.terminal_stage}`, "reconcile_not_terminal");
}

/** Validate accepted execution independently of optional snapshot publication. */
export async function managedCompletionEvidence({ execution, observed, lifecycle, runId, operationId, launchOperationId = operationId }) {
  const retained = { execution_operation_id: operationId, execution_launch_operation_id: launchOperationId, run_id: runId, stage: observed.controller?.stage, driver: observed, lifecycle };
  if (!acceptedManagedExecution(retained) || retained.stage !== execution.terminal_stage
    || lifecycle.stage_status === 'skipped' && !execution.completion_scope?.requested_stop_after)
    fail('Managed controller did not accept the requested terminal Stage', 'stage_boundary_incomplete');
  let candidate = observed.boundary?.stage === retained.stage ? observed.boundary : null;
  let failure = { code: 'controller_boundary_missing', message: 'Accepted terminal Stage has no published assessment snapshot' };
  if (candidate) {
    try {
      if (createHash("sha256").update(await readRegularFile(candidate.manifest)).digest("hex") !== candidate.manifest_sha256) fail('Managed boundary manifest changed after publication', 'snapshot_checksum_mismatch');
      return { candidate };
    } catch (error) { failure = errorRecord(error); candidate = null; }
  }
  return { candidate, incomplete_evidence: { snapshot: null, missing: 'Accepted execution has no verified terminal assessment snapshot', failure } };
}

/** Retain inline statistics if the optional companion-file publication fails. */
export async function publishExecutionStatistics(file, statistics, { eventsFile, runId, operationId }) {
  try { await writeJsonAtomic(file, statistics); }
  catch { await recordTechnicalNote(eventsFile, runId, { code: 'statistics_publication_unavailable', message: 'Accepted execution retained; optional statistics companion could not be published', phase: 'observation', source_operation_id: operationId, consequence: 'none' }); }
}
