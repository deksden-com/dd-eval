import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import os from "node:os";
import { mkdtemp, mkdir, readFile, writeFile, rm, realpath, symlink, rename } from "node:fs/promises";
import { cleanupBinding, cleanupInventory, maintenanceEnvironment, retireEval, withPriorEvalRetirement } from "../lib/eval-retirement.mjs";
import { requestRunnerContinuation } from "../lib/eval-resume-worker.mjs";
import { appendEvent, hashJson, sha256, writeJsonAtomic } from "../lib/runner-events.mjs";
import { failureDiagnostic, isInfrastructureFailure } from "../lib/runner.mjs";
import { engineArtifactDigest } from "../lib/engine-admission.mjs";
import { recoveryObservationBudget } from "../lib/recovery-observation-budget.mjs";
import { processSnapshot } from "../lib/process-snapshot.mjs";
import { setTimeout as delay } from "node:timers/promises";

async function fixture(t) {
  const temp = await realpath(await mkdtemp(path.join(os.tmpdir(), "eval-retirement090-")));
  t.after(() => rm(temp, { recursive: true, force: true }));
  const root = path.join(temp, "runs", "EVAL-test"), resource = path.join(temp, "resources"), home = path.join(root, "control-runtime"), bin = path.join(temp, "cli.mjs");
  await mkdir(home, { recursive: true }); await mkdir(resource); await writeFile(bin, "// provider-free fixture");
  const manifest = { run_id: "EVAL-test", case_id: "fixture", executions: [{ id: "e2e" }], runtime_resource_home: resource, runtime_control_bin: bin,
    eval_registry_file: path.join(temp, "registry", "homes.json"), profile: { semantic_decisions: { deliberately: "unsupported old config" } } };
  const bytes = JSON.stringify(manifest); await writeFile(path.join(root, "manifest.json"), bytes); await writeFile(path.join(root, "events.jsonl"), "captured journal sentinel\n");
  const binding = await cleanupBinding(root, manifest), intent = { eval_root: root, run_id: manifest.run_id, kind: "cleanup", mode: "reconcile", goal: "local_retirement", request_id: "cleanup-test", manifest_sha256: sha256(bytes),
    target_binding_digest: hashJson(binding), maintenance_home: home, maintenance_bin: bin };
  const process = { id: "PROC-test", kind: "zcode-daemon", metadata_json: JSON.stringify({ budget: { scope_id: manifest.run_id } }) };
  return { root, manifest, intent, process, resource, bin, home, temp };
}

test("scoped retirement retains native uncertainty and captured bytes; cleanup env has no decision credentials", async t => {
  const f = await fixture(t), calls = [];
  const call = async (_bin, args, options) => {
    calls.push(args[2]); assert.equal(options.env.DD_FLOW_RESOURCE_HOME, f.resource);
    assert.equal(options.env.OPENAI_DECISIONS_API_KEY, undefined); assert.equal(options.env.OPENROUTER_API_KEY, undefined);
    return args[2] === "status" ? { scope_id: "EVAL-test", processes: [f.process], provider_turns: [{ turn_id: "unresolved" }] }
      : { scope_id: "EVAL-test", settled: false, physical_stopped: true, nodes: [{ process_id: f.process.id, physical_stopped: true, settled: false }] };
  };
  const result = await retireEval({ evalRoot: f.root, intent: f.intent, call });
  assert.equal(result.physical_stopped, true); assert.equal(result.native_settled, false); assert.equal(result.cleanup_state, "pending");
  assert.deepEqual(calls, ["status", "stop", "status"]);
  assert.equal(await readFile(path.join(f.root, "events.jsonl"), "utf8"), "captured journal sentinel\n");
  assert.deepEqual(maintenanceEnvironment({ OPENROUTER_API_KEY: "secret", OPENAI_DECISIONS_API_KEY: "secret", PATH: "path" }), { PATH: "path" });
});

