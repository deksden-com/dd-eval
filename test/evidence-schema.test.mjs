import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import Ajv2020 from "ajv/dist/2020.js";
import { buildEvidencePacket, buildReport, buildRunCandidate, validateHitlMatch, resolveHitlJudgment, isInfrastructureFailure, failureAttribution, failureDiagnostic, failureEvidenceRevision } from "../lib/runner.mjs";

const schemaRoot = path.resolve(import.meta.dirname, "..", "schemas");
async function validator(file) {
  const schema = JSON.parse(await readFile(path.join(schemaRoot, file), "utf8"));
  return new Ajv2020({ allErrors: true }).compile(schema);
}

test("partial HITL is schema-valid evidence, never a deliverable answer", async () => {
  const validate = await validator("hitl-match.v1.schema.json");
  const fixture = { responses: [{ id: "priority", answer: "canonical" }], sha256: "a".repeat(64) };
  const verdict = { schema_id: "dd-eval/hitl-match@1", status: "unmatched", classification: "fixture_gap", response_ids: ["priority"], covered_questions: ["values"], uncovered_questions: ["independent decision"], rationale: "values covered; independent decision missing" };
  assert.equal(validate(verdict), true, JSON.stringify(validate.errors));
  assert.equal(validateHitlMatch(verdict, fixture), verdict);
  assert.throws(() => resolveHitlJudgment({ fixture, judgment: { verdict }, question: "compound", stage: "specify" }), { code: "interaction_fixture_gap" });
  for (const invalid of [{ ...verdict, covered_questions: [] }, { ...verdict, covered_questions: [""] }, { ...verdict, response_ids: ["priority", "priority"] }, { ...verdict, status: "matched" }]) {
    assert.equal(validate(invalid), false);
    assert.throws(() => validateHitlMatch(invalid, fixture), { code: "judge_result_invalid" });
  }
  assert.throws(() => validateHitlMatch({ ...verdict, uncovered_questions: ["values"] }, fixture), { code: "judge_result_invalid" }, "cross-array disjointness is enforced by runtime");
});

test("owned runtime ambiguity retains attribution through raw, wrapped and diagnostic evidence", () => {
  const issued = { code: "invocation_ambiguous", message: "two exact scoped runtime assignments", details: { lifecycle_assignment: { issuer: "dd-flow", scope: { projectRoot: "/owned/project", daemonId: "daemon", rootSessionId: "root", runId: "RUN", generation: 2 } } } };
  assert.equal(isInfrastructureFailure("invocation_ambiguous"), false);
  assert.equal(isInfrastructureFailure({ code: "invocation_ambiguous", details: { lifecycle_outcome: { disposition: "fatal" } } }), false);
  assert.equal(isInfrastructureFailure({ code: 'invocation_ambiguous', details: { source: { kind: 'dd-flow', path: '/claimed/runtime' } } }), false, 'source-shaped claim is not issued scope');
  assert.equal(isInfrastructureFailure({ ...issued, details: { lifecycle_assignment: { issuer: 'dd-flow', scope: { daemonId: 'claimed' } } } }), false, 'partial claimed scope is not proof');
  assert.equal(isInfrastructureFailure({ ...issued, details: { ...issued.details, native_hook_binding: { schema_id: 'dd-flow/hook-request@1', request_id: 'request', operation_id: 'operation', daemon_id: 'foreign', root_provider_session_id: 'root', tool_call_id: 'tool', turn_generation: 2 } } }), false, 'contradicting native receipt does not bind issuer');
  for (const error of [issued, { code: "wrapper", cause: issued }, failureDiagnostic(issued)]) assert.equal(failureAttribution(error), "evaluation_infrastructure");
  assert.equal(isInfrastructureFailure({ ...issued, run_id: "foreign" }), false);
  assert.equal(isInfrastructureFailure({ code: 'wrapper', run_id: 'foreign', cause: issued }), false, 'wrapped foreign RUN proof cannot acquire attribution');
  const mismatch = { ...issued, code: 'invocation_argument_mismatch', details: { invocation_id: 'issued', lifecycle_assignment: { ...issued.details.lifecycle_assignment, phase: 'issuance' } } };
  assert.equal(failureAttribution(failureDiagnostic(mismatch)), 'evaluation_infrastructure');
  assert.equal(failureAttribution({ ...mismatch, details: { ...mismatch.details, lifecycle_assignment: { ...mismatch.details.lifecycle_assignment, phase: 'model-input' } } }), 'undetermined');
  const result = { ...issued, execution: "e2e", state: "failed", run_id: "RUN" };
  const noProof = { ...result, details: {} };
  assert.notEqual(failureEvidenceRevision(result), failureEvidenceRevision(noProof));
  const report = buildReport({ root: "/eval", manifest: { run_id: "EVAL", executions: [{ id: "e2e" }] }, state: "completed_with_failures", results: [result] });
  assert.equal(report.run_validity, "invalid_infrastructure_flow");
  assert.equal(report.executions[0].failure.diagnostic.details.lifecycle_assignment.issuer, "dd-flow");
});

