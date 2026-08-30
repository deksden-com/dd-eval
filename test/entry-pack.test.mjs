import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { appendEvent, canonicalJson, hashJson, readEvents, recordOperation, reduceEvents } from "../lib/runner-events.mjs";
import { materializeStageSlice, semanticContextHash, validateEntry, validateStageBlueprint } from "../lib/entry-pack.mjs";
import { createHarnessPermits } from "../lib/runner.mjs";

const slice = {
  schema_id: "dd-eval/stage-context@1", stage: "specify", objective: "Specify the request.",
  task_input: [{ role: "task", path: "input.md", source: "task.md", sha256: "a".repeat(64) }], sources: [{ role: "index", root: "project", path: "README.md", required: true, reason: "Orientation." }], accepted_decisions: [], dynamic_roles: []
};

test("stage context has path-independent semantic identity and path-bearing materialization", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "dd-eval-entry-"));
  await writeFile(path.join(root, "input.md"), "Task\n"); await writeFile(path.join(root, "README.md"), "Read me\n");
  const blueprint = validateStageBlueprint({ schema_id: "dd-eval/stage-context-blueprint@1", stages: { specify: slice } });
  const materialized = await materializeStageSlice({ blueprint, stage: "specify", roots: { project: root }, output: path.join(root, "runner", "specify.json") });
  const rendered = JSON.parse(await readFile(materialized.path, "utf8"));
  assert.equal(materialized.semantic_package_sha256, semanticContextHash(slice));
  assert.equal(rendered.sources[0].path, path.join(root, "README.md"));
  assert.notEqual(materialized.sha256, materialized.semantic_package_sha256);
});

test("entry validation distinguishes bootstrap from a restored stage and pins an engine snapshot", () => {
  const engine = { schema_id: "dd-eval/engine-snapshot@1", locator: "canonical/case/engine", package_name: "@scope/flow", package_version: "1.0.0", engine_version: "1.0.0", integrity_checksum: "d".repeat(64) };
  const base = { schema_id: "dd-eval/stage-entry@1", case_id: "case", revision: "REV-001", checkpoint_id: "STG-001", stage: "specify", snapshot: { kind: "bootstrap", locator: "canonical/case/bootstrap", manifest_sha256: "a".repeat(64), run_id: null }, engine, semantic_package_sha256: "b".repeat(64), context_slice_sha256: "c".repeat(64) };
  assert.equal(validateEntry(base).stage, "specify");
  assert.throws(() => validateEntry({ ...base, stage: "plan" }), /requires a RUN snapshot/);
  assert.throws(() => validateEntry(({ ...base, engine: undefined })), /engine must be an object/);
});

test("event journal deduplicates productive operations across resume", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "dd-eval-events-")); const file = path.join(root, "events.jsonl"); let calls = 0;
  await recordOperation({ eventsFile: file, source: "dd-eval://test", runId: "EVAL-001", executionId: "focus", traceId: "trace", operationId: "op-1", operation: "driver.prompt", action: async () => ({ calls: ++calls }) });
  const reused = await recordOperation({ eventsFile: file, source: "dd-eval://test", runId: "EVAL-001", executionId: "focus", traceId: "trace", operationId: "op-1", operation: "driver.prompt", action: async () => ({ calls: ++calls }) });
  assert.equal(calls, 1); assert.equal(reused.reused, true);
  assert.equal(reduceEvents(await readEvents(file)).operations["op-1"].terminal, "completed");
  assert.equal(canonicalJson({ b: 1, a: 2 }), '{"a":2,"b":1}\n'); assert.equal(hashJson({ a: 2, b: 1 }), hashJson({ b: 1, a: 2 }));
  await appendEvent(file, { source: "dd-eval://test", runId: "EVAL-001", executionId: "focus", traceId: "trace", type: "dev.dd.eval.state", data: { state: "completed" } });
  assert.equal(reduceEvents(await readEvents(file)).state, "completed");
});

test("normalized journal keeps an execution identity available for recovery", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "dd-eval-execution-id-")); const file = path.join(root, "events.jsonl");
  await appendEvent(file, { source: "dd-eval://test", runId: "EVAL-001", executionId: "focus", traceId: "trace", type: "dev.dd.eval.subject.session_created", data: { session_id: "session-1" } });
  const [event] = await readEvents(file);
  assert.equal(event.executionid, "focus");
  assert.equal(event.data.session_id, "session-1");
});

test("harness permits bound concurrent provider turns without blocking another harness", async () => {
  const permits = createHarnessPermits({ value: { concurrency: { global: 4, per_harness: { codex: 1, zcode: 1 } } } });
  let codexActive = 0; let codexPeak = 0; let zcodeStarted = false;
  const codex = { harness: "codex" }; const zcode = { harness: "zcode" };
  const first = permits.use(codex, async () => { codexActive += 1; codexPeak = Math.max(codexPeak, codexActive); await new Promise((resolve) => setTimeout(resolve, 15)); codexActive -= 1; });
  const second = permits.use(codex, async () => { codexActive += 1; codexPeak = Math.max(codexPeak, codexActive); codexActive -= 1; });
  const other = permits.use(zcode, async () => { zcodeStarted = true; });
  await Promise.all([first, second, other]);
  assert.equal(codexPeak, 1); assert.equal(zcodeStarted, true);
});
