import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { resolveExecutionContract, executionAdmissionHash, executionContextHash, executionFixtureHash, validateExpectedExecutionInputs, assertExpectedExecutionInputs } from "../lib/execution-contract.mjs";
import { executeEval } from "../lib/runner.mjs";
import { hashJson, writeJsonAtomic } from "../lib/runner-events.mjs";

async function setup(t) {
  const root = await mkdtemp(path.join(os.tmpdir(), "comparison-admission-")); t.after(() => rm(root, { recursive: true, force: true }));
  const profile = { subject: { profile_id: "subject" }, selection: { stop_after: "specify" } };
  await writeJsonAtomic(path.join(root, "agent-profiles/subject.json"), { schema_id: "dd-flow/agent-profile@1", id: "subject", harness: "codex", provider: "openai", model: "gpt-5.6-luna", reasoning: "high", mode: "agent", permission: "allow" });
  const contract = await resolveExecutionContract({ configHome: root, runProfile: profile, loadProfile: id => ({ id, harness: "codex-desktop", model: "gpt-6-luna", reasoning: "xhigh", runtime: { codex_cli: "0.161.0" } }) });
  const checkpoint = { id: "cp-test", sha256: "c".repeat(64) };
  const fixtures = { specify: { interaction_fixture_sha256: "d".repeat(64) } };
  const blueprint = { stages: { specify: { objective: "same canonical context" } } }, contextSha256 = executionContextHash(blueprint, ["specify"]);
  const expected = { profile_sha256: hashJson(profile), contract_sha256: contract.semantic_sha256,
    admission_sha256: executionAdmissionHash(contract), checkpoint_sha256: hashJson(checkpoint), fixture_sha256: executionFixtureHash(fixtures, contextSha256) };
  return { root, profile, contract, checkpoint, fixtures, blueprint, contextSha256, expected };
}

test("same-ID model mismatch is resolved before validating expected comparison admission", async t => {
  const f = await setup(t);
  assert.equal(f.contract.profiles.subject.model, "gpt-6-luna");
  assert.doesNotThrow(() => assertExpectedExecutionInputs(f.expected, { profile: f.profile, contract: f.contract, checkpoint: f.checkpoint, fixtures: f.fixtures, contextSha256: f.contextSha256 }));
});

for (const key of ["profile_sha256", "contract_sha256", "admission_sha256", "checkpoint_sha256", "fixture_sha256"]) test(`actual executeEval rejects changed ${key} before manifest/queue/runtime side effects`, async t => {
  const f = await setup(t), output = path.join(f.root, "never-created-eval"), expectedInputs = { ...f.expected, [key]: "a".repeat(64) };
  await assert.rejects(executeEval({ root: output, runId: "EVAL-guard", runProfile: { value: f.profile },
    loaded: { inputCheckpoint: { value: { id: f.checkpoint.id }, sha256: f.checkpoint.sha256 } },
    preparedInputs: { executionContract: f.contract, executions: [{ stage: "specify", terminal_stage: "specify" }], interactionFixtures: f.fixtures, directBlueprint: f.blueprint }, expectedInputs }), { code: "comparison_binding_mismatch" });
  await assert.rejects(readFile(path.join(output, "manifest.json")), { code: "ENOENT" });
  assert.ok(!(await readdir(f.root)).includes("never-created-eval"));
});

test("CLI rejects malformed expected-inputs before preparing a home", async t => {
  const f = await setup(t), home = path.join(f.root, "no-home"), repo = path.resolve(import.meta.dirname, "..");
  const result = spawnSync(process.execPath, [path.join(repo, "bin/dd-eval.mjs"), "runner", "eval", "run", "--profile", "missing-profile.json", "--expected-inputs", "{}"], { cwd: repo, env: { ...process.env, DD_EVAL_HOME: home }, encoding: "utf8" });
  assert.equal(result.status, 1); assert.match(result.stderr, /expected_execution_inputs_invalid/);
  assert.ok(!(await readdir(f.root)).includes("no-home"));
});

test("guard accepts exactly five hashes, not unknown fields or truncated digests", () => {
  assert.throws(() => validateExpectedExecutionInputs({}), { code: "expected_execution_inputs_invalid" });
  assert.throws(() => validateExpectedExecutionInputs({ profile_sha256: "x", contract_sha256: "x", admission_sha256: "x", checkpoint_sha256: "x", fixture_sha256: "x" }), { code: "expected_execution_inputs_invalid" });
});

test("effective SPECIFY context drift fails before queue; unused later context is not a dependency", async t => {
  const f = await setup(t);
  f.blueprint.stages.code = { objective: "later context changed" };
  assert.equal(executionContextHash(f.blueprint, ["specify"]), f.contextSha256);
  f.blueprint.stages.specify.objective = "changed canonical context";
  const output = path.join(f.root, "no-context-drift-run");
  await assert.rejects(executeEval({ root: output, runId: "EVAL-context-guard", runProfile: { value: f.profile },
    loaded: { inputCheckpoint: { value: { id: f.checkpoint.id }, sha256: f.checkpoint.sha256 } },
    preparedInputs: { executionContract: f.contract, executions: [{ stage: "specify", terminal_stage: "specify" }], interactionFixtures: f.fixtures, directBlueprint: f.blueprint }, expectedInputs: f.expected }), { code: "comparison_binding_mismatch" });
  assert.ok(!(await readdir(f.root)).includes("no-context-drift-run"));
});
