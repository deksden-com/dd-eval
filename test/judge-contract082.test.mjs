import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { validateJudgeResult, finalJudgePrompt, failureDiagnostic, isInfrastructureFailure, executionEvidence } from "../lib/runner.mjs";

const assessment = { scopes: { e2e: { outcome: [], flow: [] } } };
const result = { schema_id: "dd-eval/judge-result@2", scope: "e2e", run_validity: "valid", outcome: [], flow: [], findings: [], golden: { covered: [], missed: [], alternatives: [], novel: [] }, conclusion: "unreached stages" };
test("Judge schema enums are shared with prompt and field diagnostics, never coerced", async () => {
  const schema = JSON.parse(await readFile(new URL("../schemas/judge-result.v2.schema.json", import.meta.url)));
  const prompt = finalJudgePrompt({ assessment, scope: "e2e", assessmentFile: "/assessment", candidateFile: "/candidate", evidenceFile: "/evidence" });
  for (const run_validity of schema.properties.run_validity.enum) {
    assert.equal(validateJudgeResult({ ...result, run_validity }, assessment).run_validity, run_validity);
    assert.ok(prompt.includes(run_validity));
  }
  const finding = { id: "finding", severity: "material", summary: "native failed", evidence: [], impact: "unreached" };
  for (const severity of schema.$defs.finding.properties.severity.enum) {
    assert.equal(validateJudgeResult({ ...result, findings: [{ ...finding, severity }] }, assessment).findings[0].severity, severity);
    assert.ok(prompt.includes(severity));
  }
  for (const [value, field, actual] of [[{ ...result, run_validity: "invalid" }, "$.run_validity", '"invalid"'], [{ ...result, run_validity: false }, "$.run_validity", "false"], [{ ...result, findings: [{ ...finding, severity: "major" }] }, "$.findings[0].severity", '"major"']]) {
    assert.throws(() => validateJudgeResult(value, assessment), error => error.code === "judge_result_invalid" && error.details.field === field && error.details.actual === actual && Array.isArray(error.details.allowed));
  }
  const missing = { ...result }; delete missing.run_validity;
  assert.throws(() => validateJudgeResult(missing, assessment), error => error.details.field === "$.run_validity" && error.details.actual === "missing");
  assert.equal(missing.run_validity, undefined);
});

test("native unknown SSE attribution survives bounded projection without becoming overload", () => {
  const provider_error = { code: "model_request_failed", message: "Model request failed", attribution: { source: "provider", reason: "unknown", errorPhase: "stream", exceptionKind: "generic", transport: "sse", retryable: false, headers: { Authorization: "secret" }, body: "secret" } };
  const failure = { code: "child_failed", details: { provider_error } };
  const diagnostic = failureDiagnostic(failure);
  assert.equal(diagnostic.details.provider_error.attribution.retryable, false);
  assert.equal(diagnostic.details.provider_error.attribution.reason, "unknown");
  assert.equal(diagnostic.details.provider_error.attribution.errorPhase, "stream");
  assert.doesNotMatch(JSON.stringify(diagnostic), /secret/);
  assert.equal(isInfrastructureFailure(diagnostic), false);
  delete provider_error.attribution.retryable;
  assert.equal("retryable" in failureDiagnostic(failure).details.provider_error.attribution, false);
  assert.equal(isInfrastructureFailure("hook_event_replay_mismatch"), false);
  const fanout = { execution: "e2e", state: "failed", code: "fanout_child_failed", details: { failures: [{ work_id: "WRK-004", status: "failed", terminal_turn_id: "native-turn", terminal_observed_at: "2026-10-12T21:19:49Z", provider_error }] } };
  const retained = executionEvidence(fanout).failure.diagnostic.details.failures[0];
  assert.equal(retained.work_id, "WRK-004");
  assert.equal(retained.terminal_turn_id, "native-turn");
  assert.equal(retained.provider_error.attribution.reason, "unknown");
  assert.equal(retained.provider_error.attribution.transport, "sse");
  assert.equal("message" in retained.provider_error, false);
  assert.doesNotMatch(JSON.stringify(retained), /secret/);
  assert.equal(executionEvidence(fanout).failure.attribution, "undetermined");
});

test("Judge distinguishes issued canon from rubric omissions, drafts and contradictions", async () => {
  const prompt = finalJudgePrompt({ assessment, scope: "e2e", assessmentFile: "/assessment", candidateFile: "/candidate", evidenceFile: "/evidence" });
  assert.match(prompt, /Frozen canonical answers actually issued to the Subject define accepted task content/);
  assert.match(prompt, /absence from a short rubric is not evidence of invented scope/);
  assert.match(prompt, /unissued fixture, draft or proposal is not accepted scope/);
  assert.match(prompt, /evaluator-definition finding rather than blaming the Subject/);
  const authored = JSON.parse(await readFile(new URL("../cases/sdlc-eval-2026-summer-task-priority/assessment.json", import.meta.url)));
  for (const scope of ["specify", "protocolize", "plan", "code", "e2e"]) {
    assert.match(JSON.stringify(authored.scopes[scope].golden.required_outcomes), /open\/closed/);
  }
  assert.match(JSON.stringify(authored.scopes.code.golden), /forbidden task archiving/);
  assert.match(JSON.stringify(authored.scopes.plan.golden), /archived state stays read-only independently of priority/);
});
