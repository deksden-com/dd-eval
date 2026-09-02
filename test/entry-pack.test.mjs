import assert from "node:assert/strict";
import { chmod, mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { appendEvent, canonicalJson, hashJson, readEvents, recordOperation, reduceEvents } from "../lib/runner-events.mjs";
import { materializeStageSlice, semanticContextHash, validateEntry, validateStageBlueprint, writeEntryPack } from "../lib/entry-pack.mjs";
import { createHarnessPermits, runServerMerge, stageExecutor } from "../lib/runner.mjs";

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

test("entry validation distinguishes bootstrap from a restored stage without requiring an engine", () => {
  const engine = { schema_id: "dd-eval/engine-snapshot@1", locator: "canonical/case/engine", package_name: "@scope/flow", package_version: "1.0.0", engine_version: "1.0.0", integrity_checksum: "d".repeat(64) };
  const base = { schema_id: "dd-eval/stage-entry@1", case_id: "case", revision: "REV-001", checkpoint_id: "STG-001", stage: "specify", snapshot: { kind: "bootstrap", locator: "canonical/case/bootstrap", manifest_sha256: "a".repeat(64), run_id: null }, engine, semantic_package_sha256: "b".repeat(64), context_slice_sha256: "c".repeat(64) };
  assert.equal(validateEntry(base).stage, "specify");
  assert.equal(validateEntry({ ...base, engine: undefined }).stage, "specify");
  assert.throws(() => validateEntry({ ...base, stage: "plan" }), /requires a RUN snapshot/);
  assert.throws(() => validateEntry({ ...base, engine: {} }), /engine-snapshot/);
});

test("entry packs index focused starts but no E2E starter", async () => {
  const entry = { schema_id: "dd-eval/stage-entry@1", case_id: "case", revision: "REV-001", checkpoint_id: "STG-001", stage: "specify", snapshot: { kind: "bootstrap", locator: "canonical/case/bootstrap", manifest_sha256: "a".repeat(64), run_id: null }, semantic_package_sha256: "b".repeat(64), context_slice_sha256: "c".repeat(64) };
  const pack = await writeEntryPack({ caseDir: "/tmp/case", revision: "REV-001", inputCheckpoint: { id: "cp-001", sha256: "d".repeat(64) }, flow: { contour: ["specify"], terminal_stage: "specify" }, stageBlueprint: { schema_id: "dd-eval/stage-context-blueprint@1", stages: { specify: slice } }, entries: { specify: entry }, authoring: {} });
  assert.deepEqual(pack.entries, { specify: "specify.json" });
  assert.equal("e2e_sha256" in pack.hashes, false);
});

test("event journal deduplicates productive operations across resume", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "dd-eval-events-")); const file = path.join(root, "events.jsonl"); let calls = 0;
  await recordOperation({ eventsFile: file, source: "dd-eval://test", runId: "EVAL-001", executionId: "focus", traceId: "trace", operationId: "op-1", operation: "driver.prompt", action: async () => ({ calls: ++calls }) });
  const reused = await recordOperation({ eventsFile: file, source: "dd-eval://test", runId: "EVAL-001", executionId: "focus", traceId: "trace", operationId: "op-1", operation: "driver.prompt", action: async () => ({ calls: ++calls }) });
  assert.equal(calls, 1); assert.equal(reused.reused, true);
  assert.equal(reduceEvents(await readEvents(file)).operations["op-1"].terminal, "completed");
  assert.equal(canonicalJson({ b: 1, a: 2 }), '{"a":2,"b":1}\n'); assert.equal(hashJson({ a: 2, b: 1 }), hashJson({ b: 1, a: 2 }));
  await appendEvent(file, { source: "dd-eval://test", runId: "EVAL-001", executionId: "focus", traceId: "trace", type: "dev.dd.eval.completed", data: { state: "completed" } });
  assert.equal(reduceEvents(await readEvents(file)).state, "completed");
});

test("operation registry returns the original result and folds an exact terminal duplicate", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "dd-eval-events-")); const file = path.join(root, "events.jsonl");
  const first = await recordOperation({ eventsFile: file, source: "dd-eval://test", runId: "EVAL-001", executionId: "focus", traceId: "trace", operationId: "op-1", operation: "driver.prompt", action: async () => ({ answer: 42 }) });
  const duplicate = (await readEvents(file)).at(-1);
  await writeFile(file, `${(await readFile(file, "utf8")).trim()}\n${JSON.stringify({ ...duplicate, id: "EVT-duplicate", data: { ...duplicate.data, sequence: duplicate.data.sequence + 1 } })}\n`);
  const reduced = reduceEvents(await readEvents(file));
  assert.equal(reduced.operations["op-1"].result.answer, 42);
  const reused = await recordOperation({ eventsFile: file, source: "dd-eval://test", runId: "EVAL-001", executionId: "focus", traceId: "trace", operationId: "op-1", operation: "driver.prompt", action: async () => ({ answer: 43 }) });
  assert.deepEqual(first.result, reused.result);
});

