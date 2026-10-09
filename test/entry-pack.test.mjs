import assert from "node:assert/strict";
import { access, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { appendEvent, canonicalJson, hashJson, readEvents, readJsonLines, recordOperation, reduceEvents } from "../lib/runner-events.mjs";
import { materializeStageSlice, semanticContextHash, validateEntry, validateFlowContour, validateStageBlueprint, validateStageContext, writeEntryPack } from "../lib/entry-pack.mjs";
import { createHarnessPermits, needsAttemptContext, selectedEntries, validateEntryPack, validateCaseBlueprint, materializeCaseStageSlice } from "../lib/runner.mjs";

test("recovery materializes each reopened stage attempt once", () => {
  assert.equal(needsAttemptContext({ attempt: "try-001" }, {}), false);
  assert.equal(needsAttemptContext({ attempt: "try-002" }, { attempt: "try-001" }), true);
  assert.equal(needsAttemptContext({ attempt: "try-002" }, { attempt: "try-002" }), false);
  assert.equal(needsAttemptContext({ attempt: "try-003" }, { attempt: "try-002" }), true);
});

const slice = {
  schema_id: "dd-eval/stage-context@1", stage: "specify", objective: "Specify the request.",
  task_input: [{ role: "task", path: "input.md", source: "task.md", sha256: "a".repeat(64) }], sources: [{ role: "index", root: "project", path: "README.md", required: true, reason: "Orientation." }], accepted_decisions: [], dynamic_roles: []
};
const memoryContour = ["preflight", "discover", "compose", "verify", "review", "finish"];

test("runner blueprint validation uses the case catalog and keeps SDLC fixture defaults", () => {
  const blueprint = { schema_id: "dd-eval/stage-context-blueprint@1", stages: { preflight: { ...slice, stage: "preflight" } } };
  const loaded = { value: { flow: { contour: memoryContour } } };
  assert.equal(validateCaseBlueprint(blueprint, loaded), blueprint);
  assert.throws(() => validateCaseBlueprint(blueprint, {}), /unsupported stages/);
  assert.throws(() => validateCaseBlueprint({ ...blueprint, stages: { merge: { ...slice, stage: "merge" } } }, loaded), /unsupported stages/);
  assert.equal(validateCaseBlueprint({ ...blueprint, stages: { specify: slice } }, {}).stages.specify.stage, "specify");
});

test("entry-pack validation binds the complete ordered case contour and terminal", () => {
  const flow = { contour: memoryContour, terminal_stage: "finish" };
  const pack = { schema_id: "dd-eval/entry-pack@1", case_id: "fixture", revision: "REV-001", stage_context: "stage-context.json", flow,
    entries: Object.fromEntries(memoryContour.map(stage => [stage, `${stage}.json`])) };
  assert.equal(validateEntryPack(pack, "fixture", flow), pack);
  assert.throws(() => validateEntryPack(pack, "fixture"), /invalid flow contour/);
  for (const foreign of [{ ...flow, contour: [...memoryContour].reverse() }, { ...flow, terminal_stage: "review" }])
    assert.throws(() => validateEntryPack(pack, "fixture", foreign), error => error.code === "entry_pack_flow_mismatch");
  assert.throws(() => validateEntryPack({ ...pack, entries: {} }, "fixture", flow), /misses focused/);
  assert.throws(() => validateEntryPack({ ...pack, flow: { ...flow, contour: ["review", "review"] } }, "fixture", flow), /unique bounded/);
});

test("runner selection uses the selected contour without widening historical SDLC", () => {
  const profile = { selection: { focused_stages: ["compose"], segment: { from: "discover", to: "review" }, e2e: true, repetitions: 2 } };
  const selected = selectedEntries(profile, memoryContour);
  assert.equal(selected.length, 6);
  assert.equal(selected[2].stage, "preflight"); assert.equal(selected[2].terminal_stage, "finish");
  assert.equal(selected[0].id, "focus-compose-r1");
  assert.throws(() => selectedEntries(profile), /unknown focused stage/);
  assert.throws(() => selectedEntries({ ...profile, case_terminal_stage: "merge" }, memoryContour), /outside its flow contour/);
  assert.throws(() => selectedEntries({ selection: { ...profile.selection, segment: { from: "review", to: "discover" } } }, memoryContour), /ordered contour range/);
  const legacy = selectedEntries({ selection: { focused_stages: ["code"], segment: null, e2e: true, repetitions: 1 }, case_terminal_stage: "plan" }, ["specify", "plan"]);
  assert.equal(legacy[0].stage, "code"); assert.equal(legacy[1].stage, "specify");
});

test("explicit flow contour is bounded metadata and does not widen historical SDLC defaults", () => {
  for (const invalid of [null, [], ["review", "review"], ["../review"], ["Review"], Array.from({ length: 65 }, (_, index) => `stage-${index}`)])
    assert.throws(() => validateFlowContour(invalid), /unique bounded/);
  const original = [...memoryContour], catalog = validateFlowContour(original);
  catalog.push("extra"); assert.deepEqual(original, memoryContour);
  const context = { ...slice, stage: "preflight" };
  assert.throws(() => validateStageContext(context), /unsupported stage context/);
  assert.equal(validateStageContext(context, "preflight", memoryContour).stage, "preflight");
  assert.throws(() => validateStageContext({ ...context, stage: "merge" }, null, memoryContour), /unsupported stage context/);
});

test("memory flow entries use their initial stage for bootstrap and later stages require RUN snapshots", async () => {
  const entry = { schema_id: "dd-eval/stage-entry@1", case_id: "memory-case", revision: "REV-001", checkpoint_id: "STG-001", stage: "preflight",
    snapshot: { kind: "bootstrap", locator: "canonical/bootstrap", manifest_sha256: "a".repeat(64), run_id: null },
    semantic_package_sha256: "b".repeat(64), context_slice_sha256: "c".repeat(64) };
  assert.throws(() => validateEntry(entry), /unsupported stage entry/);
  assert.equal(validateEntry(entry, "preflight", memoryContour).snapshot.kind, "bootstrap");
  assert.throws(() => validateEntry({ ...entry, stage: "discover" }, null, memoryContour), /requires a RUN snapshot/);
  assert.throws(() => validateEntry({ ...entry, snapshot: { ...entry.snapshot, kind: "run", run_id: "RUN-fixture" } }, null, memoryContour), /requires a bootstrap snapshot/);
  const context = { ...slice, stage: "preflight" };
  const pack = await writeEntryPack({ caseDir: "/tmp/memory-case", revision: "REV-001", inputCheckpoint: { id: "cp-001", sha256: "d".repeat(64) },
    flow: { contour: memoryContour, terminal_stage: "finish" }, stageBlueprint: { schema_id: "dd-eval/stage-context-blueprint@1", stages: { preflight: context } },
    entries: { preflight: entry }, authoring: {} });
  assert.deepEqual(pack.entries, { preflight: "preflight.json" });
  assert.equal(pack.title, "Flow Entry Pack");
});

test("explicit memory contour materializes contained sources and preserves semantic context identity", async t => {
  const root = await mkdtemp(path.join(os.tmpdir(), "dd-eval-memory-entry-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  await writeFile(path.join(root, "input.md"), "Task\n"); await writeFile(path.join(root, "README.md"), "Project\n");
  const context = { ...slice, stage: "preflight" }, source = { schema_id: "dd-eval/stage-context-blueprint@1", stages: { preflight: context } };
  assert.throws(() => validateStageBlueprint(source), /unsupported stages/);
  const blueprint = validateStageBlueprint(source, memoryContour);
  const rendered = await materializeStageSlice({ blueprint, stage: "preflight", roots: { project: root }, output: path.join(root, "context.json"), flowContour: memoryContour });
  const runnerSlice = await materializeCaseStageSlice({ blueprint, stage: "preflight", roots: { project: root }, output: path.join(root, "runner-context.json") }, { value: { flow: { contour: memoryContour } } });
  assert.equal(runnerSlice.semantic_package_sha256, rendered.semantic_package_sha256);
  await assert.rejects(materializeCaseStageSlice({ blueprint, stage: "preflight", roots: { project: root }, output: path.join(root, "foreign-context.json") }, {}), /unsupported stage context/);
  assert.equal(rendered.semantic_package_sha256, semanticContextHash(context, memoryContour));
  assert.equal(JSON.parse(await readFile(rendered.path, "utf8")).sources[0].path, path.join(root, "README.md"));
});
test("focused historical SDLC pack does not promote PLAN to bootstrap", async () => {
  const entry = { schema_id: "dd-eval/stage-entry@1", case_id: "case", revision: "REV-001", checkpoint_id: "STG-001", stage: "plan",
    snapshot: { kind: "run", locator: "canonical/run", manifest_sha256: "a".repeat(64), run_id: "RUN-fixture" },
    semantic_package_sha256: "b".repeat(64), context_slice_sha256: "c".repeat(64) };
  const input = { caseDir: "/tmp/case", revision: "REV-001", inputCheckpoint: { id: "cp-001", sha256: "d".repeat(64) },
    flow: { contour: ["plan"], terminal_stage: "plan" }, stageBlueprint: {}, entries: { plan: entry }, authoring: {} };
  assert.deepEqual((await writeEntryPack(input)).entries, { plan: "plan.json" });
  const extra = { ...entry, stage: "code" };
  assert.deepEqual((await writeEntryPack({ ...input, entries: { plan: entry, code: extra } })).entries, { plan: "plan.json", code: "code.json" });
  await assert.rejects(writeEntryPack({ ...input, flow: { contour: memoryContour, terminal_stage: "finish" }, entries: { code: extra } }), /outside its flow contour/);
  await assert.rejects(writeEntryPack({ ...input, entries: { plan: { ...entry, snapshot: { ...entry.snapshot, kind: "bootstrap", run_id: null } } } }), /requires a RUN snapshot/);
});

test("task-priority SPECIFY has one canonical response fixture, not legacy script copies", async () => {
  const caseRoot = new URL("../cases/sdlc-eval-2026-summer-task-priority/", import.meta.url);
  const fixture = JSON.parse(await readFile(new URL("entry-pack-source/interactions/specify.json", caseRoot), "utf8"));
  assert.equal(fixture.schema_id, "dd-eval/canonical-responses@1");
  assert.ok(fixture.responses.length > 0);
  for (const legacy of ["interactions/specify.json", "interactions/clarification-task-priority.md"]) {
    await assert.rejects(access(new URL(legacy, caseRoot)), { code: "ENOENT" });
  }
  const instructions = await readFile(new URL("stage-entries/authoring-plan.md", caseRoot), "utf8");
  assert.match(instructions, /only executable SPECIFY response fixture/);
  assert.match(instructions, /entry-pack-source\/interactions\/specify\.json/);
});

test("stage context has path-independent semantic identity and path-bearing materialization", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "dd-eval-entry-"));
  await writeFile(path.join(root, "input.md"), "Task\n"); await writeFile(path.join(root, "README.md"), "Read me\n");
  const blueprint = validateStageBlueprint({ schema_id: "dd-eval/stage-context-blueprint@1", stages: { specify: slice } });
  const materialized = await materializeStageSlice({ blueprint, stage: "specify", roots: { project: root }, output: path.join(root, "runner", "specify.json") });
  const rendered = JSON.parse(await readFile(materialized.path, "utf8"));
  assert.equal(materialized.semantic_package_sha256, semanticContextHash(slice));
  assert.equal(rendered.schema_id, "dd-flow/stage-context@1");
  assert.equal(rendered.source_context_schema_id, "dd-eval/stage-context@1");
  assert.equal(rendered.source_context_sha256, semanticContextHash(slice));
  assert.equal(rendered.sources[0].path, path.join(root, "README.md"));
  assert.notEqual(materialized.sha256, materialized.semantic_package_sha256);
});

