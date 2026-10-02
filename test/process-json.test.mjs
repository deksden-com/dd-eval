import assert from "node:assert/strict";
import { chmod, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { commandJson } from "../lib/process-json.mjs";
import { callDriver } from "../lib/runner.mjs";
import { errorRecord } from "../lib/operation-errors.mjs";

test("driver retains JSONL and successful-exit typed error envelopes including false retryable and cleanup", async t => {
  const root = await mkdtemp(path.join(os.tmpdir(), "eval-driver-error-")); t.after(() => rm(root, { recursive: true, force: true }));
  const directory = path.join(root, "harness-runtime/bin"); await mkdir(directory, { recursive: true });
  const executable = path.join(directory, "dd-droid.mjs");
  const failure = { code: "native_outcome_observation_failed", message: "observer failed", retryable: false, details: { operation_id: "native-owned", native_outcome: { status: "completed" }, observation_error: { code: "storage_write_failed" } }, cause: { code: "storage_write_failed", message: "disk" }, cleanup_error: { code: "cleanup_failed", message: "secondary" } };
  for (const status of [0, 2]) {
    await writeFile(executable, `console.log(${JSON.stringify(JSON.stringify({ ok: false, error: failure }))});${status ? "console.error('diagnostic chatter'); process.exitCode=2;" : ""}`);
    await assert.rejects(callDriver({ harness: "droid-cli" }, ["session", "inspect"], { cwd: root, env: { DD_FLOW_CONFIG_HOME: root } }), error => error.code === failure.code && error.retryable === false && error.cause.code === "storage_write_failed" && error.cleanup_error.code === "cleanup_failed" && error.details.operation_id === "native-owned");
  }
});

test("bounded diagnostic serializer handles cycles without losing primary native identity", () => {
  const details = { provider_session_id: "owned", turn_id: "turn" }; details.cycle = details;
  const record = errorRecord({ code: "primary", message: "failed", retryable: false, details });
  assert.equal(record.details.provider_session_id, "owned"); assert.equal(record.retryable, false);
  assert.doesNotThrow(() => JSON.stringify(record));
  Object.defineProperty(details, "throwing", { enumerable: true, get() { throw new Error("getter unavailable"); } });
  const failure = { code: "primary", message: "failed", details }; failure.cause = failure;
  assert.doesNotThrow(() => JSON.stringify(errorRecord(failure)));
  assert.equal(errorRecord(failure).details.throwing, "[unreadable]");
});

test("diagnostic serialization cannot replace the primary with unreadable error fields", () => {
  assert.doesNotThrow(() => errorRecord(Object.create(null)));
  const failure = { code: "primary", message: "failed", retryable: false };
  for (const field of ["details", "cause", "cleanup_error"]) Object.defineProperty(failure, field, { get() { throw new Error("unavailable"); } });
  assert.deepEqual(errorRecord(failure), { code: "primary", message: "failed", retryable: false, details: "[unreadable]" });
  const errors = Array.from({ length: 5 }, (_, index) => ({ code: `primary_${index}`, message: "failed", cause: { code: "typed_cause", message: "cause" } }));
  assert.deepEqual(errors.map(errorRecord), errors.map(error => errorRecord(error)));
});

test("the whole diagnostic tree is bounded, including primitive arrays and causes", () => {
  const numbers = Array.from({ length: 20 }, () => Array.from({ length: 20 }, () => Array.from({ length: 20 }, () => Array(20).fill(1))));
  const strings = Array.from({ length: 20 }, () => Array(20).fill("x".repeat(16000)));
  const branch = { code: "primary", message: "failed", retryable: false, details: strings };
  for (const details of [numbers, strings]) {
    const record = errorRecord({ ...branch, details, cause: branch, cleanup_error: branch });
    const serialized = JSON.stringify(record);
    assert.ok(serialized.length < 150000, `diagnostic size: ${serialized.length}`);
    assert.match(serialized, /\[truncated\]/);
    assert.equal(record.code, "primary"); assert.equal(record.retryable, false);
    assert.equal(record.cause.code, "primary"); assert.equal(record.cleanup_error.code, "primary");
  }
  const tree = depth => ({ code: `typed_${depth}`, message: "x".repeat(32000), ...(depth ? { cause: tree(depth - 1), cleanup_error: tree(depth - 1) } : {}) });
  const record = errorRecord(tree(3));
  const check = (value, depth) => { assert.equal(value.code, `typed_${depth}`); if (depth) { check(value.cause, depth - 1); check(value.cleanup_error, depth - 1); } };
  check(record, 3);
  assert.ok(JSON.stringify(record).length < 150000);
});

test("driver retains native receipt when client ledger publication or identity validation fails", async t => {
  const root = await mkdtemp(path.join(os.tmpdir(), "eval-driver-ledger-")); t.after(() => rm(root, { recursive: true, force: true }));
  const directory = path.join(root, "harness-runtime/bin"); await mkdir(directory, { recursive: true });
  const executable = path.join(directory, "dd-droid.mjs");
  const receipt = { harness: "droid-cli", provider_session_id: "owned", turn_id: "turn", status: "completed" };
  const state = path.join(root, "state");
  // Inject storage failure only after dispatch: the requested ledger remains writable.
  await writeFile(executable, `import {rm,writeFile} from 'node:fs/promises'; await rm(${JSON.stringify(path.join(state, "client-operations"))},{recursive:true}); await writeFile(${JSON.stringify(path.join(state, "client-operations"))},'blocked'); console.log(${JSON.stringify(JSON.stringify(receipt))});`);
  await assert.rejects(callDriver({ harness: "droid-cli" }, ["session", "prompt", "--session-id", "owned", "--state-dir", state], { cwd: root, env: { DD_FLOW_CONFIG_HOME: root } }), error => error.code === "native_outcome_observation_failed" && error.retryable === false && error.details.native_outcome.turn_id === "turn" && error.details.phase === "client_ledger_publication" && !!error.cause);
  await writeFile(executable, `console.log(${JSON.stringify(JSON.stringify(receipt))});`);
  await assert.rejects(callDriver({ harness: "droid-cli" }, ["session", "inspect", "--session-id", "foreign"], { cwd: root, env: { DD_FLOW_CONFIG_HOME: root } }), error => error.code === "session_identity_mismatch" && error.details.native_outcome.provider_session_id === "owned");
});

test("progress without a final newline is delivered and rejected async callbacks are contained", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "dd-eval-process-json-"));
  const executable = path.join(root, "last-progress.mjs");
  await writeFile(executable, "process.stderr.write(JSON.stringify({event:'last'})); console.log('{}');");
  let calls = 0;
  await assert.rejects(commandJson(executable, [], { onProgress: async () => { calls++; throw new Error('async observer failure'); } }), { code: "progress_callback_async" });
  assert.equal(calls, 1);
});