test("actual Judge error report validates strict quota projection and infrastructure validity", async () => {
  const validate = await validator("report.v2.schema.json");
  const manifest = { run_id: "EVAL-error", executions: [{ id: "e2e" }] };
  const result = { execution: "e2e", state: "failed", code: "native_outcome_observation_failed", error: "observation failed", details: { native_outcome: { status: "completed" } } };
  const report = buildReport({ root: "/owned", manifest, state: "completed_with_failures", executionState: "failed", cleanupState: "settled", results: [result], judgeError: { code: "agy_provider_quota_exhausted", message: "Individual quota reached. Resets in 3h12m12s", details: { observed_at: "2026-10-01T16:18:41.330Z", provider_session_id: "judge" } } });
  assert.equal(validate(report), true, JSON.stringify(validate.errors));
  assert.equal(report.run_validity, "invalid_infrastructure_flow");
  assert.equal(report.judge_provider_limit.reset_estimated, true);
  assert.equal(validate({ ...report, unexpected: true }), false);
});

test("actual candidate, report and Judge evidence producers satisfy their schemas with and without case acceptance", async () => {
  const validators = await Promise.all(["run-candidate.v2.schema.json", "report.v2.schema.json", "evaluator-evidence.v1.schema.json"].map(validator));
  const manifest = { run_id: "EVAL-test", case_id: "sdlc-eval-2026-summer-task-priority", executions: [{ id: "e2e" }], case_acceptance: { checker: "task-priority@1" } };
  const hash = "a".repeat(64);
  const basic = { execution: "e2e", state: "candidate_ready", stage: "merge", run_id: "RUN-test", candidate: { manifest_sha256: hash } };
  for (const enabled of [false, true]) {
    const result = enabled ? { ...basic, case_acceptance: { file: "/checkpoint/acceptance.json", sha256: hash, receipt: { schema_id: "dd-eval/case-acceptance@1", status: "passed", immutable_hash: hash } } } : basic;
    const selected = enabled ? manifest : { ...manifest, case_acceptance: undefined };
    const candidate = await buildRunCandidate({ runId: selected.run_id, manifest: selected, results: [result] });
    const report = buildReport({ root: "/checkpoint", manifest: selected, state: "completed", executionState: "completed", cleanupState: "settled", results: [result], candidate });
    const evidence = buildEvidencePacket({ manifest: selected, results: [result], candidate });
    for (const [index, value] of [candidate, report, evidence].entries()) assert.equal(validators[index](value), true, JSON.stringify(validators[index].errors));
    assert.equal("case_acceptance" in candidate.executions[0], enabled);
    assert.equal("case_acceptance" in report, enabled);
    assert.equal("case_acceptance" in evidence.executions[0], enabled);
  }
});

test("V3 Judge receives exact frozen matrix and source paths without deriving a live home", async () => {
  const hash = "a".repeat(64), snapshot = "/eval/executions/e2e/boundaries/frozen";
  const json = "runtime/projects/PRJ-1/runs/RUN-1/07-merge/verification/final/verification-matrix.json";
  const markdown = json.replace(/\.json$/, ".md");
  const result = { execution: "e2e", state: "candidate_ready", stage: "merge", run_id: "RUN-1", candidate: { manifest: `${snapshot}/snapshot.json`, manifest_sha256: hash },
    case_acceptance: { file: "/eval/acceptance.json", sha256: hash, receipt: { schema_id: "dd-eval/case-acceptance@1", checker: "task-priority@3", status: "passed", immutable_hash: hash, facts: { consumed_sha256: { [json]: hash, [markdown]: hash, "workspace/.memory-bank/protocol/PRT-1-plan/plan.json": hash } } } } };
  const manifest = { run_id: "EVAL-test", executions: [{ id: "e2e" }] };
  const candidate = await buildRunCandidate({ runId: manifest.run_id, manifest, results: [result] });
  const packet = buildEvidencePacket({ manifest, candidate, results: [result] });
  assert.deepEqual(packet.executions[0].verification_matrix_sources.map(source => source.path), [path.join(snapshot, json), path.join(snapshot, markdown), path.join(snapshot, "workspace/.memory-bank/protocol/PRT-1-plan/plan.json")]);
  const check = await validator("evaluator-evidence.v1.schema.json");
  assert.equal(check(packet), true, JSON.stringify(check.errors));
});
