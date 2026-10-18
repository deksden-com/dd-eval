import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import os from "node:os";
import { mkdtemp, mkdir, realpath, rm, symlink, writeFile } from "node:fs/promises";
import { cleanupBinding, retirementProofMatches, withPriorEvalRetirement } from "../lib/eval-retirement.mjs";
import { engineArtifactDigest } from "../lib/engine-admission.mjs";
import { appendEvent, hashJson, sha256, writeJsonAtomic } from "../lib/runner-events.mjs";

for (const fork of [false, true]) test(`a new campaign maintenance home reuses only freshly matched historical proof (shared scope fork: ${fork})`, async t => {
  const temp = await realpath(await mkdtemp(path.join(os.tmpdir(), "retirement-reuse-")));
  t.after(() => rm(temp, { recursive: true, force: true }));
  const root = path.join(temp, "EVAL-old"), oldHome = path.join(root, "control-runtime"), resource = path.join(temp, "resources");
  await mkdir(oldHome, { recursive: true }); await mkdir(resource);
  const oldBin = path.join(oldHome, "cli.mjs"); await writeFile(oldBin, "// old selected CLI");
  const manifest = { run_id: "EVAL-old", case_id: "fixture", executions: [], runtime_resource_home: resource, runtime_control_bin: oldBin };
  await writeJsonAtomic(path.join(root, "manifest.json"), manifest);
  await appendEvent(path.join(root, "events.jsonl"), { source: "dd-eval://runner", runId: manifest.run_id, type: "dev.dd.eval.completed", data: { state: "completed_with_failures" } });
  const binding = await cleanupBinding(root, manifest);
  const inventory = { scope_id: manifest.run_id, dispatch_blocked: true, fence: { scope_id: manifest.run_id }, processes: [], provider_turns: [] };
  const attempt = path.join(root, "runner-attempts", sha256("previous-campaign"), "attempt.json");
  const saved = { schema_id: "dd-eval/resume-worker@1", status: "completed",
    intent: { eval_root: root, kind: "cleanup", mode: "reconcile", manifest_sha256: binding.manifest_sha256, target_binding_digest: hashJson(binding) },
    result: { binding, inventory: { ok: true, ...inventory }, physical_stopped: true, native_settled: false, receipt: { scope_id: manifest.run_id } } };
  await writeJsonAtomic(attempt, saved);
  const matchInput = { root, manifest, manifestSha256: binding.manifest_sha256, resourceHome: resource, inventory };
  assert.equal(retirementProofMatches(saved, matchInput), true, "single-scope envelope and batch member have equal scope contents");
  assert.equal(retirementProofMatches(saved, { ...matchInput, inventory: { ...inventory, ok: false } }), false);
  assert.equal(retirementProofMatches({ ...saved, result: { ...saved.result, inventory: { ...inventory, ok: false } } }, matchInput), false);
  assert.equal(retirementProofMatches(saved, { ...matchInput, inventory: { ...inventory, processes: [{ id: "new-owner" }] } }), false);
  const candidates = [{ root, manifest }];
  if (fork) {
    const forkRoot = path.join(temp, "EVAL-fork");
    await mkdir(path.join(forkRoot, "control-runtime"), { recursive: true });
    await writeJsonAtomic(path.join(forkRoot, "manifest.json"), manifest);
    const forkBinding = await cleanupBinding(forkRoot, manifest);
    await writeJsonAtomic(path.join(forkRoot, "runner-attempts", sha256("fork-proof"), "attempt.json"), {
      schema_id: "dd-eval/resume-worker@1", status: "completed",
      intent: { eval_root: forkRoot, kind: "cleanup", mode: "reconcile", manifest_sha256: forkBinding.manifest_sha256, target_binding_digest: hashJson(forkBinding) },
      result: { binding: forkBinding, inventory: { ok: true, ...inventory }, physical_stopped: true, native_settled: false, receipt: { scope_id: manifest.run_id } }
    });
    candidates.push({ root: forkRoot, manifest });
  }
  const nextHome = path.join(temp, "new-maintenance"), engine = path.join(temp, "selected-engine"), adapters = path.join(engine, "dist/harness-runtime");
  await mkdir(adapters, { recursive: true }); await mkdir(nextHome);
  const bin = path.join(engine, "dist/cli.js"); await writeFile(bin, "// new selected CLI");
  await writeJsonAtomic(path.join(engine, "engine.json"), { integrity_checksum: await engineArtifactDigest(engine) });
  await symlink(adapters, path.join(nextHome, "harness-runtime"));
  let calls = 0, admitted = false;
  await withPriorEvalRetirement({ caseId: "fixture", resourceHome: resource, maintenanceHome: nextHome, maintenanceBin: path.join(nextHome, "bin/dd-flow") }, () => { admitted = true; }, {
    discover: async () => candidates, call: async (selected, args, options) => {
      calls++; assert.equal(selected, bin); assert.equal(options.env.DD_FLOW_RESOURCE_HOME, resource);
      assert.deepEqual(args, ["runtime", "scope", "status", "--scope-ids-json", '["EVAL-old"]']);
      return { scopes: [inventory] };
    }
  });
  assert.equal(admitted, true); assert.equal(calls, 1, "no new stop and no per-scope CLI startup");
});
