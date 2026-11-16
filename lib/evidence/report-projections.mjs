import { hitlCoverageContract, hitlMatchContract } from "../hitl-contract.mjs";
import path from "node:path";
import { hashJson, reduceEvents } from "../runner-events.mjs";
import { subjectHistoryEvents } from "./run-candidate.mjs";
import { classifyInterruption, executionRunId, isInfrastructureFailure } from "./failure-classification.mjs";
import { failureDiagnostic } from "./failure-diagnostic.mjs";
import { providerLimitMetadata } from "../operation-errors.mjs";
import { modelAttribution } from "./model-observations.mjs";
import { usesGeneratedVerificationMatrix } from "../case-acceptance.mjs";
import { observedCompletionScope, reportSchemaFor } from "../completion-scope.mjs";
import { technicalNotes } from "../technical-notes.mjs";

const fail = (message, code = "validation") => { const error = new Error(message); error.code = code; throw error; };

/**
 * Project retained execution events into per-execution recovery histories.
 * @param {object[]} events Retained EVAL events.
 * @param {object} manifest EVAL manifest and execution inventory.
 * @param {object[]} results Retained execution results.
 * @returns {object[]} Histories with explicit coverage and reliability.
 */
export function recoveryHistory(events, manifest, results) {
  const operations = reduceEvents(events).operations;
  return manifest.executions.map(({ id }) => {
    const launchId = `${manifest.run_id}:${id}:launch`;
    const segments = Object.values(operations).filter(operation => operation.id === launchId || operation.id.startsWith(`${launchId}:recover:`)).map(operation => {
      const receipts = events.filter(event => event.data?.operation_id === operation.id);
      const start = receipts.find(event => event.type === "dev.dd.eval.operation.started");
      const end = receipts.find(event => ["dev.dd.eval.operation.completed", "dev.dd.eval.operation.failed", "dev.dd.eval.operation.cancelled"].includes(event.type));
      const duration = start && end ? Date.parse(end.time) - Date.parse(start.time) : NaN;
      return {
        operation_id: operation.id, recovery_id: operation.id === launchId ? null : operation.id.slice(`${launchId}:recover:`.length).replace(/:retry:\d+$/, ""),
        outcome: operation.terminal ?? "unknown", started_at: start?.time ?? null, finished_at: end?.time ?? null,
        wall_clock_ms: Number.isFinite(duration) && duration >= 0 ? duration : null,
        observation_lost: Boolean(operation.observation_lost), receipt_ids: receipts.map(event => event.id)
      };
    });
    const interruptions = new Map();
    for (const event of events.filter(event => event.executionid === id && event.type === "dev.dd.eval.execution.failed")) {
      // Capture adds evidence to the same failed segment; it is not another failure.
      const segment = event.data.execution_operation_id ?? (event.data.recovery_parent_id ? `${launchId}:recover:${event.data.recovery_parent_id}` : launchId);
      const prior = interruptions.get(segment);
      interruptions.set(segment, { operation_id: segment, observed_at: prior?.observed_at ?? event.time, code: prior?.code ?? event.data.code ?? "execution_failed", recovery_id: event.data.recovery?.recovery_id ?? prior?.recovery_id ?? null, receipt_ids: [...(prior?.receipt_ids ?? []), event.id] });
    }
    const latest = results.find(result => result.execution === id);
    const resumed = segments.some(segment => segment.recovery_id !== null) || Boolean(latest?.recovery?.resumed_at);
    const interrupted = interruptions.size > 0 || segments.some(segment => segment.outcome === "failed" || segment.observation_lost) || latest?.state === "failed";
    return {
      execution: id, reliability: latest?.state === "failed" ? "interrupted" : resumed || interrupted ? latest?.state === "candidate_ready" ? "recovered" : "interrupted" : segments.some(segment => segment.operation_id === launchId && segment.started_at) ? "uninterrupted" : "unknown",
      history_coverage: segments.some(segment => segment.operation_id === launchId && segment.started_at) ? "retained_launch_prefix" : "incomplete",
      recovery_count: segments.filter(segment => segment.recovery_id !== null).length,
      interruptions: [...interruptions.values()], segments,
      usage_accounting: { policy: "latest_run_measurement_only", collected_at: latest?.statistics?.collected_at ?? null, usage: latest?.statistics?.usage ?? null, note: "RUN measurements already cover physical session segments; do not sum successive snapshots or add parent-inclusive native counters." },
      timing: { active_ms: null, provider_wait_ms: null, coverage: "segment_wall_clock_only" }
    };
  });
}

