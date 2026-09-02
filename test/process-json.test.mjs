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
