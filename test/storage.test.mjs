import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { gcApply, gcPlan, storageList, storageStatus } from "../lib/storage.mjs";

test("storage enumerates terminal runs and GC deletes only its explicit plan", async () => {
  const home = await mkdtemp(path.join(os.tmpdir(), "dd-eval-storage-")); const prior = process.env.DD_EVAL_HOME; process.env.DD_EVAL_HOME = home;
  try {
    const run = path.join(home, "runs", "EVAL-001");
    await mkdir(run, { recursive: true });
    await writeFile(path.join(run, "manifest.json"), JSON.stringify({ case_id: "case-a", kind: "scored", created_at: "2026-01-01T00:00:00.000Z" }));
    await writeFile(path.join(run, "events.jsonl"), `${JSON.stringify({ specversion: "1.0", id: "event", source: "dd-eval://test", type: "dev.dd.eval.completed", time: "2026-01-01T00:00:00.000Z", datacontenttype: "application/json", runid: "EVAL-001", traceid: "EVAL-001", data: { sequence: 1, state: "completed" } })}\n`);
    const listed = await storageList({ caseId: "case-a" }); assert.equal(listed.runs.length, 1); assert.equal((await storageStatus()).runs.active.length, 0);
    const plan = await gcPlan(); assert.equal(plan.candidates.length, 1); assert.equal(JSON.parse(await readFile(plan.file, "utf8")).schema_id, "dd-eval/gc-plan@1");
    const applied = await gcApply({ planFile: plan.file }); assert.equal(applied.deleted.length, 1); assert.equal((await storageList()).runs.length, 0);
  } finally { if (prior === undefined) delete process.env.DD_EVAL_HOME; else process.env.DD_EVAL_HOME = prior; await rm(home, { recursive: true, force: true }); }
});

test("storage reports a damaged historical journal without hiding other runs", async () => {
  const home = await mkdtemp(path.join(os.tmpdir(), "dd-eval-storage-")); const prior = process.env.DD_EVAL_HOME; process.env.DD_EVAL_HOME = home;
  try {
    const bad = path.join(home, "runs", "EVAL-bad"); const good = path.join(home, "runs", "EVAL-good"); await mkdir(bad, { recursive: true }); await mkdir(good, { recursive: true });
    await writeFile(path.join(bad, "manifest.json"), JSON.stringify({ case_id: "case-a", kind: "scored" })); await writeFile(path.join(good, "manifest.json"), JSON.stringify({ case_id: "case-a", kind: "scored" }));
    await writeFile(path.join(bad, "events.jsonl"), "not-json\n");
    await writeFile(path.join(good, "events.jsonl"), `${JSON.stringify({ specversion: "1.0", id: "event", source: "dd-eval://test", type: "dev.dd.eval.completed", time: "2026-01-01T00:00:00.000Z", datacontenttype: "application/json", runid: "EVAL-good", traceid: "EVAL-good", data: { sequence: 1, state: "completed" } })}\n`);
    const listed = await storageList(); const record = listed.runs.find((run) => run.id === "EVAL-bad");
    assert.equal(record.state, "journal_invalid"); assert.equal(record.journal_error.code, "journal_invalid"); assert.equal(listed.runs.find((run) => run.id === "EVAL-good").state, "completed");
    assert.deepEqual((await storageStatus()).runs.active, []);
  } finally { if (prior === undefined) delete process.env.DD_EVAL_HOME; else process.env.DD_EVAL_HOME = prior; await rm(home, { recursive: true, force: true }); }
});
