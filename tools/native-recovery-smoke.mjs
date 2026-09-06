import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdir, mkdtemp, symlink } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { callDriver, loadProfile } from "../lib/runner.mjs";
import { recoverySettlement } from "../lib/driver-recovery.mjs";
import { writeJsonAtomic } from "../lib/runner-events.mjs";
import { errorRecord } from "../lib/operation-errors.mjs";

// Explicit live qualification: two read-only prompts, no business workflow.
const profileId = process.argv[2];
if (!profileId) throw new Error("Usage: node tools/native-recovery-smoke.mjs <profile-id>");
const profile = (await loadProfile(profileId)).value;
const base = path.join(process.env.DD_EVAL_HOME ?? path.join(os.homedir(), ".dd-eval"), "conformance");
await mkdir(base, { recursive: true });
const root = await mkdtemp(path.join(base, `${profile.driver ?? profile.harness}-recovery-`));
const state = path.join(root, "drivers", "daemon");
const args = ["--state-dir", state, "--cwd", root, "--journal", path.join(root, "driver.jsonl")];
const env = { DD_FLOW_CONFIG_HOME: process.env.DD_FLOW_CONFIG_HOME ?? path.join(os.homedir(), ".dd-flow") };
if (profile.harness === "codex-desktop") {
  env.CODEX_HOME = path.join(root, "codex-home"); await mkdir(env.CODEX_HOME);
  await symlink(path.join(process.env.CODEX_HOME ?? path.join(os.homedir(), ".codex"), "auth.json"), path.join(env.CODEX_HOME, "auth.json"));
}
const call = command => callDriver(profile, [...command, ...args], { cwd: root, env });
const start = ["daemon", "start", ...(["codex-desktop", "zcode-acp"].includes(profile.harness) ? [] : ["--no-flow"])];
const marker = `RECOVERY-${randomUUID()}`;
const result = { schema_id: "dd-eval/native-recovery-smoke@1", root, profile_id: profileId, started_at: new Date().toISOString(), capability: "retained_root_after_clean_daemon_stop" };
let running = false;
try {
  await call(start); running = true;
  const created = await call(["session", "create"]);
  const sessionId = created.provider_session_id ?? created.session_id;
  assert.equal(typeof sessionId, "string"); result.session_id = sessionId;
  result.first = await call(["session", "prompt", "--session-id", sessionId, "--prompt", `Read-only native-session qualification. Do not call tools or access files. Remember this exact marker for the next turn: ${marker}. Reply only READY.`]);
  await call(["daemon", "stop"]); running = false;
  result.first_settlement = await recoverySettlement(path.join(root, "drivers"));
  await call([...start, "--session-id", sessionId]); running = true;
  result.second = await call(["session", "prompt", "--session-id", sessionId, "--prompt", "Without tools or file access, reply only with the exact marker I asked you to remember in the preceding turn."]);
  const answer = result.second.assistant_text ?? result.second.result?.response ?? result.second.result?.text ?? result.second.text ?? "";
  assert.equal(answer.trim(), marker);
  assert.equal(result.second.provider_session_id ?? result.second.session_id, sessionId);
  result.status = "passed";
} catch (error) {
  result.status = "failed"; result.error = errorRecord(error); process.exitCode = 1;
} finally {
  if (running) {
    try { await call(["daemon", "stop", "--cancel-tree"]); }
    catch (error) { result.cleanup_error = errorRecord(error); result.status = "failed"; process.exitCode = 1; }
  }
  result.finished_at = new Date().toISOString();
  await writeJsonAtomic(path.join(root, "receipt.json"), result);
  process.stdout.write(`${JSON.stringify({ root, status: result.status, session_id: result.session_id, error: result.error, cleanup_error: result.cleanup_error })}\n`);
}