test("negative product verdicts without runtime errors remain results", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "dd-eval-process-json-"));
  const executable = path.join(root, "verdict.mjs");
  await writeFile(executable, "console.log(JSON.stringify({ok:false,findings:['product defect']}));");
  assert.deepEqual(await commandJson(executable, []), { ok: false, findings: ["product defect"] });
});

test("commandJson preserves a structured CLI failure code", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "dd-eval-process-json-"));
  const executable = path.join(root, "failing-cli.mjs");
  await writeFile(executable, "#!/usr/bin/env node\nprocess.stdout.write(JSON.stringify({ error: { code: 'stage_pause_required', message: 'pause first' } }) + '\\n'); process.exitCode = 2;\n");
  await chmod(executable, 0o755);
  await assert.rejects(commandJson(executable, [], { cwd: root }), (error) => error.code === "stage_pause_required" && error.message === "pause first");
});

test("commandJson accepts a JavaScript CLI entrypoint without executable mode", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "dd-eval-process-json-")); const executable = path.join(root, "cli.mjs");
  await writeFile(executable, "process.stdout.write(JSON.stringify({ ok: true }) + '\\n');\n");
  assert.deepEqual(await commandJson(executable, [], { cwd: root }), { ok: true });
});

test("commandJson rejects a successful-exit error envelope", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "dd-eval-process-json-")); const executable = path.join(root, "error-envelope.mjs");
  await writeFile(executable, "process.stdout.write(JSON.stringify({ ok: false, error: { code: 'invocation_unknown', message: 'not admitted' } }) + '\\n');\n");
  await assert.rejects(commandJson(executable, [], { cwd: root }), (error) => error.code === "invocation_unknown" && error.message === "not admitted");
});

test("commandJson does not hide progress callback failures", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "dd-eval-process-json-")); const executable = path.join(root, "progress.mjs");
  await writeFile(executable, "process.stderr.write(JSON.stringify({ event: 'progress' }) + '\\n'); setTimeout(() => process.stdout.write(JSON.stringify({ ok: true }) + '\\n'), 1000);\n");
  await assert.rejects(commandJson(executable, [], { cwd: root, onProgress: () => { throw Object.assign(new Error("observer failed"), { code: "observer_failed" }); } }), { code: "observer_failed" });
});

test("commandJson bounds an unresponsive CLI observer without requiring cooperative shutdown", async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "dd-eval-process-json-"));
  const executable = path.join(root, "waiting-cli.mjs");
  await writeFile(executable, "process.on('SIGTERM', () => {}); setInterval(() => {}, 1000); process.stderr.write(JSON.stringify({ ready: true }) + '\\n');\n");
  const controller = new AbortController();
  const safety = setTimeout(() => controller.abort(), 5000);
  t.after(() => clearTimeout(safety));
  let ready = false;
  await assert.rejects(commandJson(executable, [], {
    cwd: root, signal: controller.signal,
    onProgress: (event) => { ready = event.ready; controller.abort(); },
  }), { name: "AbortError" });
  assert.equal(ready, true);
});

test("commandJson rejects an expired deadline before starting a CLI", async () => {
  const controller = new AbortController();
  const reason = new Error("observation deadline expired");
  controller.abort(reason);
  await assert.rejects(commandJson("missing-cli", [], { signal: controller.signal }), (error) => error === reason);
});