test("operation registry rejects a conflicting terminal result", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "dd-eval-events-")); const file = path.join(root, "events.jsonl");
  await recordOperation({ eventsFile: file, source: "dd-eval://test", runId: "EVAL-001", executionId: "focus", traceId: "trace", operationId: "op-1", operation: "driver.prompt", action: async () => ({ answer: 42 }) });
  const duplicate = (await readEvents(file)).at(-1);
  await writeFile(file, `${(await readFile(file, "utf8")).trim()}\n${JSON.stringify({ ...duplicate, id: "EVT-conflict", data: { ...duplicate.data, sequence: duplicate.data.sequence + 1, result: { answer: 43 } } })}\n`);
  await assert.rejects(readEvents(file).then(reduceEvents), /conflicting terminal events/);
});

test("operation registry never replays a terminal failed action", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "dd-eval-events-")); const file = path.join(root, "events.jsonl"); let calls = 0;
  const input = { eventsFile: file, source: "dd-eval://test", runId: "EVAL-001", executionId: "focus", traceId: "trace", operationId: "op-failed", operation: "driver.prompt" };
  await assert.rejects(recordOperation({ ...input, action: async () => { calls += 1; throw new Error("failed once"); } }), /failed once/);
  await assert.rejects(recordOperation({ ...input, action: async () => { calls += 1; return { impossible: true }; } }), /already failed/);
  assert.equal(calls, 1);
});

test("lost observer response stays non-terminal and cannot replay a provider action", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "dd-eval-events-")); const file = path.join(root, "events.jsonl"); let calls = 0;
  const input = { eventsFile: file, source: "dd-eval://test", runId: "EVAL-001", executionId: "focus", traceId: "trace", operationId: "op-lost", operation: "driver.prompt" };
  await assert.rejects(recordOperation({ ...input, action: async () => { calls += 1; throw Object.assign(new Error("RPC response timed out"), { code: "rpc_timeout" }); } }), /timed out/);
  const operation = reduceEvents(await readEvents(file)).operations["op-lost"];
  assert.equal(operation.terminal, null); assert.equal(operation.observation_lost.code, "rpc_timeout");
  await assert.rejects(recordOperation({ ...input, action: async () => { calls += 1; return { impossible: true }; } }), (error) => error.code === "operation_observation_lost");
  assert.equal(calls, 1);
});

test("concurrent callers do not repeat an in-flight operation", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "dd-eval-events-")); const file = path.join(root, "events.jsonl"); let calls = 0;
  const input = { eventsFile: file, source: "dd-eval://test", runId: "EVAL-001", executionId: "focus", traceId: "trace", operationId: "op-concurrent", operation: "driver.prompt" };
  const action = async () => { calls += 1; await new Promise((resolve) => setTimeout(resolve, 20)); return { call: calls }; };
  const first = recordOperation({ ...input, action }); await new Promise((resolve) => setTimeout(resolve, 5));
  await assert.rejects(recordOperation({ ...input, action }), /already in progress/);
  await first; assert.equal(calls, 1);
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

test("server merge is selected only by the persisted run execution mode", () => {
  const server = { status: { index: { execution_profile: { settings: { merge_mode: "server" } } } } };
  assert.equal(stageExecutor("merge", server), "merge_server");
  assert.equal(stageExecutor("code-review", server), "subject");
  assert.equal(stageExecutor("merge", { status: { index: {} } }), "subject");
});

test("runner delegates a server-routed merge to the deterministic merge server", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "dd-eval-merge-server-")); const project = path.join(root, "project"); const runtime = path.join(root, "runtime"); const bin = path.join(root, "fake-dd-flow.mjs");
  await writeFile(bin, `#!/usr/bin/env node
import fs from 'node:fs';
const args = process.argv.slice(2).filter((arg) => arg !== '--json');
const state = process.env.DD_FLOW_HOME + '/server-state';
if (args[0] === 'run' && args[1] === 'status') { const done = fs.existsSync(state); process.stdout.write(JSON.stringify({ index: { execution_profile: { settings: { merge_mode: 'server' } }, stage_runs: [{ stage: 'merge', status: done ? 'done' : 'running' }] } })); }
else if (args[0] === 'merge' && args[1] === 'serve') { fs.writeFileSync(state, 'done'); process.stderr.write(JSON.stringify({ phase: 'dispatch', message: 'started' }) + '\\n'); process.stdout.write(JSON.stringify({ ok: true, handled: 1 })); }
else { process.exitCode = 2; }
`);
  await chmod(bin, 0o755); await mkdir(project); await mkdir(path.join(runtime, "bin"), { recursive: true });
  const shim = path.join(runtime, "bin", "dd-flow"); await writeFile(shim, `#!/bin/sh\nexec ${JSON.stringify(bin)} "$@"\n`); await chmod(shim, 0o755);
  const prior = process.env.DD_FLOW_BIN; process.env.DD_FLOW_BIN = "/bin/false";
  try {
    const progress = []; const result = await runServerMerge({ profile: { id: "codex-test", harness: "codex-desktop", model: "test", reasoning: "high" }, projectRoot: project, runtimeRoot: runtime, runId: "RUN-001", onProgress: (item) => progress.push(item) });
    assert.equal(result.receipt.handled, 1); assert.equal(result.lifecycle.stage_status, "done"); assert.equal(progress[0].phase, "dispatch");
  } finally { if (prior === undefined) delete process.env.DD_FLOW_BIN; else process.env.DD_FLOW_BIN = prior; }
});
