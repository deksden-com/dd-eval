import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { promisify } from "node:util";
import { readJson } from "../lib/runner.mjs";

test("shared JSON reader preserves IO failures and rejects non-regular inputs without waiting", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "dd-eval-json-"));
  try {
    await assert.rejects(readJson(path.join(root, "missing")), { code: "ENOENT" });
    const file = path.join(root, "input.json");
    await writeFile(file, "{");
    await assert.rejects(readJson(file), error => error.code === "invalid_json" && error.details?.effect !== "no_effect");
    await writeFile(file, "private-token-value");
    await assert.rejects(readJson(file), error => error.code === "invalid_json" && !error.message.includes("private-token-value"));
    await writeFile(file, '{"ok":true}');
    assert.deepEqual(await readJson(file), { ok: true });
    const directory = path.join(root, "directory"); await mkdir(directory);
    await assert.rejects(readJson(directory), { code: "input_file_not_regular" });
    if (process.platform !== "win32") {
      const fifo = path.join(root, "fifo"); await promisify(execFile)("mkfifo", [fifo]);
      await assert.rejects(readJson(fifo), { code: "input_file_not_regular" });
    }
  } finally { await rm(root, { recursive: true, force: true }); }
});
