import assert from "node:assert/strict";
import { chmod, mkdtemp, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { commandJson } from "../lib/process-json.mjs";

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