/** Pure retained-result projection shared by JSON, Markdown and status. Unknown
 * HTTP/native usage stays null and is never added to Subject counters. */
export function interactionCoverageSummary(manifest, results) {
  const grounded = item => [hitlCoverageContract, hitlMatchContract, "dd-eval/hitl-match@2"].includes(item.verdict?.schema_id);
  const unresolved = result => ["hitl_coverage_unresolved", "unmatched_hitl", "interaction_fixture_gap", "interaction_judge_ambiguous"].includes(result.code);
  if (manifest.profile?.interaction_judge?.verdict_contract !== hitlCoverageContract
    && !results.some(result => result.hitl?.some(grounded) || result.hitl_observation?.unavailable || unresolved(result))) return null;
  const requestedMode = manifest.profile?.semantic_decisions?.enabled ? "semantic_decision" : manifest.hitl_coverage_policy?.mode ?? "disabled";
  const decisions = results.flatMap(result => (result.hitl ?? []).filter(grounded).map(item => {
    const filter = item.coverage_filter;
    return { execution: result.execution, stage: item.stage ?? null, pause_id: item.pause_id ?? null, scope_id: item.scope_id ?? null, round: item.round ?? null,
      verdict_contract: item.verdict.schema_id, status: item.verdict.status, uncovered_questions: item.verdict.uncovered_questions ?? [],
      requested_mode: filter?.requested_mode ?? requestedMode, decision_source: item.decision_source ?? (item.judge_session_id ? "interaction_judge" : null),
      fallback_reason: filter?.reason ?? null, receipt_file: item.receipt_file ?? null,
      http: { state: filter?.state ?? null, observation_file: filter?.observation_file ?? null,
        latency_ms: filter?.latency_ms ?? null, usage: filter?.usage ?? null,
        ...(requestedMode === "semantic_decision" ? { provider: filter?.provider ?? null, model: filter?.model ?? null,
          min_confidence: filter?.min_confidence ?? null, confidence: filter?.confidence ?? null,
          backoff_ms: filter?.backoff_ms ?? null, total_ms: filter?.total_ms ?? null,
          scheduled_backoff_ms: filter?.scheduled_backoff_ms ?? null, attempts: filter?.attempts ?? [] } : {}) },
      native: ["jev", "semantic_decision"].includes(item.decision_source) ? null : { session_id: item.judge_session_id ?? null, usage: null } };
  }));
  const resolution = results.some(result => result.hitl_observation?.unavailable || unresolved(result) && !result.hitl?.some(grounded)) ? "unknown"
    : results.some(unresolved)
      || decisions.some(item => !["covered", "matched"].includes(item.status)) ? "unresolved"
    : decisions.some(item => ["covered", "matched"].includes(item.status)) ? "resolved" : "not_requested";
  return { resolution, requested_mode: requestedMode, decisions };
}

/** Render an already-built report without changing its assessment. */
export function reportMarkdown(report) {
  const coverage = report.observability?.interactions;
  const interactions = coverage ? `\n## Interaction coverage\n\n- Resolution: ${coverage.resolution}\n- Requested mode: ${coverage.requested_mode}\n\n${coverage.decisions.map(item => `- ${item.execution}/${item.stage}: ${item.status}; source ${item.decision_source ?? "unknown"}; filter ${item.fallback_reason ?? "unknown"}; receipt ${item.receipt_file ?? "unknown"}${item.uncovered_questions.map(question => `\n  - Remaining question: ${JSON.stringify(question)}`).join("")}`).join("\n")}\n\nUnresolved coverage alone does not establish Subject, fixture or tooling blame.\n` : "";
  const models = (report.observability?.models ?? []).map(item => `- ${item.execution}: requested ${item.requested_profile?.model ?? "unknown"}; observed ${item.models?.join(", ") || "unknown"}; transitions ${item.transitions?.length ?? 0}; ${item.observation_completeness ?? "unknown"}; experiment conformance ${item.experiment_conformance?.state ?? "unknown"}`).join("\n");
  const validity = report.judge?.result?.run_validity ?? report.judge?.run_validity;
  const disagreement = (validity && validity !== report.run_validity ? `\nTechnical validity (${report.run_validity}) and Judge validity (${validity}) disagree; neither assessment overwrites the other.\n` : "")
    + ((report.technical_notes ?? []).length ? `\n## Technical notes\n\n${report.technical_notes.map(note => `- ${note.state}: ${note.code} — ${note.message}`).join('\n')}\n` : '');
  const requestedJudge = Object.hasOwn(report, 'judge_requested_profile') ? report.judge_requested_profile ?? 'not_requested' : 'unknown';
  return `# Eval ${report.run_id}\n\n- State: ${report.state}\n- Technical execution: ${report.execution_state}\n- Cleanup: ${report.cleanup_state}\n- Run validity: ${report.run_validity}\n- Case acceptance: ${report.case_acceptance?.status ?? "not_requested"}\n- Final Judge outcome: ${report.judge_status}\n- Final Judge requested profile: ${requestedJudge}\n- Final Judge executed profile: ${report.judge?.profile_id ?? "not_run"}\n\nTechnical completion does not imply case acceptance or semantic quality.\n${disagreement}${interactions}\n${models}\n`;
}

