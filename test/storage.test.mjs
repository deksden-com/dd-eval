import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { gcApply, gcPlan, prepareGcApply, storageList, storageStatus } from "../lib/storage.mjs";

test("storage enumerates terminal runs and GC deletes only its explicit plan", async () => {
  const home = await mkdtemp(path.join(os.tmpdir(), "dd-eval-storage-")); const prior = process.env.DD_EVAL_HOME; process.env.DD_EVAL_HOME = home;
  try {
    const run = path.join(home, "runs", "EVAL-001");
    await mkdir(run, { recursive: true });
    const bin = path.join(home, "runtime.mjs"), inventory = path.join(home, "inventory.json");
    await writeFile(bin, `import fs from 'node:fs'; console.log(fs.readFileSync(${JSON.stringify(inventory)},'utf8'));`);
    await writeFile(inventory, JSON.stringify({ scope_id: "EVAL-001", processes: [{ state: "running" }], provider_turns: [] }));
    await writeFile(path.join(run, "manifest.json"), JSON.stringify({ run_id: "EVAL-001", runtime_control_bin: bin, runtime_resource_home: home, case_id: "case-a", kind: "scored", created_at: "2026-01-01T00:00:00.000Z" }));
    await writeFile(path.join(run, "events.jsonl"), `${JSON.stringify({ specversion: "1.0", id: "event", source: "dd-eval://test", type: "dev.dd.eval.completed", time: "2026-01-01T00:00:00.000Z", datacontenttype: "application/json", runid: "EVAL-001", traceid: "EVAL-001", data: { sequence: 1, state: "completed" } })}\n`);
    const listed = await storageList({ caseId: "case-a" }); assert.equal(listed.runs.length, 1); assert.equal((await storageStatus()).runs.active.length, 0);
    const plan = await gcPlan(); assert.equal(plan.candidates.length, 1); assert.equal(JSON.parse(await readFile(plan.file, "utf8")).schema_id, "dd-eval/gc-plan@1");
    const eventFile = path.join(run, "events.jsonl"); const completed = await readFile(eventFile, "utf8");
    await writeFile(eventFile, completed.replace('"state":"completed"', '"state":"completed_with_failures"'));
    assert.equal((await gcPlan()).candidates.length, 0);
    await assert.rejects(gcApply({ planFile: plan.file }), /no longer disposable/);
    assert.equal((await storageList()).runs.length, 1);
    await writeFile(eventFile, completed);
    await assert.rejects(gcApply({ planFile: plan.file }), /active or unknown runtime owners/);
    await writeFile(inventory, JSON.stringify({ scope_id: "EVAL-001", processes: [], provider_turns: ["pending"] }));
    await assert.rejects(gcApply({ planFile: plan.file }), /active or unknown runtime owners/);
    await writeFile(inventory, JSON.stringify({ scope_id: "EVAL-001", processes: [], provider_turns: [] }));
    const invalid = path.join(home, "runs", "EVAL-invalid");
    await mkdir(invalid);
    await writeFile(path.join(invalid, "manifest.json"), JSON.stringify({ run_id: "EVAL-invalid" }));
    const originalPlan = await readFile(plan.file, "utf8");
    const malformed = JSON.parse(originalPlan);
    malformed.candidates.push({ path: run, bytes: "not-a-number" });
    await writeFile(plan.file, JSON.stringify(malformed));
    await assert.rejects(gcApply({ planFile: plan.file }), { code: "usage", details: { parameter: "plan", phase: "prepare", effect: "no_effect", recoverable: true } });
    assert.equal(JSON.parse(await readFile(path.join(run, "manifest.json"), "utf8")).run_id, "EVAL-001");
    const mixed = JSON.parse(originalPlan);
    mixed.candidates.push({ path: invalid, bytes: 0 });
    await writeFile(plan.file, JSON.stringify(mixed));
    await assert.rejects(gcApply({ planFile: plan.file }), /no longer disposable/);
    assert.equal(JSON.parse(await readFile(path.join(run, "manifest.json"), "utf8")).run_id, "EVAL-001");
    await rm(invalid, { recursive: true });
    await writeFile(plan.file, originalPlan);
    const prepared = await prepareGcApply({ planFile: plan.file });
    await rm(plan.file);
    const applied = await gcApply({ planFile: plan.file }, prepared); assert.equal(applied.deleted.length, 1); assert.equal((await storageList()).runs.length, 0);
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
