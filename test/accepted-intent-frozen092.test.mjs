import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, mkdir, realpath, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { validateFrozenAcceptedIntent } from "../lib/case-acceptance.mjs";

test("marked frozen acceptance requires exactly the delivered original source inventory; legacy remains valid", async () => {
  const root = await realpath(await mkdtemp(path.join(os.tmpdir(), "eval-intent-authority-")));
  const contract = "dd-flow/accepted-intent@1", index = { accepted_intent_contract: contract }, data = { project_id: "PRJ-1", run_id: "RUN-1" };
  try {
    await assert.rejects(validateFrozenAcceptedIntent(root, data, index, { sources: [] }), /frozen database authority/);
    assert.equal(await validateFrozenAcceptedIntent(root, data, {}, { sources: [] }), null);
    await assert.rejects(validateFrozenAcceptedIntent(root, data, { accepted_intent_contract: "future" }, { sources: [] }), /unsupported/);
    await mkdir(path.join(root, "runtime"));
    const db = new DatabaseSync(path.join(root, "runtime/db.sqlite"));
    db.exec("CREATE TABLE runs(id TEXT, project_id TEXT, index_json TEXT); CREATE TABLE audit_events(id INTEGER PRIMARY KEY AUTOINCREMENT, project_id TEXT, event_type TEXT, payload_json TEXT)");
    db.prepare("INSERT INTO runs VALUES(?,?,?)").run(data.run_id, data.project_id, JSON.stringify(index));
    const record = (event, value) => db.prepare("INSERT INTO audit_events(project_id,event_type,payload_json) VALUES(?,?,?)").run(data.project_id, event, JSON.stringify({ run_id: data.run_id, ...value }));
    const packet = (file, text) => {
      const bytes = Buffer.from(text), sha256 = createHash("sha256").update(bytes).digest("hex");
      record("flow_run.stage_packet", { file, sha256, base64: bytes.toString("base64") });
      return sha256;
    };
    const source = (role, sha256) => ({ role, root: "run", path: `07-merge/verification/sources/${sha256}/accepted-input.md`, sha256 });
    const intake = source("accepted_intake", packet("/old-owned-run/intake/discussion.md", "Close and reopen through UI and API."));
    const answerPath = "/old-owned-run/intake/hitl/HITL-001-specify/answer-owned.md";
    const questionHash = packet(path.join(path.dirname(answerPath), "question.md"), "Must archived status remain read-only?"), answerHash = packet(answerPath, "Yes.");
    const received = record("flow_run.stage_resumed", { stage: "specify", pause_id: "HITL-001", answer_path: answerPath });
    const identity = `accepted_hitl:${String(received.lastInsertRowid).padStart(12, "0")}:HITL-001`;
    const question = source(`${identity}:0-question`, questionHash), answer = source(`${identity}:1-answer`, answerHash);
    db.close();
    const sources = [intake, question, answer];
    assert.equal((await validateFrozenAcceptedIntent(root, data, index, { sources })).path, "runtime/db.sqlite");
    for (const omitted of sources) await assert.rejects(validateFrozenAcceptedIntent(root, data, index, { sources: sources.filter(source => source !== omitted) }), /source inventory differs/);
    await assert.rejects(validateFrozenAcceptedIntent(root, data, index, { sources: [intake] }), /source inventory differs/);
    await assert.rejects(validateFrozenAcceptedIntent(root, data, {}, { sources }), /contract differs/);
    await assert.rejects(validateFrozenAcceptedIntent(root, data, index, { sources: [...sources, { ...answer, role: `${identity}:invented` }] }), /source inventory differs/);
    await assert.rejects(validateFrozenAcceptedIntent(root, data, index, { sources: sources.map(source => source === answer ? { ...source, sha256: "a".repeat(64) } : source) }), /source inventory differs/);
    const legacy = new DatabaseSync(path.join(root, "runtime/db.sqlite"));
    legacy.prepare("UPDATE runs SET index_json = ?").run("{}"); legacy.close();
    assert.equal(await validateFrozenAcceptedIntent(root, data, {}, { sources: [] }), null);
  } finally { await rm(root, { recursive: true, force: true }); }
});
