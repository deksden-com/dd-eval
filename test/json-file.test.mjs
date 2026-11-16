import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { readJson, writeJsonAtomic } from "../lib/json-file.mjs";
import { writeJsonAtomic as legacyWriter } from "../lib/runner-events.mjs";

test("atomic JSON publication preserves the previous file on serialization failure", async t => {
  const root = await mkdtemp(path.join(os.tmpdir(), "dd-eval-json-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const file = path.join(root, "state.json");
  assert.equal(legacyWriter, writeJsonAtomic);
  await writeJsonAtomic(file, { state: "initial" });
  await assert.rejects(writeJsonAtomic(file, { invalid: 1n }), TypeError);
  assert.deepEqual(await readJson(file), { state: "initial" });
  assert.deepEqual(await readdir(root), ["state.json"]);
  assert.match(await readFile(file, "utf8"), /initial/);
});
