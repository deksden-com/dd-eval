import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, readFile } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { reassessHitlQualification } from "../lib/runner.mjs";
import { hashJson, sha256, writeJsonAtomic } from "../lib/runner-events.mjs";
import { settledJudge } from "./fixtures/judge-cleanup.mjs";

test("only a bound, never-dispatched and completely retired preparation can be sampled again", async t => {
  const home = await mkdtemp(path.join(os.tmpdir(), "qualification-prepared-"));
  const priorHome = process.env.DD_EVAL_DEFINITION_QUALIFICATION_HOME;
  process.env.DD_EVAL_DEFINITION_QUALIFICATION_HOME = home;
  t.after(async () => { if (priorHome === undefined) delete process.env.DD_EVAL_DEFINITION_QUALIFICATION_HOME; else process.env.DD_EVAL_DEFINITION_QUALIFICATION_HOME = priorHome; await rm(home, { recursive: true, force: true }); });
  const identity = { question: "Accepted decision?", stage: "specify", responses: [] }, nativeKey = hashJson(identity);
  const operation = path.join(home, "a".repeat(64), "operation-prepared"), root = path.join(operation, "interaction-judge", "specify-prepared");
  const qualified = { tasks: { item: { key: nativeKey, identity } }, corpus: { stage: "specify", items: [{ id: "item" }] }, profile: { id: "offline" } };
  const packet = { question: identity.question, stage: identity.stage, responses: [] };
  await writeJsonAtomic(path.join(root, "packet.json"), packet);
  await settledJudge(root, { profile_id: "offline", session_id: "synthetic" });
  await rm(path.join(root, "result.json"));
  const stateFile = path.join(root, "daemon/daemon.json"), cleanupFile = path.join(root, "cleanup.json");
  const state = { ...JSON.parse(await readFile(stateFile)), sessions: [] };
  const cleanup = { ...JSON.parse(await readFile(cleanupFile)), session_id: null, verdict_sha256: null };
  await writeJsonAtomic(stateFile, state); await writeJsonAtomic(cleanupFile, cleanup);
  const intent = { schema_id: "dd-eval/qualification-intent@2", state: "prepared", id: "item", native_key: nativeKey, identity,
    judge_root: root, profile_id: "offline", packet_sha256: hashJson(packet) };
  const file = path.join(operation, "native-intents", `${sha256("item")}.json`);
  const verify = async (change, expected) => { await writeJsonAtomic(file, { ...intent, ...change }); await assert.rejects(reassessHitlQualification(qualified), { code: expected }); };
  await writeJsonAtomic(file, intent);
  assert.deepEqual((await reassessHitlQualification(qualified)).missing, ["item"]);
  const saved = await readFile(file);
  assert.deepEqual((await reassessHitlQualification(qualified)).missing, ["item"]);
  assert.deepEqual(await readFile(file), saved, "reassessment must not rewrite the old intent");
  for (const state of ["dispatch_intent", "accepted", "unknown", undefined]) await verify({ state }, "definition_qualification_outcome_unknown");
  await verify({ schema_id: undefined }, "definition_qualification_outcome_unknown");
  await verify({ profile_id: "foreign" }, "definition_qualification_outcome_unknown");
  await verify({ judge_root: path.join(home, "foreign") }, "definition_qualification_outcome_unknown");
  await verify({ packet_sha256: "b".repeat(64) }, "definition_qualification_invalid");
  await writeJsonAtomic(file, intent);
  for (const change of [{ shutdown_state: "cleanup_failed" }, { pid: process.pid }, { sessions: ["native-session"] }, { sessions: undefined }, { active_tree: true }, { daemon_id: "foreign" }]) {
    await writeJsonAtomic(stateFile, { ...state, ...change });
    await assert.rejects(reassessHitlQualification(qualified), { code: "judge_cleanup_unconfirmed" });
  }
  await writeJsonAtomic(stateFile, state);
  for (const change of [{ status: "failed" }, { profile_id: "foreign" }, { session_id: "native-session" }, { verdict_sha256: "c".repeat(64) }, { stop_operation_id: "judge-cleanup:missing" }]) {
    await writeJsonAtomic(cleanupFile, { ...cleanup, ...change });
    await assert.rejects(reassessHitlQualification(qualified), { code: "judge_cleanup_unconfirmed" });
  }
  await writeJsonAtomic(cleanupFile, cleanup);
  await writeJsonAtomic(path.join(root, "result.json"), { profile_id: "offline", session_id: "native-session" });
  await assert.rejects(reassessHitlQualification(qualified), { code: "judge_cleanup_unconfirmed" });
  await rm(path.join(root, "result.json"));
  const unexpected = path.join(root, "daemon/operations", sha256("unexpected"));
  await writeJsonAtomic(path.join(unexpected, "requested.json"), { operation: "session.create", operation_id: "unexpected", daemon_id: state.daemon_id });
  await assert.rejects(reassessHitlQualification(qualified), { code: "judge_cleanup_unconfirmed" });
  await rm(unexpected, { recursive: true });
  await writeJsonAtomic(file, { ...intent, packet_sha256: hashJson({ ...packet, question: "Foreign decision?" }) });
  await writeJsonAtomic(path.join(root, "packet.json"), { ...packet, question: "Foreign decision?" });
  await assert.rejects(reassessHitlQualification(qualified), { code: "definition_qualification_invalid" });
});
