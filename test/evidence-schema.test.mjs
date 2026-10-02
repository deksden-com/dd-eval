import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import Ajv2020 from "ajv/dist/2020.js";
import { buildEvidencePacket, buildReport, buildRunCandidate } from "../lib/runner.mjs";

const schemaRoot = path.resolve(import.meta.dirname, "..", "schemas");
async function validator(file) {
  const schema = JSON.parse(await readFile(path.join(schemaRoot, file), "utf8"));
  return new Ajv2020({ allErrors: true }).compile(schema);
}

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