test("defer is provider-free, immutable/idempotent and cannot weaken accepted stop", async t => {
  const f = await fixture(t); let stops = 0;
  const call = async (_bin, args) => { if (args[2] !== "status") stops++; return { scope_id: "EVAL-test", processes: [f.process], provider_turns: [] }; };
  const input = { evalRoot: f.root, kind: "cleanup", requestId: "defer", deferReason: "Investigate native transcript", cleanupCall: call };
  const first = await requestRunnerContinuation(input);
  assert.equal(first.result.cleanup_deferral.reason, input.deferReason); assert.equal(stops, 0);
  assert.deepEqual((await requestRunnerContinuation(input)).result, first.result);
  await assert.rejects(requestRunnerContinuation({ ...input, deferReason: "different reason" }), { code: "control_request_conflict" });
  const directory = path.join(f.root, "runner-attempts", sha256("stop")); await mkdir(directory, { recursive: true });
  await writeJsonAtomic(path.join(directory, "attempt.json"), { schema_id: "dd-eval/resume-worker@1", intent: { ...f.intent, eval_root: f.root, request_id: "stop" }, status: "observing" });
  assert.equal((await requestRunnerContinuation({ ...input, requestId: "late-defer" })).result.code, "stop_already_in_progress");
});

test("foreign inventory and changed manifest cannot authorize physical stop", async t => {
  const f = await fixture(t);
  await assert.rejects(cleanupInventory(f.root, f.manifest, {}, async () => ({ scope_id: "foreign", processes: [], provider_turns: [] })), { code: "runtime_scope_inventory_invalid" });
  await assert.rejects(retireEval({ evalRoot: f.root, intent: { ...f.intent, manifest_sha256: "0".repeat(64) } }), { code: "runner_definition_drift" });
  await assert.rejects(cleanupInventory(f.root, f.manifest, {}, async () => ({ scope_id: "EVAL-test", processes: [{ ...f.process, metadata_json: '{}' }], provider_turns: [] })), { code: "runtime_scope_inventory_invalid" });
});

test("automatic cleanup rechecks eligibility after a new execution starts", async t => {
  const f = await fixture(t); let stops = 0;
  await writeFile(path.join(f.root, "events.jsonl"), "");
  await appendEvent(path.join(f.root, "events.jsonl"), { source: "dd-eval://runner", runId: f.manifest.run_id,
    executionId: "e2e", type: "dev.dd.eval.operation.started", data: { operation_id: "EVAL-test:e2e:launch" } });
  await assert.rejects(retireEval({ evalRoot: f.root, intent: { ...f.intent, origin: "automatic" }, call: async () => { stops++; } }), { code: "prior_cleanup_pending" });
  assert.equal(stops, 0, "an automatic finalizer never inherits operator stop authority");
});

test("maintenance fallback uses verified payload, never a shim that redirects old resource home", async t => {
  const f = await fixture(t), nextHome = path.join(f.temp, "next-home"), engine = path.join(f.temp, "engine"), adapters = path.join(engine, "dist", "harness-runtime");
  await mkdir(adapters, { recursive: true }); await mkdir(nextHome);
  const payload = path.join(engine, "dist", "cli.js"); await writeFile(payload, "// immutable selected CLI");
  const checksum = await engineArtifactDigest(engine);
  await writeJsonAtomic(path.join(engine, "engine.json"), { integrity_checksum: checksum });
  await symlink(adapters, path.join(nextHome, "harness-runtime"));
  const bound = await cleanupBinding(f.root, f.manifest, { maintenanceHome: nextHome, maintenanceBin: path.join(nextHome, "bin", "dd-flow") });
  assert.equal(bound.maintenance_bin, payload); assert.equal(bound.resource_home, f.resource); assert.equal(bound.engine_sha256, checksum);
  await assert.rejects(cleanupBinding(f.root, f.manifest, { maintenanceHome: nextHome, maintenanceBin: f.bin }), { code: "runtime_contract_incompatible" });
  await writeFile(payload, "changed");
  await assert.rejects(cleanupBinding(f.root, f.manifest, { maintenanceHome: nextHome }), { code: "engine_artifact_mismatch" });
});

test("only new physical-stop proof moves cleanup inactivity window", () => {
  let time = 0; const budget = recoveryObservationBudget(null, () => time);
  time = 1000; budget.observe({ scope_id: "EVAL-test", nodes: [{ process_id: "p", physical_stopped: true }] });
  assert.equal(budget.state().remaining_ms, 120000);
  time = 2000; budget.observe({ scope_id: "EVAL-test", nodes: [{ process_id: "p", physical_stopped: true }], observed_at: "new poll" });
  assert.equal(budget.state().remaining_ms, 119000);
});