test("optional missing stage source is retained without hiding a missing required source", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "dd-eval-entry-optional-"));
  const source = { role: "prior", root: "project", path: "prior.json", reason: "If present." };
  const output = path.join(root, "runner", "specify.json");
  const optional = validateStageBlueprint({ schema_id: "dd-eval/stage-context-blueprint@1", stages: { specify: { ...slice, sources: [{ ...source, required: false }] } } });
  const rendered = await materializeStageSlice({ blueprint: optional, stage: "specify", roots: { project: root }, output });
  assert.equal(JSON.parse(await readFile(rendered.path, "utf8")).sources[0].required, false);
  const optionalFlag = validateStageBlueprint({ schema_id: "dd-eval/stage-context-blueprint@1", stages: { specify: { ...slice, sources: [{ ...source, optional: true }] } } });
  const flagged = await materializeStageSlice({ blueprint: optionalFlag, stage: "specify", roots: { project: root }, output });
  assert.equal(JSON.parse(await readFile(flagged.path, "utf8")).sources[0].optional, true);
  assert.throws(() => validateStageBlueprint({ schema_id: "dd-eval/stage-context-blueprint@1", stages: { specify: { ...slice, sources: [{ ...source, optional: "yes" }] } } }), /optional must be boolean/);
  const required = validateStageBlueprint({ schema_id: "dd-eval/stage-context-blueprint@1", stages: { specify: { ...slice, sources: [{ ...source, required: true }] } } });
  await assert.rejects(materializeStageSlice({ blueprint: required, stage: "specify", roots: { project: root }, output }), /required stage source is missing for prior/);
});

