import assert from "node:assert/strict";
import { chmod, mkdtemp, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { commandJson } from "../lib/process-json.mjs";

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
