import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { canonicalBuild, evalRun, fixturesValidate, loadCaseV6, loadRunProfile } from "../lib/runner.mjs";

const caseId = "sdlc-eval-2026-summer-task-priority";
const root = path.resolve(import.meta.dirname, "..");
const buildProfile = path.join(root, "cases", caseId, "run-profiles", "build-entry-pack-reference-terra-high.json");
const qualificationProfile = path.join(root, "cases", caseId, "run-profiles", "qualify-entry-pack-terra-high.json");

test("active case uses one portable entry-pack contract and no Session starter state", async () => {
  const loaded = await loadCaseV6(caseId);
  assert.equal(loaded.value.schema_id, "dd-eval/case@6");
  assert.equal(loaded.value.status, "authoring");
  assert.equal("starter_sessions" in loaded.value, false);
  assert.equal("canonical_checkpoints" in loaded.value, false);
  assert.equal("priming" in loaded.value, false);
  assert.deepEqual(loaded.value.flow.contour, ["specify", "protocolize", "plan", "plan-review", "code", "code-review"]);
});

test("entry-pack validates every declared focused boundary and E2E entry", async () => {
  const fixtures = await fixturesValidate({ caseId, revision: "REV-001" });
  assert.deepEqual(Object.keys(fixtures.entries), ["e2e", "specify", "protocolize", "plan", "plan-review", "code", "code-review"]);
  assert.equal(fixtures.revision, "REV-001");
});

test("run profiles are explicit experiments rather than harness defaults", async () => {
  const reference = await loadRunProfile(buildProfile); const qualification = await loadRunProfile(qualificationProfile);
  assert.equal(reference.value.modes.e2e, true);
  assert.deepEqual(reference.value.modes.focused, []);
  assert.equal(qualification.value.modes.focused.length, 6);
  assert.equal(reference.value.subject.profile_id, qualification.value.subject.profile_id);
});

test("authoring case refuses a scored run before any provider Session is created", async () => {
  const home = await mkdtemp(path.join(tmpdir(), "dd-eval-runner-")); const prior = process.env.DD_EVAL_HOME; process.env.DD_EVAL_HOME = home;
  try {
    await assert.rejects(evalRun({ profileFile: qualificationProfile }), /case is not ready/);
  } finally {
    if (prior === undefined) delete process.env.DD_EVAL_HOME; else process.env.DD_EVAL_HOME = prior;
    await rm(home, { recursive: true, force: true });
  }
});

test("canonical build allocates a journalled pending revision without touching a provider", async () => {
  const home = await mkdtemp(path.join(tmpdir(), "dd-eval-canonical-")); const prior = process.env.DD_EVAL_HOME; process.env.DD_EVAL_HOME = home;
  try {
    const build = await canonicalBuild({ profileFile: buildProfile });
    assert.equal(build.status, "planned");
    assert.equal(build.revision, "REV-001");
    assert.match(build.build, /canonical\/sdlc-eval-2026-summer-task-priority\/REV-001$/);
  } finally {
    if (prior === undefined) delete process.env.DD_EVAL_HOME; else process.env.DD_EVAL_HOME = prior;
    await rm(home, { recursive: true, force: true });
  }
});