test("live controller drain is not superseded by scope fence; failed drain uses exact process control", async t => {
  const f = await fixture(t), self = (await processSnapshot()).find(item => item.pid === process.pid), calls = [];
  const controller = { ...f.process, kind: "run-controller", state: "failed", pid: process.pid, pid_started_at: self.started, lease_token: "fixture-only" };
  let fenced = false;
  const call = async (_bin, args) => {
    calls.push(args.slice(0, 3).join(" "));
    if (args[2] === "status") return { scope_id: "EVAL-test", fence: fenced ? { dispatch_blocked: true } : null, processes: [controller], provider_turns: [] };
    if (args[1] === "process") return { ok: true, process: { ...controller, state: "stopped" } };
    if (args[2] === "control") return { scope_id: "EVAL-test", control: { status: "requested" } };
    return { scope_id: "EVAL-test", settled: false, physical_stopped: true, nodes: [{ process_id: controller.id, settled: false, physical_stopped: true }] };
  };
  assert.equal((await retireEval({ evalRoot: f.root, intent: f.intent, call })).reason, "scope_control_pending");
  assert.deepEqual(calls, ["runtime scope status", "runtime scope control"]);
  calls.length = 0; fenced = true;
  assert.equal((await retireEval({ evalRoot: f.root, intent: f.intent, call })).physical_stopped, true);
  assert.deepEqual(calls, ["runtime scope status", "runtime process stop", "runtime scope stop", "runtime scope status"]);
});

test("prelaunch fence covers changed resource homes, revalidates and blocks unknown physical retirement", async t => {
  const f = await fixture(t), nextResource = path.join(f.temp, "next-resources"); await mkdir(nextResource);
  await writeFile(path.join(f.root, "events.jsonl"), "");
  for (const type of ["started", "failed"]) await appendEvent(path.join(f.root, "events.jsonl"), { source: "dd-eval://runner", runId: "EVAL-test", executionId: "e2e", type: `dev.dd.eval.operation.${type}`, data: { operation_id: "EVAL-test:e2e:launch", error: { code: "fixture_failure" } } });
  await appendEvent(path.join(f.root, "events.jsonl"), { source: "dd-eval://runner", runId: "EVAL-test", type: "dev.dd.eval.completed", data: { state: "completed_with_failures" } });
  let actionCalls = 0, stopCalls = 0;
  const candidate = { root: f.root, manifest: f.manifest };
  const call = async (_bin, args) => args[2] === "status" ? { scope_id: "EVAL-test", processes: [f.process], provider_turns: [] }
    : (stopCalls++, { scope_id: "EVAL-test", settled: false, physical_stopped: false, nodes: [{ process_id: f.process.id, settled: false }] });
  const options = { caseId: "fixture", resourceHome: nextResource };
  await assert.rejects(withPriorEvalRetirement(options, () => actionCalls++, { discover: async () => [candidate], call }), { code: "prior_cleanup_pending" });
  assert.equal(actionCalls, 0); assert.equal(stopCalls, 1);
  let count = 0;
  await assert.rejects(withPriorEvalRetirement(options, () => actionCalls++, { discover: async () => ++count === 1 ? [] : [candidate], call }), { code: "prior_cleanup_pending" });
  assert.equal(actionCalls, 0);
});

test("native settlement alone cannot complete an inline local retirement", async t => {
  const f = await fixture(t);
  const result = await requestRunnerContinuation({ evalRoot: f.root, kind: "cleanup", requestId: "native-only", inlineCleanup: true,
    cleanupCall: async (_bin, args) => args[2] === "status"
      ? { scope_id: "EVAL-test", processes: [f.process], provider_turns: [] }
      : { scope_id: "EVAL-test", settled: true, physical_stopped: false, nodes: [{ process_id: f.process.id, settled: true }] } });
  assert.equal(result.result.cleanup_state, "settled");
  assert.equal(result.result.physical_stopped, false);
  const attempt = JSON.parse(await readFile(path.join(f.root, "runner-attempts", sha256("native-only"), "attempt.json")));
  assert.equal(attempt.status, "settling");
});

