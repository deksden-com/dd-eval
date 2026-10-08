import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, mkdir, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { comparisonMeasurements, runSpecifyComparison } from "../lib/specify-comparison.mjs";
import { hashJson, writeJsonAtomic } from "../lib/runner-events.mjs";
import { profileSemanticHash, resolveExecutionContract } from "../lib/execution-contract.mjs";

const finished = () => ({ state: "finished", cleanup_state: "settled", execution_results: [{ execution: "e2e", experiment_conformance: { state: "matched" }, completion_scope: { target_reached: true, stage_outcome: "done" } }] });
const changed = (contract, mutate) => {
  const value = structuredClone(contract); mutate(value);
  value.semantic_sha256 = hashJson({ profiles: value.profiles, routing: value.routing, roles: value.roles });
  for (const [id, profile] of Object.entries(value.profiles)) value.profile_sha256[id] = profileSemanticHash(profile);
  value.integrity_sha256 = hashJson({ ...value, integrity_sha256: undefined }); return value;
};

async function fixture(t) {
  const root = await mkdtemp(path.join(os.tmpdir(), "comparison-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const profileFiles = [1, 2].map(index => path.join(root, `profile-${index}.json`));
  const profiles = profileFiles.map((_, index) => ({ id: `variant-${index}`, subject: { profile_id: "subject" }, selection: { e2e: true, stop_after: "specify", repetitions: 1 }, semantic_decisions: { enabled: Boolean(index) } }));
  await Promise.all(profileFiles.map((file, index) => writeJsonAtomic(file, profiles[index])));
  await writeJsonAtomic(path.join(root, "agent-profiles/subject.json"), { schema_id: "dd-flow/agent-profile@1", id: "subject", harness: "codex", provider: "openai", model: "old", reasoning: "high", mode: "agent", permission: "allow" });
  const contract = await resolveExecutionContract({ configHome: root, runProfile: profiles[0], loadProfile: id => ({ id, harness: "codex-desktop", model: "new", reasoning: "high", runtime: { codex_cli: "1" }, subagent_capacity: 2 }) });
  const fixtures = { specify: { interaction_fixture_sha256: "fixture-hash" } };
  const contextSha256 = hashJson("same-context");
  const launches = [], polls = [];
  const options = { profileFiles, campaignDir: path.join(root, "campaign"), baseHome: path.join(root, "homes"), pollMs: 1,
    preflight: async () => ({ ok: true, input_checkpoint: { id: "cp", sha256: "hash" }, interaction_fixtures: fixtures, stage_context_sha256: contextSha256, execution_contract: structuredClone(contract) }),
    run: async variant => {
      launches.push(variant.ordinal);
      const run_id = `EVAL-test-${variant.ordinal}`, evalRoot = path.join(variant.home, "runs", run_id);
      await mkdir(evalRoot, { recursive: true });
      await writeJsonAtomic(path.join(evalRoot, "manifest.json"), { run_id, profile: profiles[variant.ordinal], input_checkpoint: { id: "cp", sha256: "hash" }, interaction_fixtures: fixtures, stage_context_sha256: contextSha256, execution_contract: structuredClone(contract) });
      return { accepted: true, pending: true, root: evalRoot, run_id };
    },
    status: async variant => { polls.push(variant.ordinal); return finished(); }, wait: async () => {} };
  return { root, options, launches, polls, contract, fixtures, contextSha256 };
}

test("acknowledgment and terminal without settled cleanup never release next variant", async t => {
  const f = await fixture(t), statuses = [{ state: "awaiting_provider" }, { state: "finished", cleanup_state: "pending" }, finished()];
  f.options.status = async variant => {
    if (variant.ordinal === 0) { assert.deepEqual(f.launches, [0]); return statuses.shift(); }
    return finished();
  };
  const result = await runSpecifyComparison(f.options);
  assert.equal(result.state, "finished"); assert.deepEqual(f.launches, [0, 1]);
  f.options.status = async () => finished();
  await runSpecifyComparison(f.options); assert.deepEqual(f.launches, [0, 1]);
});

test("lost acknowledgment reconciles only one bound manifest without duplicate submission", async t => {
  const f = await fixture(t), original = f.options.run;
  f.options.run = async variant => { await original(variant); throw new Error("ack lost"); };
  await assert.rejects(runSpecifyComparison(f.options), /ack lost/);
  f.options.run = original;
  await runSpecifyComparison(f.options); assert.deepEqual(f.launches, [0, 1]);
});

test("reobserved campaign clears a historical blocker while polling retained IDs", async t => {
  const f = await fixture(t);
  f.options.status = async () => { throw new Error("temporary observation failure"); };
  await assert.rejects(runSpecifyComparison(f.options), /temporary observation failure/);
  f.options.status = async () => {
    const receipt = JSON.parse(await readFile(path.join(f.options.campaignDir, "receipt.json")));
    assert.equal(receipt.state, "running"); assert.equal(receipt.error, undefined);
    return finished();
  };
  await runSpecifyComparison(f.options); assert.deepEqual(f.launches, [0, 1]);
});

test("unknown launch with zero manifests is fail closed on restart", async t => {
  const f = await fixture(t);
  f.options.run = async () => { throw new Error("unknown"); };
  await assert.rejects(runSpecifyComparison(f.options), /unknown/);
  await assert.rejects(runSpecifyComparison(f.options), { code: "comparison_launch_unknown" });
});

for (const status of [{ state: "completed_with_failures", cleanup_state: "settled" }, { state: "awaiting_provider", runner_attempts: [{ last_recorded_status: "running", live_owner: { state: "dead" } }] }, { state: "stopped" },
  { state: "finished", cleanup_state: "blocked" },
  { state: "finished", cleanup_state: "pending", runner_attempts: [{ last_recorded_status: "failed", error: { code: "owner_lost" }, live_owner: { state: "dead" } }] },
  { state: "finished", cleanup_state: "pending", runner_attempts: [{ last_recorded_status: "running", live_owner: { state: "dead" } }] },
  { state: "awaiting_provider", live: { observation_complete: false, inventory: { unavailable: true } }, runner_attempts: [{ last_recorded_status: "running", live_owner: { state: "alive" } }] }]) {
  test(`blocker ${JSON.stringify(status)} stops campaign`, async t => {
    const f = await fixture(t); f.options.status = async () => status;
    f.options.wait = async () => assert.fail("A confirmed blocker must not keep polling");
    await assert.rejects(runSpecifyComparison(f.options), { code: "comparison_blocked" }); assert.deepEqual(f.launches, [0]);
  });
}

test("cancel polling retains active ID without stopping or duplicating EVAL", async t => {
  const f = await fixture(t), controller = new AbortController(); f.options.signal = controller.signal;
  f.options.status = async () => { controller.abort(); return { state: "awaiting_provider" }; };
  await assert.rejects(runSpecifyComparison(f.options)); assert.deepEqual(f.launches, [0]);
  const receipt = JSON.parse(await readFile(path.join(f.options.campaignDir, "receipt.json")));
  assert.equal(receipt.state, "cancelled"); assert.equal(receipt.variants[0].ack.run_id, "EVAL-test-0");
});

test("effective contract mismatch stops before any submission", async t => {
  const f = await fixture(t); f.options.preflight = async variant => ({ ok: true, input_checkpoint: { id: "cp", sha256: "hash" }, interaction_fixtures: f.fixtures, stage_context_sha256: f.contextSha256, execution_contract: changed(f.contract, value => { value.profiles.subject.model = value.declarations.subject.model = `model-${variant.ordinal}`; }) });
  await assert.rejects(runSpecifyComparison(f.options), { code: "comparison_input_mismatch" }); assert.deepEqual(f.launches, []);
});

test("multiple manifests after lost acknowledgment never select newest", async t => {
  const f = await fixture(t), original = f.options.run;
  f.options.run = async variant => { const ack = await original(variant); await mkdir(path.join(path.dirname(ack.root), "EVAL-other")); throw new Error("ack lost"); };
  await assert.rejects(runSpecifyComparison(f.options), /ack lost/);
  await assert.rejects(runSpecifyComparison(f.options), { code: "comparison_launch_unknown" }); assert.deepEqual(f.launches, [0]);
});

test("acknowledgment outside the intended home is rejected", async t => {
  const f = await fixture(t); f.options.run = async () => ({ root: path.join(f.root, "other"), run_id: "EVAL-other" });
  await assert.rejects(runSpecifyComparison(f.options), { code: "comparison_ack_invalid" });
});

test("post-admission profile change cannot dispatch next variant", async t => {
  const f = await fixture(t), original = f.options.run;
  f.options.run = async variant => { const ack = await original(variant); await writeJsonAtomic(path.join(ack.root, "manifest.json"), { run_id: ack.run_id, profile: {} }); return ack; };
  await assert.rejects(runSpecifyComparison(f.options), { code: "comparison_binding_mismatch" }); assert.deepEqual(f.launches, [0]);
  await assert.rejects(runSpecifyComparison(f.options), { code: "comparison_binding_mismatch" }); assert.deepEqual(f.launches, [0]);
});

for (const state of ["unknown", "mismatched"]) test(`finished ${state} conformance is not a valid comparison sample`, async t => {
  const f = await fixture(t);
  f.options.status = async () => { const result = finished(); result.execution_results[0].experiment_conformance.state = state; return result; };
  await assert.rejects(runSpecifyComparison(f.options), { code: "comparison_conformance_invalid" }); assert.deepEqual(f.launches, [0]);
});

test("skipped target is not counted as completed SPECIFY", async t => {
  const f = await fixture(t);
  f.options.status = async () => { const result = finished(); result.execution_results[0].completion_scope.stage_outcome = "skipped"; return result; };
  await assert.rejects(runSpecifyComparison(f.options), { code: "comparison_sample_invalid" }); assert.deepEqual(f.launches, [0]);
});

test("initial requested owner registration race is not a dead-owner blocker", async t => {
  const f = await fixture(t); let calls = 0;
  f.options.status = async () => ++calls === 1 ? { state: "planned", live: { unavailable: true }, runner_attempts: [{ last_recorded_status: "requested", live_owner: { state: "unknown" } }] } : finished();
  await runSpecifyComparison(f.options); assert.deepEqual(f.launches, [0, 1]);
});

test("live preparation may lack a managed RUN before provider dispatch", async t => {
  const f = await fixture(t); let calls = 0;
  f.options.status = async () => ++calls === 1 ? { state: "planned", live: { observation_complete: false, executions: [{ unavailable: true }] },
    runner_attempts: [{ last_recorded_status: "running", live_owner: { state: "alive" } }] } : finished();
  await runSpecifyComparison(f.options); assert.deepEqual(f.launches, [0, 1]);
});

test("active provider with unavailable ownership and empty attempt inventory stops", async t => {
  const f = await fixture(t); f.options.status = async () => ({ state: "awaiting_provider", live: { unavailable: true }, runner_attempts: [] });
  await assert.rejects(runSpecifyComparison(f.options), { code: "comparison_blocked" }); assert.deepEqual(f.launches, [0]);
});

function preparing(ack) {
  const runId = ack.run_id;
  return { state: "awaiting_provider", live: { observation_complete: false,
    executions: [{ unavailable: true, error: { code: "ENOENT", message: `Missing ${path.join(ack.root, "executions/e2e/managed-runtime.json")}` } }],
    inventory: { ok: true, scope_id: runId, provider_turns: [], processes: [
      { kind: "eval-observer", pid: 123, pid_started_at: "Thu Oct  8 12:28:41 2026", owner_id: runId, state: "running", lease_expires_at: new Date(Date.now() + 60000).toISOString() },
      { kind: "eval-baseline", pid: 124, owner_id: runId, state: "running", lease_expires_at: new Date(Date.now() + 60000).toISOString() }
    ] } }, runner_attempts: [{ last_recorded_status: "continuing", owner_pid: 123, owner_started_at: "Thu Oct 8 12:28:41 2026", live_owner: { state: "alive" } }] };
}

test("bound live baseline without a managed RUN continues observation, not duplicate launch", async t => {
  const f = await fixture(t); let calls = 0;
  f.options.status = async variant => ++calls === 1 ? preparing(variant.ack) : finished();
  await runSpecifyComparison(f.options); assert.deepEqual(f.launches, [0, 1]);
});

for (const state of ["stopped", "failed"]) test(`retired ${state} baseline records do not require an active lease`, async t => {
  const f = await fixture(t); let calls = 0;
  f.options.status = async variant => {
    if (++calls !== 1) return finished();
    const s = preparing(variant.ack);
    s.live.inventory.processes.push({ ...s.live.inventory.processes[1], state, lease_expires_at: new Date(0).toISOString() });
    return s;
  };
  await runSpecifyComparison(f.options); assert.deepEqual(f.launches, [0, 1]);
});

for (const [label, corrupt] of [
  ["scope", s => { s.live.inventory.scope_id = "foreign"; }],
  ["owner", s => { s.live.inventory.processes[0].owner_id = "foreign"; }],
  ["pid", s => { s.runner_attempts[0].owner_pid++; }],
  ["birth", s => { s.live.inventory.processes[0].pid_started_at = "replaced"; }],
  ["lease", s => { s.live.inventory.processes[1].lease_expires_at = new Date(0).toISOString(); }],
  ["dead", s => { s.runner_attempts[0].live_owner.state = "dead"; }],
  ["fence", s => { s.live.inventory.fence = { active: true }; }],
  ["dispatch", s => { s.live.inventory.dispatch_blocked = true; }],
  ["turn", s => { s.live.inventory.provider_turns.push({ state: "running" }); }],
  ["native", s => { s.live.inventory.processes[1].kind = "harness-daemon"; }],
  ["orphaned", s => { s.live.inventory.processes[1].state = "orphaned"; }],
  ["error", s => { s.live.executions[0].error.code = "EACCES"; }],
  ["missing unrelated file", s => { s.live.executions[0].error.message = "Missing foreign/managed-runtime.json"; }],
  ["journal", s => { s.live.journal = { unavailable: true }; }],
  ["continuation", s => { s.live.continuations = [{ unavailable: true }]; }],
  ["inventory", s => { s.live.inventory.ok = false; }]
]) test(`baseline observation cannot hide ${label} ownership uncertainty`, async t => {
  const f = await fixture(t);
  f.options.status = async variant => { const s = preparing(variant.ack); corrupt(s); return s; };
  await assert.rejects(runSpecifyComparison(f.options), { code: "comparison_blocked" }); assert.deepEqual(f.launches, [0]);
});

test("RUN publication gap observes bound native controller/provider without replay", async t => {
  const f = await fixture(t); let calls = 0;
  f.options.status = async variant => {
    if (++calls !== 1) return finished();
    const s = preparing(variant.ack);
    s.live.inventory.processes.push({ id: "provider", kind: "codex-provider", owner_id: "DRV-native", state: "running",
      lease_expires_at: new Date(Date.now() + 60000).toISOString(), metadata_json: JSON.stringify({ budget: { scope_id: variant.ack.run_id } }) });
    s.live.inventory.provider_turns.push({ scope_id: variant.ack.run_id, process_id: "provider" });
    return s;
  };
  await runSpecifyComparison(f.options); assert.deepEqual(f.launches, [0, 1]);
});

test("measurement projection uses durable boundaries and separates pause/HTTP", () => {
  const result = finished(); result.execution_results[0].lifecycle = { status: { index: { stage_runs: [{ stage: "specify", status: "done", started_at: "2026-10-08T01:00:00Z", completed_at: "2026-10-08T01:02:00Z", paused_ms: 40000 }] } } };
  result.execution_results[0].hitl = [{ decision_source: "semantic_decision", coverage_filter: { http_latency_ms: 2000, total_ms: 3000, backoff_ms: 0, attempts: [{}] } }];
  const sample = comparisonMeasurements(result)[0]; assert.equal(sample.stages[0].duration_ms, 120000); assert.equal(sample.stages[0].paused_ms, 40000); assert.equal(sample.decisions[0].http_latency_ms, 2000);
});

test("concurrent campaign invocations serialize and retain the same IDs", async t => {
  const f = await fixture(t); let reached, release;
  const entered = new Promise(resolve => { reached = resolve; }), gate = new Promise(resolve => { release = resolve; });
  let first = true;
  f.options.status = async () => { if (first) { first = false; reached(); await gate; } return finished(); };
  const one = runSpecifyComparison(f.options); await entered;
  const two = runSpecifyComparison(f.options); release();
  await Promise.all([one, two]); assert.deepEqual(f.launches, [0, 1]);
});

test("compatibility policy drift after preflight cannot be hidden by unchanged semantic hash", async t => {
  const f = await fixture(t), original = f.options.run;
  f.options.run = async variant => {
    const ack = await original(variant), file = path.join(ack.root, "manifest.json"), manifest = JSON.parse(await readFile(file));
    manifest.execution_contract = changed(manifest.execution_contract, value => { value.declarations.subject.runtime.codex_cli = "changed"; }); await writeJsonAtomic(file, manifest); return ack;
  };
  await assert.rejects(runSpecifyComparison(f.options), { code: "comparison_binding_mismatch" }); assert.deepEqual(f.launches, [0]);
});

test("same semantic settings with different compatibility policy cannot form a matrix", async t => {
  const f = await fixture(t);
  f.options.preflight = async variant => ({ ok: true, input_checkpoint: { id: "cp", sha256: "hash" }, interaction_fixtures: f.fixtures, stage_context_sha256: f.contextSha256, execution_contract: changed(f.contract, value => { value.declarations.subject.subagent_capacity = variant.ordinal + 2; }) });
  await assert.rejects(runSpecifyComparison(f.options), { code: "comparison_input_mismatch" }); assert.deepEqual(f.launches, []);
});

for (const [label, mutate] of [
  ["schema", receipt => { receipt.schema_id = "other"; }],
  ["ordinal", receipt => { receipt.variants[0].ordinal = 8; }],
  ["home", receipt => { receipt.variants[0].home = path.join(receipt.inputs.base_home, "other"); }],
  ["profile", receipt => { receipt.variants[0].profile_file = receipt.variants[1].profile_file; }],
  ["ack", receipt => { receipt.variants[0].ack.root = receipt.variants[1].ack.root; }],
  ["intent", receipt => { delete receipt.variants[0].launch_intent; }]
]) test(`tampered campaign ${label} never redirects observation/submission`, async t => {
  const f = await fixture(t); await runSpecifyComparison(f.options);
  const file = path.join(f.options.campaignDir, "receipt.json"), receipt = JSON.parse(await readFile(file)); mutate(receipt); await writeJsonAtomic(file, receipt);
  await assert.rejects(runSpecifyComparison(f.options), error => ["comparison_receipt_invalid", "comparison_ack_invalid"].includes(error.code));
  assert.deepEqual(f.launches, [0, 1]);
});

test("provenance-only template edits do not invalidate identical admitted semantics", async t => {
  const f = await fixture(t), original = f.options.run;
  f.options.preflight = async variant => ({ ok: true, input_checkpoint: { id: "cp", sha256: "hash" }, interaction_fixtures: f.fixtures, stage_context_sha256: f.contextSha256, execution_contract: changed(f.contract, value => { value.field_sources.subject.template_sha256 = hashJson(`template-source-${variant.ordinal}`); }) });
  f.options.run = async variant => {
    const ack = await original(variant), file = path.join(ack.root, "manifest.json"), manifest = JSON.parse(await readFile(file));
    manifest.execution_contract = changed(manifest.execution_contract, value => { value.field_sources.subject.template_sha256 = hashJson("new provenance; overridden ambient model"); });
    await writeJsonAtomic(file, manifest); return ack;
  };
  await runSpecifyComparison(f.options); assert.deepEqual(f.launches, [0, 1]);
});

test("each individual contract integrity is still checked even if semantics match", async t => {
  const f = await fixture(t), original = f.options.run;
  f.options.run = async variant => {
    const ack = await original(variant), file = path.join(ack.root, "manifest.json"), manifest = JSON.parse(await readFile(file));
    manifest.execution_contract.field_sources.subject.template_sha256 = "unsealed-change"; await writeJsonAtomic(file, manifest); return ack;
  };
  await assert.rejects(runSpecifyComparison(f.options), { code: "execution_contract_invalid" }); assert.deepEqual(f.launches, [0]);
});

test("different canonical fixture/context inputs stop matrix before any launch", async t => {
  const f = await fixture(t);
  f.options.preflight = async variant => ({ ok: true, input_checkpoint: { id: "cp", sha256: "hash" }, interaction_fixtures: f.fixtures,
    stage_context_sha256: hashJson(`context-${variant.ordinal}`), execution_contract: f.contract });
  await assert.rejects(runSpecifyComparison(f.options), { code: "comparison_input_mismatch" }); assert.deepEqual(f.launches, []);
});
