import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { finalJudgePrompt, isInfrastructureFailure } from "../lib/runner.mjs";

test("Judge receives shared source-preservation and optionality rules, not corpus answers", async () => {
  const corpus = JSON.parse(await readFile(new URL("./fixtures/intent-preservation092.json", import.meta.url)));
  const prompt = finalJudgePrompt({ assessmentFile: "assessment", candidateFile: "candidate", evidenceFile: "evidence", scope: "e2e", assessment: { scopes: { e2e: { outcome: [], flow: [] } } } });
  for (const rule of ["original issued intake/accepted HITL sources", "API success does not prove a required UI action", "Optional behavior permits both presence and absence", "source completeness gaps separately from an evidenced product omission"]) assert.ok(prompt.includes(rule), rule);
  for (const example of corpus.cases) assert.ok(!prompt.includes(example.accepted_source), "hidden corpus must not become subject scope");
  const [negative, positive] = corpus.cases;
  assert.equal(negative.accepted_source, positive.accepted_source);
  assert.equal(negative.observed.structural_coverage_passed, true);
  assert.equal(negative.expected.severity, "material");
  assert.equal(negative.expected.infrastructure_invalid_due_to_omission, false);
  assert.equal(positive.expected.missing_surface, null);
});
test("accepted source custody gaps are infrastructure, not missing UI quality findings", () => {
  for (const code of ["native_inventory_invalid", "accepted_intent_source_gap", "accepted_intent_source_invalid", "accepted_intent_contract_unsupported", "accepted_intent_review_stale"]) assert.equal(isInfrastructureFailure(code), true);
  assert.equal(isInfrastructureFailure("accepted_intent_review_ack_required"), false);
  assert.equal(isInfrastructureFailure("missing_ui_close_reopen"), false);
});
