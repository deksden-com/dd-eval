import assert from "node:assert/strict";
import test from "node:test";
import { selectedExecutionEntries, observedCompletionScope, projectRunCompletion, reportSchemaFor, isTerminalRunState, isDisposableRunState } from "../lib/completion-scope.mjs";
import { selectedEntries, selectionNeedsEntryPack, finalJudgeScope, assertFinalJudgeScope, buildReport, buildRunCandidate, assertTerminalReconciliation, assertEvalExecutionDispatch, assertControlResumeSource } from "../lib/runner.mjs";
import { reduceEvents, observationProjection } from "../lib/runner-events.mjs";
import { readFile } from "node:fs/promises";
import Ajv2020 from "ajv/dist/2020.js";

const contour = ["specify", "plan", "code", "merge"];
const profile = (selection = {}) => ({ schema_id: "dd-eval/run-profile@2", case_contour: contour, case_terminal_stage: "merge",
  judge: { enabled: false }, selection: { focused_stages: [], segment: null, e2e: true, repetitions: 1, stop_after: "specify", ...selection } });
const manifest = value => ({ run_id: "EVAL", case_id: "test", profile: value, executions: selectedEntries(value) });
const ready = (execution, stage_outcome = "done") => ({ execution: execution.id, stage: execution.terminal_stage,
  state: "candidate_ready", stage_outcome, candidate: { manifest_sha256: "sealed" }, lifecycle: { stage_status: stage_outcome } });

test("bounded direct selection retains original checkpoint mode and planned scope", () => {
  const value = profile(), executions = selectedExecutionEntries(value, contour);
  assert.equal(selectionNeedsEntryPack(executions), false);
  assert.equal(executions[0].terminal_stage, "specify");
  assert.deepEqual(executions[0].completion_scope, { entry_stage: "specify", requested_stop_after: "specify",
    effective_terminal_stage: "specify", case_entry_stage: "specify", case_terminal_stage: "merge", case_contour: contour, requested_full_case: false });
  assert.equal(selectedExecutionEntries(profile(), ["plan", "specify", "merge"])[0].stage, "plan");
});

test("stop targets shorten ranges, never expand or silently ignore an execution", () => {
  assert.throws(() => selectedEntries(profile({ focused_stages: ["code"] })), { code: "selection_invalid" });
  assert.throws(() => selectedEntries(profile({ e2e: false, segment: { from: "code", to: "merge" } })), { code: "selection_invalid" });
  assert.throws(() => selectedEntries(profile({ stop_after: "plan-review" })), { code: "selection_invalid" });
  const segment = selectedEntries(profile({ e2e: false, segment: { from: "plan", to: "merge" }, stop_after: "code", repetitions: 2 }));
  assert.deepEqual(segment.map(item => [item.id, item.terminal_stage]), [["segment-plan-to-merge-r1", "code"], ["segment-plan-to-merge-r2", "code"]]);
});

test("completed target becomes finished only after cleanup; failure or missing proof cannot finish", () => {
  const retained = manifest(profile()), result = ready(retained.executions[0]);
  assert.equal(projectRunCompletion({ manifest: retained, results: [result] }), "finished");
  assert.equal(projectRunCompletion({ manifest: retained, results: [result], pending: true }), "awaiting_provider");
  assert.equal(projectRunCompletion({ manifest: retained, results: [result], recoveryBlocked: true }), "recovery_blocked");
  assert.equal(projectRunCompletion({ manifest: retained, results: [result, { state: "failed" }] }), "completed_with_failures");
  assert.equal(projectRunCompletion({ manifest: retained, results: [{ state: "cancelled" }] }), "cancelled");
  assert.throws(() => projectRunCompletion({ manifest: retained, results: [{ ...result, candidate: null }] }), { code: "stage_boundary_incomplete" });
  assert.equal(observedCompletionScope(retained.executions[0], result).full_case_completed, false);
});

