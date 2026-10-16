import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import os from "node:os";
import { mkdtemp, mkdir, readFile, realpath, rm } from "node:fs/promises";
import { prepareQualificationOwner, finishQualificationOwner } from "../lib/qualification-owner.mjs";
import { readEvents, reduceEvents, sha256, writeJsonAtomic } from "../lib/runner-events.mjs";
import { listHomes } from "../lib/homes.mjs";
import { judgeRuntimeEnvironment, runnerStatus } from "../lib/runner.mjs";

test("qualification has an independent discoverable runtime scope without changing semantic task identity", async t => {
  const home = await realpath(await mkdtemp(path.join(os.tmpdir(), "qualification-owner090-")));
  t.after(() => rm(home, { recursive: true, force: true }));
  const runtimeRoot = path.join(home, "unchanged-semantic-archive", "operation-test", "dd-flow-home");
  const resourceHome = path.join(home, "resources"), registryFile = path.join(home, "registry", "homes.json");
  await mkdir(runtimeRoot, { recursive: true }); await mkdir(resourceHome);
  let admitted = false;
  const owner = await prepareQualificationOwner({ home, caseId: "fixture", runtimeRoot, resourceHome, registryFile,
    engine: { package_version: "fixture" }, perHarness: { "codex-desktop": 2 } }, { retirement: async (options, reserve) => {
      assert.equal(options.caseId, "fixture"); assert.equal(options.maintenanceHome, runtimeRoot);
      const manifest = JSON.parse(await readFile(path.join(options.excludeRoot, "manifest.json")));
      assert.equal(manifest.runtime_control_home, runtimeRoot); assert.equal(manifest.kind, "qualification-owner");
      assert.equal(manifest.runtime_resource_home, resourceHome);
      await reserve(); admitted = true;
    } });
  assert.equal(admitted, true); assert.match(owner.runId, /^QUAL-/);
  assert.equal((await listHomes({ DD_EVAL_REGISTRY_FILE: registryFile })).homes[0].root, home);
  const env = judgeRuntimeEnvironment({ runtimeRoot, daemonState: path.join(runtimeRoot, "daemon"), codexHome: path.join(runtimeRoot, "codex"),
    profile: { harness: "codex-desktop" }, budget: owner.budget, resourceHome });
  const nativeOwner = JSON.parse(env.DD_FLOW_RUNTIME_OWNER);
  assert.equal(nativeOwner.budget.scope_id, owner.runId);
  assert.equal(nativeOwner.dd_flow_home, runtimeRoot);
  assert.equal(nativeOwner.run_id, undefined, "operational scope is not a semantic RUN identity");
  const primary = Object.assign(new Error("provider rejected"), { code: "provider_failed" });
  await finishQualificationOwner(owner, primary, { cleanup: async request => {
    assert.equal(request.evalRoot, owner.root); assert.equal(request.inlineCleanup, true);
    assert.equal(reduceEvents(await readEvents(path.join(owner.root, "events.jsonl"))).state, "failed");
    return { result: { physical_stopped: true, cleanup_state: "pending", native_settled: false } };
  } });
});

test("qualification runtime cleanup uncertainty never turns into clean success", async t => {
  const home = await realpath(await mkdtemp(path.join(os.tmpdir(), "qualification-pending090-")));
  t.after(() => rm(home, { recursive: true, force: true }));
  const owner = await prepareQualificationOwner({ home, caseId: "fixture", runtimeRoot: path.join(home, "runtime"), resourceHome: path.join(home, "resources"),
    registryFile: path.join(home, "homes.json"), engine: {}, perHarness: {} }, { retirement: async (_options, reserve) => reserve() });
  await assert.rejects(finishQualificationOwner(owner, null, { cleanup: async () => ({ result: { physical_stopped: null } }) }), { code: "definition_qualification_cleanup_failed" });
  await assert.rejects(finishQualificationOwner(owner, null, { cleanup: async () => ({ result: { physical_stopped: true, native_settled: false } }) }), { code: "definition_qualification_cleanup_failed" });
});

test("qualification status is read-only and reports retained cleanup independently of missing runtime", async t => {
  const home = await realpath(await mkdtemp(path.join(os.tmpdir(), "qualification-status090-")));
  t.after(() => rm(home, { recursive: true, force: true }));
  const owner = await prepareQualificationOwner({ home, caseId: "fixture", runtimeRoot: path.join(home, "unavailable-runtime"), resourceHome: path.join(home, "resources"),
    registryFile: path.join(home, "homes.json"), engine: {}, perHarness: {} }, { retirement: async (_options, reserve) => reserve() });
  await finishQualificationOwner(owner, null, { cleanup: async () => ({ result: { physical_stopped: true, native_settled: true } }) });
  const requestId = "retained-cleanup", file = path.join(owner.root, "runner-attempts", sha256(requestId), "attempt.json");
  await writeJsonAtomic(file, { schema_id: "dd-eval/resume-worker@1", intent: { kind: "cleanup", eval_root: owner.root, request_id: requestId, mode: "reconcile" },
    status: "completed", updated_at: "2026-10-16T00:00:00Z", result: { physical_stopped: true, native_settled: false, cleanup_state: "pending" } });
  const before = await Promise.all(["events.jsonl", "manifest.json"].map(name => readFile(path.join(owner.root, name))));
  const status = await runnerStatus({ evalRoot: owner.root });
  assert.equal(status.kind, "qualification-owner"); assert.equal(status.state, "completed");
  assert.deepEqual(status.execution_results, []); assert.equal(status.cleanup_state, "pending");
  assert.equal(status.cleanup_observation.native_settled, false);
  assert.equal(status.cleanup_observation.inventory.unavailable, true);
  assert.equal(status.cleanup_maintenance[0].request_id, requestId);
  assert.deepEqual(await Promise.all(["events.jsonl", "manifest.json"].map(name => readFile(path.join(owner.root, name)))), before);
});
