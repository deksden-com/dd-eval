import test from "node:test";
import assert from "node:assert/strict";
import { failureDiagnostic, executionEvidence, isInfrastructureFailure, classifyInterruption } from "../lib/runner.mjs";
import { compactCheckDiagnostic } from "../lib/check-diagnostic.mjs";

test("compact diagnostic retains safe hashed locators without granting repair authority", () => {
  const ref = { relative_path: "diagnostics/failure.json", sha256: "a".repeat(64) };
  const result = compactCheckDiagnostic({ runner_evidence: { failures: [{ category: "tooling", diagnostic_artifact: ref, repair_evidence: { arbitrary: true } }] }, execution_failures: [{ diagnostic_artifact: { ...ref, relative_path: "../escape" } }] });
  assert.deepEqual(result.runner_evidence.failures[0].diagnostic_artifact, ref);
  assert.equal(result.runner_evidence.failures[0].repair_evidence, undefined);
  assert.equal(result.execution_failures[0].diagnostic_artifact, undefined);
  for (const code of ["runner_progress_invalid", "lint_gate_tool_failed", "lint_gate_invalid_output", "lint_gate_unavailable", "protocolize_draft_cleanup_failed", "opencode_auth_rejected", "opencode_configuration_invalid", "opencode_plugin_failed"]) assert.equal(isInfrastructureFailure({ code: "wrapper", cause: { code } }), true, code);
  assert.equal(isInfrastructureFailure("lint_gate_failed"), false, "valid findings do not establish infrastructure provenance");
});

test("compact native and engine failures redact Bearer and credential variants", () => {
  const message = `Authorization: Bearer SECRET Authorization: Basic SECRET api-key = SECRET api_key: SECRET password : SECRET token=SECRET access_token=SECRET client-secret:SECRET secret: SECRET postgres://u:SECRET@host/db {"api_key":"SECRET"}`;
  const result = compactCheckDiagnostic({ runner_evidence: { failures: [{ message }] }, execution_failures: [{ message }] });
  assert.ok(!JSON.stringify(result).includes("SECRET"));
  assert.match(result.execution_failures[0].message, /Authorization/);
  assert.equal(compactCheckDiagnostic({ execution_failures: [{ message: "token".repeat(250000) }] }).execution_failures[0].message.length, 1024);
  assert.equal(compactCheckDiagnostic({ execution_failures: [{ message: "token-".repeat(50000) }] }).execution_failures[0].message.length, 1024);
});

test("aggregate diagnostics locate the child report instead of rebasing native refs incorrectly", () => {
  const report = { relative_path: "steps/format/report.json", sha256: "b".repeat(64) };
  const failure = { category: "unclassified", native_code: "format", message: "original format error", diagnostic_artifact: { relative_path: "native.json", sha256: "a".repeat(64) },
    child_evidence: { step_id: "format", report, binding: { command: "secret" } } };
  const compact = compactCheckDiagnostic({ runner_evidence: { completed: true, failures: [failure] } }).runner_evidence.failures[0];
  assert.deepEqual(compact.child_evidence, { step_id: "format", report });
  assert.equal(compact.diagnostic_artifact, undefined, "native.json is not relative to the aggregate root");
  assert.equal(compact.message, "original format error");
  failure.child_evidence.report = { ...report, relative_path: "../foreign/report.json" };
  const invalid = compactCheckDiagnostic({ execution_failures: [failure] }).execution_failures[0];
  assert.equal(invalid.child_evidence, undefined);
  assert.equal(invalid.diagnostic_artifact, undefined, "invalid child cannot turn a native ref into a root ref");
});

test("CP237 accepted Turn observation loss is tooling failure, never overload or product failure", () => {
  const cause = { code: "operation_observation_lost", details: { native_dispatch_started: true,
    provider_session_id: "thread", turn_id: "turn", native_outcome: "unknown",
    observation_error: { code: "rpc_error", details: { code: -32601, message: "list_turns is not supported yet" } } } };
  for (const error of [cause, { code: "driver_failed", cause }]) {
    assert.equal(isInfrastructureFailure(error), true);
    const classified = classifyInterruption(error);
    assert.equal(classified.category, "execution_failure");
    assert.equal(classified.source, "runner");
    assert.equal(classified.retryable, false);
  }
  assert.equal(isInfrastructureFailure("rpc_error"), false);
  assert.equal(isInfrastructureFailure("product_check_failed"), false);
});

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
