import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import fs, { mkdtemp, mkdir, writeFile, rm, symlink, appendFile } from "node:fs/promises";
import { syncBuiltinESMExports } from "node:module";
import os from "node:os";
import path from "node:path";
import { collectHitlSources, validateHitlSources } from "../lib/hitl-sources.mjs";

const hash = bytes => createHash("sha256").update(bytes).digest("hex");
const workspace = async t => {
  const root = await mkdtemp(path.join(os.tmpdir(), "hitl-sources-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const context = entries => ({ roots: { project: root }, sources: entries });
  return { root, context, file: (name, bytes) => writeFile(path.join(root, name), bytes) };
};
const packet = (context, result) => ({ subject_context: context, grounding_sources: result.sources, directory_sources: result.directories, ...(result.unavailable.length ? { unavailable_sources: result.unavailable } : {}) });

test("declared directory freezes sorted UTF-8 membership, empty directories and binary exclusions", async t => {
  const { root, context, file } = await workspace(t);
  await mkdir(path.join(root, "artifacts/empty"), { recursive: true });
  await file("artifacts/z.txt", "last\r\n👋"); await file("artifacts/a.txt", "first");
  await file("artifacts/image.bin", Buffer.from([0, 255]));
  const input = context([{ path: "artifacts", role: "accepted" }]);
  const result = await collectHitlSources(input, { includeBytes: true });
  assert.deepEqual(result.directories[0].files, [{ path: "a.txt", source_id: "source-0" }, { path: "z.txt", source_id: "source-1" }]);
  assert.deepEqual(result.directories[0].exclusions, [{ path: "image.bin", reason: "non_text" }]);
  assert.equal(result.sources[1].text, "last\r\n👋");
  assert.ok(result.entries.some(entry => entry.type === "directory" && entry.path === "artifacts/empty"));
  assert.deepEqual(result.entries.find(entry => entry.path === "artifacts/image.bin").bytes, Buffer.from([0, 255]));
  assert.equal(result.entries.find(entry => entry.path === "artifacts/image.bin").sha256, hash(Buffer.from([0, 255])));
  const p = packet(input, result); assert.equal(validateHitlSources(p), p);
});

test("file/directory/inside-file aliases preserve contributors and consume one grounding source", async t => {
  const { root, context, file } = await workspace(t);
  await mkdir(path.join(root, "accepted")); await file("accepted/task.txt", "accepted task");
  await symlink("task.txt", path.join(root, "accepted/alias.txt"));
  const input = { ...context([{ path: "accepted/task.txt", role: "task" }, { path: "accepted", role: "plan" }]), task_input: [{ path: "accepted/alias.txt" }] };
  const result = await collectHitlSources(input);
  assert.equal(result.sources.length, 1);
  assert.deepEqual(result.sources[0].origin.roles, ["task", "plan", "task_input"]);
  assert.deepEqual(result.sources[0].origin.contributors, [{ collection: "sources", index: 0, child_path: "" }, { collection: "sources", index: 1, child_path: "alias.txt" }, { collection: "sources", index: 1, child_path: "task.txt" }, { collection: "task_input", index: 0, child_path: "" }]);
  assert.ok(result.entries.every(entry => !Object.hasOwn(entry, "bytes")));
  assert.deepEqual(result.entries.find(entry => entry.path === "accepted/alias.txt").alias_of, { root: "project", path: "accepted/task.txt" });
  validateHitlSources(packet(input, result));
});

test("absolute materialized declaration keeps original provenance but transport entries are root-relative", async t => {
  const { root, context, file } = await workspace(t);
  await mkdir(path.join(root, "accepted")); await file("accepted/task.txt", "task");
  const input = context([{ path: path.join(root, "accepted") }]);
  const result = await collectHitlSources(input);
  assert.equal(result.sources[0].origin.path, path.join(root, "accepted/task.txt"));
  assert.equal(result.entries[0].path, "accepted"); assert.equal(result.entries[1].path, "accepted/task.txt");
  validateHitlSources(packet(input, result));
});

test("snapshot alias transport prefers captured canonical child over earlier sibling alias", async t => {
  const { root, context, file } = await workspace(t);
  await mkdir(path.join(root, "accepted")); await file("accepted/task.txt", "task");
  await symlink("accepted/task.txt", path.join(root, "first-alias.txt"));
  const input = context([{ path: "first-alias.txt" }, { path: "accepted" }]);
  const result = await collectHitlSources(input, { includeBytes: true });
  assert.deepEqual(result.entries.find(entry => entry.path === "first-alias.txt").alias_of, { root: "project", path: "accepted/task.txt" });
  assert.equal(result.entries.find(entry => entry.path === "accepted/task.txt").alias_of, undefined);
  assert.equal(result.sources[0].origin.path, "first-alias.txt");
  validateHitlSources(packet(input, result));
});

test("required empty directory differs from optional missing declaration", async t => {
  const { root, context } = await workspace(t);
  await mkdir(path.join(root, "empty"));
  const input = context([{ path: "empty", required: true }, { path: "missing", optional: true }]);
  const result = await collectHitlSources(input);
  assert.deepEqual(result.directories[0].files, []); assert.deepEqual(result.directories[0].exclusions, []);
  assert.deepEqual(result.unavailable[0], { role: "source", origin: "missing", declaration: { collection: "sources", index: 1 }, root: "project", path: "missing" });
  validateHitlSources(packet(input, result));
  await assert.rejects(collectHitlSources(context([{ path: "missing" }])), { code: "judge_context_invalid" });
});

test("invalid declarations and namespace-wide/private traversal fail before reading", async t => {
  const { root, context, file } = await workspace(t);
  await file("task.txt", "task");
  for (const entry of [{ path: "." }, { path: root }, { path: "../outside" }, { path: "task.txt", required: true, optional: true }, { path: "task.txt", required: false, optional: false }, { path: "task.txt", role: " " }, { path: "task.txt", sha256: "bad" }, { path: ".zcode/config.json", optional: true }, { path: "node_modules/input", optional: true }, { path: "task.txt", root: "secret" }]) await assert.rejects(collectHitlSources(context([entry])), { code: "judge_context_invalid" });
  const result = await collectHitlSources(context([{ path: "task.txt", required: false, optional: true }]));
  validateHitlSources(packet(context([{ path: "task.txt", required: false, optional: true }]), result));
});

test("known text malformed UTF-8/NUL fails; unknown binary excludes; direct binary fails", async t => {
  const { root, context, file } = await workspace(t);
  await mkdir(path.join(root, "artifacts"));
  for (const bytes of [Buffer.from([0xc3, 0x28]), Buffer.from("nul\0byte")]) {
    await file("artifacts/task.md", bytes);
    await assert.rejects(collectHitlSources(context([{ path: "artifacts" }])), { code: "judge_context_invalid" });
  }
  await rm(path.join(root, "artifacts/task.md")); await file("artifacts/image.bin", Buffer.from([0, 255]));
  assert.equal((await collectHitlSources(context([{ path: "artifacts" }]))).directories[0].exclusions.length, 1);
  await assert.rejects(collectHitlSources(context([{ path: "artifacts/image.bin" }])), { code: "judge_context_invalid" });
});

test("file cap accepts exact byte boundary and rejects oversize text and binary", async t => {
  const { root, context, file } = await workspace(t);
  await mkdir(path.join(root, "artifacts"));
  await file("artifacts/task.txt", Buffer.alloc(1024 * 1024, "a"));
  assert.equal((await collectHitlSources(context([{ path: "artifacts" }]))).sources[0].text.length, 1024 * 1024);
  await file("artifacts/task.txt", Buffer.alloc(1024 * 1024 + 1, "a"));
  await assert.rejects(collectHitlSources(context([{ path: "artifacts" }])), /exceeds 1 MiB/);
  await rm(path.join(root, "artifacts/task.txt")); await file("artifacts/image.bin", Buffer.alloc(1024 * 1024 + 1));
  await assert.rejects(collectHitlSources(context([{ path: "artifacts" }])), /exceeds 1 MiB/);
});

test("cap+1 descriptor read rejects post-stat growth and closes its handle", async t => {
  const { root, context, file } = await workspace(t);
  await file("task.txt", Buffer.alloc(1024 * 1024, "a"));
  const original = fs.open; let closed = false, grew = false, maximumRequested = 0;
  t.mock.method(fs, "open", async (...args) => {
    const handle = await original(...args);
    return { stat: handle.stat.bind(handle), close: async () => { closed = true; await handle.close(); }, read: async (...readArgs) => {
      maximumRequested = Math.max(maximumRequested, readArgs[2]);
      if (!grew) { grew = true; await appendFile(path.join(root, "task.txt"), "b"); }
      return handle.read(...readArgs);
    } };
  });
  syncBuiltinESMExports();
  try { await assert.rejects(collectHitlSources(context([{ path: "task.txt" }])), /exceeds 1 MiB during read/); }
  finally { t.mock.restoreAll(); syncBuiltinESMExports(); }
  assert.equal(closed, true); assert.equal(maximumRequested, 1024 * 1024 + 1);
});

test("in-flight added child causes explicit drift rejection, not a partial manifest", async t => {
  const { root, context, file } = await workspace(t);
  await mkdir(path.join(root, "artifacts")); await file("artifacts/task.txt", "task");
  const original = fs.open; let changed = false;
  t.mock.method(fs, "open", async (...args) => {
    const handle = await original(...args);
    return { stat: handle.stat.bind(handle), close: handle.close.bind(handle), read: async (...readArgs) => {
      const result = await handle.read(...readArgs);
      if (!changed) { changed = true; await file("artifacts/new.txt", "new"); }
      return result;
    } };
  });
  syncBuiltinESMExports();
  try { await assert.rejects(collectHitlSources(context([{ path: "artifacts" }])), /directory changed during snapshot/); }
  finally { t.mock.restoreAll(); syncBuiltinESMExports(); }
});

test("directory text budget counts bytes and dedup aliases, not JS characters", async t => {
  const { root, context, file } = await workspace(t);
  await mkdir(path.join(root, "artifacts"));
  const bytes = Buffer.alloc(1024 * 1024, "a");
  for (let i = 0; i < 8; i++) await file(`artifacts/${i}.txt`, bytes);
  await symlink("0.txt", path.join(root, "artifacts/alias.txt"));
  const result = await collectHitlSources(context([{ path: "artifacts" }])); assert.equal(result.sources.length, 8);
  await file("artifacts/excess.txt", "👋");
  await assert.rejects(collectHitlSources(context([{ path: "artifacts" }])), /text budget exceeded/);
});

test("directory symlinks, escaped/private targets and special files reject without blocking", async t => {
  const { root, context, file } = await workspace(t);
  await mkdir(path.join(root, "artifacts")); await file("sibling.txt", "sibling");
  await symlink("../sibling.txt", path.join(root, "artifacts/escape.txt"));
  await assert.rejects(collectHitlSources(context([{ path: "artifacts" }])), /escapes declared subtree/);
  await rm(path.join(root, "artifacts/escape.txt"));
  await symlink("artifacts", path.join(root, "dir-link"));
  await assert.rejects(collectHitlSources(context([{ path: "dir-link" }])), /concrete unhashed subtree/);
  await mkdir(path.join(root, ".zcode")); await file(".zcode/config.json", "{}");
  await symlink(".zcode/config.json", path.join(root, "private.json"));
  await assert.rejects(collectHitlSources(context([{ path: "private.json" }])), /private target/);
  await promisify(execFile)("mkfifo", [path.join(root, "artifacts/fifo")]);
  await assert.rejects(collectHitlSources(context([{ path: "artifacts" }])), /not a regular file/);
});

test("direct byte checksum remains a file checksum; directories cannot reinterpret it", async t => {
  const { root, context, file } = await workspace(t);
  await mkdir(path.join(root, "artifacts")); await file("artifacts/task.txt", "task\r\n");
  const input = context([{ path: "artifacts/task.txt", sha256: hash("task\r\n") }]);
  validateHitlSources(packet(input, await collectHitlSources(input)));
  await assert.rejects(collectHitlSources(context([{ path: "artifacts/task.txt", sha256: "0".repeat(64) }])), /checksum changed/);
  await assert.rejects(collectHitlSources(context([{ path: "artifacts", sha256: hash("task\r\n") }])), /unhashed subtree/);
});

test("retained validator binds role union, every alias, sorted unique membership and optional status", async t => {
  const { root, context, file } = await workspace(t);
  await mkdir(path.join(root, "artifacts")); await file("artifacts/a.txt", "task");
  const input = { ...context([{ path: "artifacts", role: "plan" }]), task_input: [{ path: "artifacts/a.txt" }] };
  const p = packet(input, await collectHitlSources(input)); validateHitlSources(p);
  for (const mutate of [p => { p.grounding_sources[0].origin.roles = ["invented"]; }, p => { p.grounding_sources[0].origin.contributors.pop(); }, p => { p.grounding_sources[0].origin.contributors[0].child_path = "../outside"; }, p => { p.directory_sources[0].files[0].source_id = "source-9"; }, p => { p.directory_sources[0].files.push({ ...p.directory_sources[0].files[0] }); }, p => { p.directory_sources[0].exclusions.push({ path: "a.txt", reason: "non_text" }); }, p => { p.directory_sources[0].role = "invented"; }, p => { p.directory_sources = []; }, p => { p.grounding_sources = []; }]) {
    const copy = structuredClone(p); mutate(copy);
    assert.throws(() => validateHitlSources(copy), { code: "judge_result_invalid" });
  }
  await file("artifacts/a.txt", "changed mutable source");
  validateHitlSources(p); // Frozen validation does not reopen current host files.
});

test("frozen directory rejects impossible textual exclusions and file/ancestor collisions", async t => {
  const { root, context } = await workspace(t);
  await mkdir(path.join(root, "artifacts"));
  const p = packet(context([{ path: "artifacts" }]), await collectHitlSources(context([{ path: "artifacts" }])));
  for (const exclusions of [[{ path: "task.md", reason: "non_text" }], [{ path: "a.bin", reason: "non_text" }, { path: "a.bin/child.bin", reason: "non_text" }], [{ path: Array(33).fill("deep").join("/") + ".bin", reason: "non_text" }], Array.from({ length: 4096 }, (_, i) => ({ path: `${String(i).padStart(5, "0")}.bin`, reason: "non_text" }))]) {
    const copy = structuredClone(p); copy.directory_sources[0].exclusions = exclusions;
    assert.throws(() => validateHitlSources(copy), { code: "judge_result_invalid" });
  }
});

test("subsequent collection catches added/deleted child and binary-to-text drift", async t => {
  const { root, context, file } = await workspace(t);
  await mkdir(path.join(root, "artifacts")); await file("artifacts/item.bin", Buffer.from([0, 255]));
  const input = context([{ path: "artifacts" }]);
  const before = await collectHitlSources(input); await file("artifacts/item.bin", "now text");
  const after = await collectHitlSources(input); assert.notDeepEqual(before.directories, after.directories);
  await file("artifacts/new.txt", "new");
  const added = await collectHitlSources(input); assert.equal(added.directories[0].files.length, 2);
  await rm(path.join(root, "artifacts/new.txt"));
  const deleted = await collectHitlSources(input); assert.deepEqual(deleted.directories, after.directories);
});

test("bounded enumeration and directory depth have explicit admission limits", async t => {
  const { root, context } = await workspace(t);
  let locator = "artifacts";
  for (let i = 0; i < 34; i++) { await mkdir(path.join(root, locator)); locator += "/child"; }
  await assert.rejects(collectHitlSources(context([{ path: "artifacts" }])), /depth 32/);
});

test("null/no-source context has empty manifests and still validates", async () => {
  for (const input of [null, { objective: "objective" }]) {
    const result = await collectHitlSources(input);
    assert.deepEqual(result, { sources: [], directories: [], unavailable: [], entries: [] });
    validateHitlSources(packet(input, result));
  }
});
