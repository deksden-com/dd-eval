import test from "node:test";
import assert from "node:assert/strict";
import { loadProfile, retainedRunProfile } from "../lib/cases/profile-loading.mjs";
import { loadProfile as runnerLoadProfile } from "../lib/runner.mjs";

test("profile loading preserves the runner API and supports profile IDs and paths", async () => {
  assert.equal(runnerLoadProfile, loadProfile);
  const byId = await loadProfile("codex-desktop-gpt-5-6-sol-high-dd-flow-0-8-0-beta-134");
  assert.deepEqual(await loadProfile(byId.file), byId);
});

test("retained run profile uses frozen manifest fields and null defaults", () => {
  assert.deepEqual(retainedRunProfile({ profile: { id: "frozen" } }), {
    value: { id: "frozen" }, coveragePolicy: null, executionContract: null, semanticFingerprint: null,
  });
  const manifest = { profile: {}, hitl_coverage_policy: {}, execution_contract: {}, semantic_dependency_sha256: "hash" };
  assert.deepEqual(retainedRunProfile(manifest), { value: manifest.profile, coveragePolicy: manifest.hitl_coverage_policy,
    executionContract: manifest.execution_contract, semanticFingerprint: "hash" });
});