/**
 * Project one retained result into Judge/report evidence.
 * @param {object} result Retained execution result.
 * @returns {object} Evidence with unavailable observations kept unknown.
 */
export function executionEvidence(result) {
  const diagnostic = failureDiagnostic(result);
  const acceptance = result.case_acceptance?.receipt;
  const failureCapture = acceptance?.facts?.consumed_source?.manifest
    ?? (acceptance?.checkpoint_manifest_sha256 && acceptance.checkpoint_manifest_sha256 === result.candidate?.manifest_sha256 ? result.candidate.manifest : null)
    ?? (acceptance?.checkpoint_manifest_sha256 && acceptance.checkpoint_manifest_sha256 === result.recovery?.manifest_sha256 ? result.recovery.manifest : null);
  const interruption = classifyInterruption(result);
  if (diagnostic && interruption.evidence_reason) diagnostic.details.reason ??= interruption.evidence_reason;
  const started = typeof result.started_at === "string" ? Date.parse(result.started_at) : Number.NaN;
  const finished = typeof result.finished_at === "string" ? Date.parse(result.finished_at) : Number.NaN;
  return {
    execution: result.execution,
    state: result.state,
    failure: result.state === "failed" ? { code: diagnostic?.code ?? "execution_failed", message: diagnostic?.message ?? null,
      category: interruption.category,
      attribution: failureAttribution(result), provider_limit: providerLimitMetadata(result), diagnostic } : null,
    stage: result.stage ?? null,
    ...(result.last_completed_stage !== undefined ? { last_completed_stage: result.last_completed_stage, pending_stage_entry: result.pending_stage_entry ?? null } : {}),
    run_id: executionRunId(result),
    subject_session_id: result.session_id ?? null,
    stage_boundaries: result.boundaries ?? [],
    lifecycle: result.lifecycle ?? null,
    candidate: result.candidate ?? null,
    ...(result.completion_scope ? { completion_scope: result.completion_scope } : {}),
    ...(result.case_acceptance ? { case_acceptance: result.case_acceptance } : {}),
    ...(acceptance?.facts?.failed_checks?.length && typeof failureCapture === "string" && path.isAbsolute(failureCapture) ? {
      check_failure_sources: Object.entries(result.case_acceptance.receipt.facts.consumed_sha256 ?? {}).map(([relative, sha256]) => ({
        path: path.resolve(path.dirname(failureCapture), relative), sha256
      }))
    } : {}),
    ...(usesGeneratedVerificationMatrix(result.case_acceptance?.receipt) ? {
      verification_matrix_sources: Object.entries(result.case_acceptance.receipt.facts?.consumed_sha256 ?? {}).map(([relative, sha256]) => ({
        path: path.resolve(path.dirname(result.case_acceptance.receipt.facts?.consumed_source?.manifest ?? result.candidate?.manifest ?? result.recovery.manifest), relative), sha256
      }))
    } : {}),
    incomplete_evidence: result.incomplete_evidence ?? null,
    recovery: result.recovery ?? null,
    usage: result.statistics?.usage ?? null,
    observation: result.statistics?.observation ?? null,
    requested_profile: result.requested_profile ?? null,
    experiment_conformance: result.experiment_conformance ?? { state: "unknown" },
    model_attribution: result.model_attribution ?? result.statistics?.observation?.model_attribution ?? modelAttribution([]),
    sessions: result.statistics?.sessions ?? null,
    tool_evidence: result.tool_evidence ?? result.driver?.evidence?.tool_calls ?? null,
    // Retained verification supplies packet_file only after checking packet/receipt anchors.
    hitl: (result.hitl ?? []).map(item => ({ ...item })),
    timing: { started_at: result.started_at ?? null, finished_at: result.finished_at ?? null, wall_clock_ms: Number.isFinite(started) && Number.isFinite(finished) ? Math.max(0, finished - started) : null },
    context_diagnostics: {
      observation_coverage: result.tool_evidence?.status ?? (result.driver?.evidence?.tool_calls ? "partial" : "unavailable"),
      declared_package_sha256: result.semantic_package_sha256 ?? null,
      materialized_context_sha256: result.materialized_context_sha256 ?? null,
      note: "Tool events are evidence for a Judge or analyst; the runner does not infer a context miss from an extra read alone."
    },
    artifacts: { attempt: result.attempt ?? null, evidence_journals: result.evidence_journals ?? [] }
  };
}

