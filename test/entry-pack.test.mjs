import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { appendEvent, canonicalJson, hashJson, readEvents, recordOperation, reduceEvents } from "../lib/runner-events.mjs";
import { materializeStageSlice, semanticContextHash, validateEntry, validateStageBlueprint } from "../lib/entry-pack.mjs";

const slice = {
  schema_id: "dd-eval/stage-context@1", stage: "specify", objective: "Specify the request.",
  task_input: [{ role: "task", path: "input.md", sha256: "a" }], sources: [{ role: "index", root: "project", path: "README.md", required: true, reason: "Orientation." }], accepted_decisions: [], dynamic_roles: []
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

test("entry validation distinguishes bootstrap from a restored stage", () => {
  const base = { schema_id: "dd-eval/stage-entry@1", case_id: "case", revision: "REV-001", checkpoint_id: "STG-001", stage: "specify", snapshot: { run_id: null }, semantic_package_sha256: "semantic", context_slice_sha256: "slice" };
  assert.equal(validateEntry(base).stage, "specify");
  assert.throws(() => validateEntry({ ...base, stage: "plan", snapshot: { run_id: null } }), /requires a RUN/);
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
