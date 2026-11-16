import test from "node:test";
import assert from "node:assert/strict";
import { canonicalLocator, nextRevision } from "../lib/cases/canonical-state.mjs";

test("canonical revisions ignore unrelated names and locators stay relative", () => {
  assert.equal(nextRevision([]), "REV-001");
  assert.equal(nextRevision(["REV-002", "other", "REV-010"]), "REV-011");
  assert.equal(canonicalLocator("/eval", "/eval/canonical/case"), "canonical/case");
});