test("task-priority PLAN declares the accepted SPECIFY decision as an authoritative source", async () => {
  const caseRoot = path.resolve("cases/sdlc-eval-2026-summer-task-priority");
  const blueprint = validateStageBlueprint(JSON.parse(await readFile(path.join(caseRoot, "entry-pack-source/stage-context.json"), "utf8")));
  assert.deepEqual(blueprint.stages.plan.sources.filter(source => source.role === "accepted_specify"), [{
    role: "accepted_specify", root: "run", path: "01-specify/specify.json", required: true,
    reason: "Принятые пользовательские решения имеют приоритет над прежними общими правилами только в явно согласованных границах."
  }]);
  const answer = JSON.parse(await readFile(path.join(caseRoot, "entry-pack-source/interactions/specify.json"), "utf8"))
    .responses.find(response => response.id === "clarification-task-priority")?.answer;
  assert.match(answer, /участник workspace может изменить приоритет задачи/);
  assert.match(answer, /Смешанное изменение приоритета и других полей отклоняется целиком/);
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

test("adapter journals are parsed separately from strict runner CloudEvents", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "dd-eval-driver-journal-")); const file = path.join(root, "subject.events.jsonl");
  await writeFile(file, '{"order":1,"kind":"outbound","payload":{"command":"dd-flow stage start"}}\n');
  const [record] = await readJsonLines(file, "driver journal");
  assert.equal(record.kind, "outbound");
  await assert.rejects(readEvents(file), /invalid runner event/);
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