test("legal skipped target has an explicit outcome, not completed-stage or whole-case success", () => {
  const retained = manifest(profile({ stop_after: "merge" })), execution = retained.executions[0], result = ready(execution, "skipped");
  assert.equal(projectRunCompletion({ manifest: retained, results: [result] }), "finished");
  assert.equal(observedCompletionScope(execution, result).completion_reason, "stop_after_skipped");
  assert.equal(observedCompletionScope(execution, result).full_case_completed, false);
  assert.doesNotThrow(() => assertTerminalReconciliation(execution, "merge", { status: "skipped" }));
  assert.throws(() => assertTerminalReconciliation(execution, "merge", { status: "paused" }), { code: "reconcile_not_terminal" });
  assert.throws(() => assertTerminalReconciliation({ terminal_stage: "merge" }, "merge", { status: "skipped" }), { code: "reconcile_not_terminal" });
  const completed = ready(execution);
  completed.lifecycle.status = { index: { stage_runs: contour.map(stage => ({ stage, status: "done" })) } };
  assert.equal(observedCompletionScope(execution, completed).full_case_completed, true);
  completed.lifecycle.status = { index: { stage_runs: [{ stage: "code", status: "skipped" }] } };
  assert.equal(observedCompletionScope(execution, completed).full_case_completed, false);
});

test("Final Judge scope derives from requested range, including failure and repeated scopes", () => {
  assert.equal(finalJudgeScope(manifest(profile()), [{ stage: "specify" }]), "specify");
  assert.equal(finalJudgeScope(manifest(profile({ stop_after: "merge" })), [{ stage: "specify", state: "failed" }]), "e2e");
  assert.equal(finalJudgeScope(manifest(profile({ repetitions: 2 })), []), "specify");
  const focused = manifest(profile({ e2e: false, focused_stages: ["merge"], stop_after: "merge" }));
  assert.equal(finalJudgeScope(focused, []), "merge");
  assert.throws(() => assertFinalJudgeScope({ profile: { ...profile(), judge: { enabled: true } }, executions: focused.executions, assessment: { scopes: { specify: { outcome: [], flow: [] } } } }), { code: "judge_scope_missing" });
  assert.throws(() => finalJudgeScope({ profile: profile(), executions: [{ terminal_stage: "code" }, { terminal_stage: "merge" }] }), { code: "judge_scope_missing" });
  assert.equal(finalJudgeScope({ profile: { schema_id: "dd-eval/run-profile@1", selection: { e2e: true } } }, []), "e2e");
});

test("report and candidate retain bounded observed scope; historical schemas are unchanged", async () => {
  const retained = manifest(profile()), result = ready(retained.executions[0]);
  result.completion_scope = observedCompletionScope(retained.executions[0], result);
  const report = buildReport({ root: "/owned", manifest: retained, state: "finished", executionState: "completed", cleanupState: "settled", results: [result] });
  assert.equal(report.schema_id, "dd-eval/report@4");
  assert.equal(report.completion_scope[0].completion_reason, "stop_after_reached");
  assert.equal(report.executions[0].completion_scope.target_reached, true);
  const candidate = await buildRunCandidate({ runId: "EVAL", manifest: retained, results: [result] });
  assert.equal(candidate.schema_id, "dd-eval/run-candidate@3");
  assert.equal(candidate.completion_scope[0].full_case_completed, false);
  for (const [file, value] of [["report.v4.schema.json", report], ["run-candidate.v3.schema.json", candidate]]) {
    const validate = new Ajv2020({ allErrors: true }).compile(JSON.parse(await readFile(new URL(`../schemas/${file}`, import.meta.url))));
    assert.equal(validate(value), true, JSON.stringify(validate.errors));
  }
  assert.equal(reportSchemaFor({ profile: { schema_id: "dd-eval/run-profile@1", interaction_judge: { verdict_contract: "dd-eval/hitl-coverage@1" } } }), "dd-eval/report@3");
  assert.equal(reportSchemaFor({ profile: { schema_id: "dd-eval/run-profile@1" } }), "dd-eval/report@2");
  assert.equal(projectRunCompletion({ manifest: manifest(profile({ stop_after: undefined })), results: [result] }), "completed");
});

test("finished is terminal in journal, observation, inventory and productive admission", () => {
  const events = [{ type: "dev.dd.eval.completed", runid: "EVAL", data: { state: "finished", sequence: 1 } }];
  assert.equal(reduceEvents(events).state, "finished");
  assert.equal(observationProjection(events).state, "finished");
  assert.equal(isTerminalRunState("finished"), true);
  assert.equal(isDisposableRunState("finished"), true);
  assert.equal(isDisposableRunState("completed_with_failures"), false);
  assert.throws(() => assertEvalExecutionDispatch(events, "EVAL", { id: "e2e" }, "EVAL:e2e:launch"), { code: "execution_terminal" });
  assert.throws(() => assertControlResumeSource(events, "EVAL", "resume", "stop"), { code: "execution_terminal" });
});
