import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import os from "node:os";
import { mkdir, mkdtemp, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { appendEvent, hashJson, recordOperationError, sha256, writeJsonAtomic } from "../lib/runner-events.mjs";
import { cleanupBinding } from "../lib/eval-retirement.mjs";
import { runnerControlResume } from "../lib/runner.mjs";

test("a retired terminal EVAL reuses only its exact historical release without productive authority", async t => {
  const root = await realpath(await mkdtemp(path.join(os.tmpdir(), "control-retirement090-")));
  t.after(() => rm(root, { recursive: true, force: true }));
  const resource = path.join(root, "resources"), cli = path.join(root, "cli.mjs"), statusFile = path.join(root, "status.json"), eventsFile = path.join(root, "events.jsonl");
  await mkdir(resource); await mkdir(path.join(root, "control-runtime"));
  await writeFile(cli, `import fs from 'node:fs';if(process.argv.slice(2,5).join(' ')!=='runtime scope status')throw Error('no mutation');console.log(fs.readFileSync(${JSON.stringify(statusFile)},'utf8'));`);
  const runId = "EVAL-retired", operationId = `${runId}:e2e:launch`, stopId = "auto-cleanup:retired";
  const manifest = { run_id: runId, executions: [{ id: "e2e", mode: "e2e", stage: "specify", terminal_stage: "specify" }], runtime_control_bin: cli, runtime_resource_home: resource };
  const manifestFile = path.join(root, "manifest.json"); await writeJsonAtomic(manifestFile, manifest);
  const requested = await appendEvent(eventsFile, { source: "fixture", runId, type: "dev.dd.eval.control.requested", data: { mode: "pause", request_id: "pause" } });
  const release = { scope_id: runId, request_id: "resume", source_request_id: "pause", generation: 1, capture_key: "a".repeat(64), journal_sha256: "b".repeat(64), current: true };
  await appendEvent(eventsFile, { source: "fixture", runId, type: "dev.dd.eval.control.resume_applied", data: { request_id: "resume", source_request_id: "pause", request_sequence: requested.data.sequence, release } });
  await appendEvent(eventsFile, { source: "fixture", runId, executionId: "e2e", type: "dev.dd.eval.operation.started", data: { operation_id: operationId, operation: "launch", status: "started" } });
  await recordOperationError({ eventsFile, source: "fixture", runId, executionId: "e2e", operationId, operation: "launch", error: Object.assign(new Error("provider failed"), { code: "provider_failed" }) });
  await appendEvent(eventsFile, { source: "fixture", runId, type: "dev.dd.eval.completed", data: { state: "completed_with_failures" } });
  const binding = await cleanupBinding(root, manifest), intent = { eval_root: root, run_id: runId, request_id: stopId, kind: "cleanup", mode: "reconcile", goal: "local_retirement",
    manifest_sha256: sha256(await readFile(manifestFile)), target_binding_digest: hashJson(binding), maintenance_home: binding.maintenance_home, maintenance_bin: binding.maintenance_bin };
  const file = path.join(root, "runner-attempts", sha256(stopId), "attempt.json"), saved = { schema_id: "dd-eval/resume-worker@1", intent, status: "observing" };
  const status = { scope_id: runId, dispatch_blocked: true, control: null, fence: { scope_id: runId, request_id: stopId, dispatch_blocked: true },
    release: { ...release, current: false }, resume: { status: "released", current: false, request_id: "resume", generation: 1, capture_key: release.capture_key } };
  await writeJsonAtomic(file, saved); await writeJsonAtomic(statusFile, status);
  const before = await readFile(eventsFile), input = { evalRoot: root, requestId: "resume", fromRequestId: "pause" };
  const result = await runnerControlResume(input);
  assert.equal(result.historical, true); assert.equal(result.reused, true);
  assert.equal(result.receipt.dispatch_blocked, true); assert.equal(result.receipt.release.current, false); assert.equal(result.pending, false);
  for (const change of [{ manifest_sha256: "f".repeat(64) }, { target_binding_digest: "f".repeat(64) }, { mode: "defer" }]) {
    await writeJsonAtomic(file, { ...saved, intent: { ...intent, ...change } });
    await assert.rejects(runnerControlResume(input), { code: "runtime_scope_release_unproven" });
  }
  await writeJsonAtomic(file, saved); await writeJsonAtomic(statusFile, { ...status, release: { ...status.release, generation: 2 } });
  await assert.rejects(runnerControlResume(input), { code: "runtime_scope_release_unproven" });
  assert.deepEqual(await readFile(eventsFile), before);
  await appendEvent(eventsFile, { source: "fixture", runId, type: "dev.dd.eval.control.requested", data: { mode: "stop", request_id: "new-stop" } });
  await assert.rejects(runnerControlResume(input), { code: "control_request_stale" });
});