test("failed inline cleanup persists spent observation budget and cannot restart it", async t => {
  const f = await fixture(t), requestId = "failed-observation";
  const input = { evalRoot: f.root, kind: "cleanup", requestId, inlineCleanup: true };
  await requestRunnerContinuation({ ...input, inlineCleanup: false, deferSpawn: true });
  const file = path.join(f.root, "runner-attempts", sha256(requestId), "attempt.json");
  const previous = JSON.parse(await readFile(file));
  const result = { physical_stopped: false, native_settled: false, cleanup_state: "pending" };
  const retainedBudget = { ...recoveryObservationBudget(null).state(), observer_started: false };
  await writeJsonAtomic(file, { ...previous, result, recovery_observation: retainedBudget });
  let calls = 0;
  const failure = Object.assign(new Error("fixture observation lost"), { code: "fixture_observation_lost" });
  await assert.rejects(requestRunnerContinuation({ ...input, cleanupCall: async () => { calls++; await delay(10); throw failure; } }), { code: failure.code });
  const saved = JSON.parse(await readFile(file));
  assert.deepEqual(saved.intent, previous.intent); assert.deepEqual(saved.result, result);
  assert.equal(saved.error.code, failure.code); assert.equal(saved.status, "settling");
  assert.ok(saved.recovery_observation.remaining_ms < retainedBudget.remaining_ms);
  assert.equal(saved.recovery_observation.observer_started, false);
  // Exhaustion is policy state, not a 50ms race against a loaded scheduler.
  await writeJsonAtomic(file, { ...saved, recovery_observation: { ...saved.recovery_observation, remaining_ms: 0 } });
  await assert.rejects(requestRunnerContinuation({ ...input, cleanupCall: async () => { calls++; } }), { code: "recovery_observation_budget_exhausted" });
  assert.equal(JSON.parse(await readFile(file)).status, "recovery_blocked");
  assert.equal(calls, 1, "the same request cannot acquire another observation budget");
});

test("failed cleanup receipt publication preserves the original observation cause", async t => {
  const f = await fixture(t), requestId = "failed-publication";
  const input = { evalRoot: f.root, kind: "cleanup", requestId };
  await requestRunnerContinuation({ ...input, deferSpawn: true });
  const file = path.join(f.root, "runner-attempts", sha256(requestId), "attempt.json");
  const cause = Object.assign(new Error("native observation failed"), { code: "fixture_observation_lost" });
  await assert.rejects(requestRunnerContinuation({ ...input, inlineCleanup: true, cleanupCall: async () => {
    await rename(file, `${file}.previous`); await mkdir(file); throw cause;
  } }), error => {
    assert.equal(error, cause);
    const diagnostic = failureDiagnostic(error);
    assert.equal(diagnostic.code, cause.code);
    assert.equal(diagnostic.cleanup_error.code, "EISDIR");
    return true;
  });
});

test("diagnostic retains bounded operational evidence; exact integrity classification needs issued authority", () => {
  const scope = { projectRoot: "/project", daemonId: "daemon", rootSessionId: "root", runId: "RUN-test", generation: 1 };
  const failure = { code: "native_hook_receipt_invalid", run_id: "RUN-test", details: { phase: "admission", effect: "no_effect", recoverable: false,
    disposition: "fatal", expected: "/feature", actual: "/stable", actual_provenance: "native_session_readback", native_pre_cli_refusal: true,
    terminal_persisted: true, lifecycle_assignment: { issuer: "dd-flow", phase: "issuance", scope }, receipt_error: { code: "storage_write_failed", message: "token=SECRET" }, env: { key: "SECRET" } } };
  const diagnostic = failureDiagnostic(failure);
  for (const name of ["phase", "effect", "recoverable", "disposition", "expected", "actual", "actual_provenance", "native_pre_cli_refusal", "terminal_persisted"]) assert.equal(diagnostic.details[name], failure.details[name]);
  assert.equal(diagnostic.details.receipt_error.code, "storage_write_failed"); assert.ok(!JSON.stringify(diagnostic).includes("SECRET"));
  for (const code of ["native_hook_receipt_invalid", "native_hook_identity_conflict", "run_bundle_anchor_invalid", "run_bundle_authority_missing", "run_bundle_authority_invalid", "run_bundle_identity_invalid", "run_bundle_binding_incomplete", "workspace_route_changed", "workspace_route_conflict", "workspace_route_publication_failed", "workspace_route_invalid", "workspace_route_missing"]) {
    assert.equal(isInfrastructureFailure({ ...failure, code }), true, code);
    assert.equal(isInfrastructureFailure(code), false, "model text alone grants no authority");
  }
  assert.equal(isInfrastructureFailure({ ...failure, run_id: "RUN-other", lifecycle: { run_id: "RUN-test" } }), false);
});
