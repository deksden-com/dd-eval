import { hitlCoverageContract, hitlMatchContract } from "./hitl-contract.mjs";
import { reduceEvents } from "./runner-events.mjs";

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
