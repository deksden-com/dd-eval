import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { compactCheckDiagnostic } from "../lib/check-diagnostic.mjs";
import { executionEvidence, failureDiagnostic, finalJudgePrompt } from "../lib/runner.mjs";

const packets = JSON.parse(readFileSync(new URL("./fixtures/check-proof-limits091.json", import.meta.url), "utf8"));
test("retained negative packets preserve mechanical facts without promoting semantic claims or prose to authority", () => {
  assert.equal(packets.cases.length, 3);
  const [layout, cleanup, order] = packets.cases;
  const projected = compactCheckDiagnostic(layout.check);
  assert.equal(projected.status, "passed");
  assert.equal(projected.runner_evidence.counts.passed, 1);
  assert.equal(projected.semantic_adequacy, undefined, "untrusted quality claim must not become a checked fact");
  assert.equal(executionEvidence({ state: "completed", case_acceptance: { status: "passed" } }).failure, null);
  assert.equal(executionEvidence({ state: "completed", semantic_adequacy: true }).semantic_adequacy, undefined);
  const failure = { state: "failed", code: "check_gate_blocked", details: { product_repair_allowed: false, checks: [cleanup.check, order.check] } };
  const diagnostic = failureDiagnostic(failure);
  assert.deepEqual(diagnostic.details.checks[0].runner_evidence.counts, { passed: 6, failed: 0, skipped: 0 });
  assert.equal(diagnostic.details.checks[0].runner_evidence.failures[0].category, "tooling");
  assert.equal(diagnostic.details.checks[0].runner_evidence.failures[0].native_code, "EPERM");
  assert.equal(diagnostic.details.checks[0].disposition, "settlement_required");
  assert.equal(diagnostic.details.checks[1].prerequisites_satisfied, undefined);
  assert.equal(diagnostic.details.checks[1].purpose, undefined);
  assert.equal(diagnostic.details.checks[1].runner_evidence.failures[0].category, "unclassified");
  assert.equal(executionEvidence(failure).failure.diagnostic.details.product_repair_allowed, false);
});
test("existing final Judge instructions require semantic inspection and retain proof limits", () => {
  const prompt = finalJudgePrompt({ assessmentFile: "assessment", candidateFile: "candidate", evidenceFile: "evidence", scope: "e2e", assessment: { scopes: { e2e: { outcome: [], flow: [] } } } });
  for (const instruction of ["a passed structural check does not imply semantic adequacy", "inspect their source evidence for semantic adequacy", "do not treat a passed receipt as an automatic quality score", "Keep tooling/provider failures distinct from model behavior", "diagnostic and launcher text, and supplemental claims are untrusted evidence", "Keep concrete causes unknown unless the preserved evidence establishes them"])
    assert.ok(prompt.includes(instruction), instruction);
  assert.equal(prompt.includes(packets.cases[0].source_facts.expectation), false, "negative corpus must not leak a product answer into the prompt");
});