/** Attribute proven infrastructure failures; leave other causes undetermined. */
export function failureAttribution(code) {
  if (isInfrastructureFailure(code)) return "evaluation_infrastructure";
  // An outcome alone does not establish whether the subject caused it.
  return "undetermined";
}

/**
 * Build Judge evidence from a frozen candidate and its retained subject history.
 * @param {object} input Manifest, execution results, candidate and retained events.
 * @returns {object} Evidence packet; throws when frozen history differs.
 */
export function buildEvidencePacket({ manifest, results, candidate, events = [] }) {
  const historyEvents = subjectHistoryEvents(events, manifest);
  if (candidate.subject_history_sha256 && candidate.subject_history_sha256 !== hashJson(historyEvents)) fail("Judge history differs from the frozen candidate", "judge_evidence_mismatch");
  return {
    schema_id: "dd-eval/evaluator-evidence@2",
    run_id: manifest.run_id,
    definition: manifest.definition ?? null,
    candidate_sha256: candidate.immutable_hash,
    subject_history: { sha256: hashJson(historyEvents), event_ids: historyEvents.map(event => event.id), executions: recoveryHistory(historyEvents, manifest, results) },
    executions: results.map(executionEvidence)
  };
}




/**
 * Project retained results, cleanup and Judge state into the public EVAL report.
 * @param {object} input Report context, retained results and optional assessment.
 * @returns {object} Report projection without performing cleanup or invoking a Judge.
 */
