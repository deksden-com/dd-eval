import test from "node:test";
import assert from "node:assert/strict";
import { failureDiagnostic, executionEvidence } from "../lib/runner.mjs";
import { compactCheckDiagnostic } from "../lib/check-diagnostic.mjs";

test("failed check presentation retains cause identity and refs, not raw reports or stacks", () => {
  const check = { id: "WRK-009/RCP-001", declaration_id: "api", receipt_path: "/retained/receipt.json", status: "failed", exit_code: 1,
    runner_evidence_required: { schema_id: "dd-flow/check-runner-evidence@1", path: "report.json" },
    runner_evidence: { completed: true, counts: { passed: 11, failed: 0, skipped: 5 }, failures: [{ category: "unclassified", origin: "candidate", phase: "setup", code: "PostgresError", native_code: "23503", file: "tests/task.test.ts", message: "foreign key failed postgres://user:password@localhost/db token=SECRET", stack: "SECRET STACK", repair_evidence: { secret: "SECRET PROOF" } }] } };
  for (const field of ["checks", "failures"]) {
    const result = { state: "failed", code: "check_gate_blocked", details: { [field]: [check], product_repair_allowed: false } };
    const saved = failureDiagnostic(result).details[field][0];
    assert.deepEqual(saved, compactCheckDiagnostic(check));
    assert.equal(saved.runner_evidence.failures[0].native_code, "23503");
    assert.match(saved.runner_evidence.failures[0].message, /foreign key failed/);
    assert.equal(saved.runner_evidence.counts.failed, 0);
    assert.equal(executionEvidence(result).failure.diagnostic.details.product_repair_allowed, false);
    assert.ok(!JSON.stringify(saved).includes("SECRET"));
  }
  assert.equal(compactCheckDiagnostic({ id: "x".repeat(5000), runner_evidence: { failures: Array(100).fill({ phase: "setup" }) } }).id.length, 512);
  assert.equal(compactCheckDiagnostic({ runner_evidence: { failures: Array(100).fill({ phase: "setup" }) } }).runner_evidence.failures.length, 64);
  const oversized = compactCheckDiagnostic({ runner_evidence: { failures: Array(64).fill({ code: "x".repeat(5000), file: "x".repeat(5000), phase: "setup" }) } });
  assert.ok(Buffer.byteLength(JSON.stringify(oversized)) < 32768);
  assert.equal(oversized.diagnostic_truncated, true);
  const result = { state: "failed", case_acceptance: { receipt: { facts: { failed_checks: [{ id: check.id }], consumed_source: { manifest: "/captured/snapshot.json" }, consumed_sha256: { "runtime/checks/report.json": "a".repeat(64) } } } } };
  assert.deepEqual(executionEvidence(result).check_failure_sources, [{ path: "/captured/runtime/checks/report.json", sha256: "a".repeat(64) }]);
  delete result.case_acceptance.receipt.facts.consumed_source;
  result.case_acceptance.receipt.checkpoint_manifest_sha256 = "b".repeat(64);
  result.candidate = { manifest: "/candidate/snapshot.json", manifest_sha256: "b".repeat(64) };
  assert.deepEqual(executionEvidence(result).check_failure_sources, [{ path: "/candidate/runtime/checks/report.json", sha256: "a".repeat(64) }]);
  result.candidate.manifest_sha256 = "c".repeat(64);
  assert.equal(executionEvidence(result).check_failure_sources, undefined, "unbound capture is not a source grant");
  result.recovery = { manifest: "/recovery/snapshot.json", manifest_sha256: "b".repeat(64) };
  assert.deepEqual(executionEvidence(result).check_failure_sources, [{ path: "/recovery/runtime/checks/report.json", sha256: "a".repeat(64) }]);
  result.recovery.manifest = "relative/snapshot.json";
  assert.equal(executionEvidence(result).check_failure_sources, undefined);
  delete result.candidate; delete result.recovery;
  assert.equal(executionEvidence(result).check_failure_sources, undefined);
  assert.equal(executionEvidence({ state: "failed" }).check_failure_sources, undefined);
});