export function buildReport({ root, manifest, state, executionState = "running", cleanupState = "pending", results, candidate = null, judge = null, judgeStatus = "not_requested", judgeError = null, judgeCleanup = null, events = [] }) {
  const executions = results.map(executionEvidence);
  const history = recoveryHistory(events, manifest, results);
  const runValidity = results.some((result) => result.state === "failed" && isInfrastructureFailure(result)
    || manifest.execution_contract && result.experiment_conformance?.state === "mismatched") ? "invalid_infrastructure_flow" : "valid";
  const coverage = manifest.profile?.interaction_judge?.verdict_contract === hitlCoverageContract;
  const interactions = interactionCoverageSummary(manifest, results);
  return {
    schema_id: reportSchemaFor(manifest), run_id: manifest.run_id, case_id: manifest.case_id, state, execution_state: executionState, cleanup_state: cleanupState, run_validity: runValidity,
    technical_notes: technicalNotes(events),
    assessment_state: judgeStatus === 'completed' ? 'completed' : judgeStatus === 'not_requested' ? 'not_requested'
      : judgeStatus === 'in_progress' || judgeStatus === 'not_run_incomplete_evidence' && results.some(result => result.recovery?.capture_error?.code === 'recovery_capture_pending' && result.recovery?.finalization?.owner === 'live') ? 'pending' : 'unavailable',
    ...(manifest.profile?.schema_id === "dd-eval/run-profile@2" ? { completion_scope: results.map(result => ({ execution: result.execution, ...observedCompletionScope(manifest.executions.find(item => item.id === result.execution), result) })), semantic_decisions: manifest.profile.semantic_decisions ?? null } : {}),
    ...(coverage ? { interaction_resolution: interactions.resolution, hitl_coverage_policy: manifest.hitl_coverage_policy ?? null } : {}),
    ...(manifest.case_acceptance ? { case_acceptance: { status: executions.every(item => item.case_acceptance?.receipt?.status === "passed") ? "passed" : executions.some(item => item.case_acceptance?.receipt?.status === "failed") ? "failed" : executions.every(item => item.case_acceptance?.receipt?.status === "not_applicable") ? "not_applicable" : "unavailable", executions: executions.map(item => ({ execution: item.execution, status: item.case_acceptance?.receipt?.status ?? "unavailable", receipt_file: item.case_acceptance?.file ?? null })) } } : {}),
    reliability: history.some(item => item.reliability === "interrupted") ? "interrupted" : history.some(item => item.reliability === "unknown") ? "unknown" : history.some(item => item.reliability === "recovered") ? "recovered" : "uninterrupted",
    recovery_count: history.reduce((total, item) => total + item.recovery_count, 0),
    execution_history: history,
    recoveries: results.filter(result => result.recovery).map(result => ({ execution: result.execution, ...result.recovery })),
    manifest: path.join(root, "manifest.json"),
    ...(manifest.execution_contract ? { execution_contract: manifest.execution_contract } : {}),
    executions,
    observability: {
      ...(interactions ? { interactions } : {}),
      sessions: executions.map(({ execution, subject_session_id, sessions }) => ({ execution, subject_session_id, reported_sessions: sessions })),
      usage: executions.map(({ execution, usage }) => ({ execution, usage })),
      models: executions.map(({ execution, requested_profile, model_attribution, experiment_conformance }) => ({ execution, requested_profile, experiment_conformance, ...model_attribution })),
      tools: executions.map(({ execution, tool_evidence }) => ({ execution, tool_evidence })),
      timing: executions.map(({ execution, timing }) => ({ execution, ...timing })),
      context_diagnostics: executions.map(({ execution, context_diagnostics }) => ({ execution, ...context_diagnostics }))
    },
    judge_status: judgeStatus, judge_requested_profile: manifest.profile?.judge?.enabled ? manifest.profile.judge.profile_id ?? null : null,
    ...(judgeCleanup ? { judge_cleanup: judgeCleanup } : {}), ...(judgeError ? { judge_error: failureDiagnostic(judgeError), judge_provider_limit: providerLimitMetadata(judgeError) } : {}), ...(candidate ? { candidate } : {}), ...(judge ? { judge } : {})
  };
}

/**
 * Hash durable failure evidence, excluding volatile controller polling.
 * @param {object} result Retained execution result and its recovery evidence.
 * @returns {string} Revision used to avoid duplicate durable failure events.
 */
export function failureEvidenceRevision(result) {
  const diagnostic = failureDiagnostic(result);
  return hashJson({
    execution: result.execution ?? null,
    state: result.state ?? null,
    code: diagnostic?.code ?? null,
    error: diagnostic?.message ?? null,
    retryable: result.retryable ?? null,
    provider_limit: providerLimitMetadata(result),
    diagnostic,
    stage: result.stage ?? null,
    run_id: result.run_id ?? null,
    session_id: result.session_id ?? null,
    boundaries: result.boundaries ?? [],
    hitl: (result.hitl ?? []).map(item => ({ stage: item.stage ?? null, round: item.round ?? null, pause_id: item.pause_id ?? null, answer_sha256: item.answer_sha256 ?? null, ...([hitlMatchContract, hitlCoverageContract, "dd-eval/hitl-match@2"].includes(item.verdict_contract) ? { verdict_contract: item.verdict_contract, receipt_sha256: item.receipt_sha256, packet_sha256: item.packet_sha256 } : {}), ...(item.decision_source ? { decision_source: item.decision_source } : {}) })),
    launcher: result.launcher ?? null,
    context: {
      runtime_engine: result.runtime_engine ?? null,
      semantic_package_sha256: result.semantic_package_sha256 ?? null,
      context_slice_sha256: result.context_slice_sha256 ?? null,
      materialized_context_sha256: result.materialized_context_sha256 ?? null,
    },
    evidence_error: result.evidence_error ? { code: result.evidence_error.code, message: result.evidence_error.message } : null,
    recovery: result.recovery?.recovery_id
      ? { recovery_id: result.recovery.recovery_id, control_id: result.recovery.control_id ?? null, generation: result.recovery.generation ?? null, manifest_sha256: result.recovery.manifest_sha256 ?? null, finalization: result.recovery.finalization ?? null }
      : { capture_error: result.recovery?.capture_error ? { code: result.recovery.capture_error.code, message: result.recovery.capture_error.message } : null, finalization: result.recovery?.finalization ?? null },
  });
}
