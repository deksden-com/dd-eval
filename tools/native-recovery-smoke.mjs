import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { appendFile, mkdir, mkdtemp, symlink, writeFile } from "node:fs/promises";
import { setTimeout as delay } from "node:timers/promises";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { callDriver, judgeRuntimeEnvironment, loadProfile, provisionRuntimeEngine } from "../lib/runner.mjs";
import { commandJson } from "../lib/process-json.mjs";
import { writeJsonAtomic } from "../lib/runner-events.mjs";
import { errorRecord } from "../lib/operation-errors.mjs";

// Explicit live qualification: two to four read-only prompts, no business workflow.
const profileId = process.argv[2];
if (!profileId || process.argv.slice(3).some(arg => !["--scope-stop", "--scope-pause", "--scope-pause-twice", "--scope-active-stop"].includes(arg))) throw new Error("Usage: node tools/native-recovery-smoke.mjs <profile-id> [--scope-stop | --scope-pause | --scope-pause-twice | --scope-active-stop]");
const activeStop = process.argv.includes("--scope-active-stop");
const pauseCycles = process.argv.includes("--scope-pause-twice") ? 2 : 1;
const scopePause = activeStop || pauseCycles === 2 || process.argv.includes("--scope-pause");
const scopeStop = scopePause || process.argv.includes("--scope-stop");
const profile = (await loadProfile(profileId)).value;
const base = path.join(process.env.DD_EVAL_HOME ?? path.join(os.homedir(), ".dd-eval"), "conformance");
await mkdir(base, { recursive: true });
const root = await mkdtemp(path.join(base, `${profile.driver ?? profile.harness}-recovery-`));
const state = path.join(root, "drivers", "daemon");
const args = ["--state-dir", state, "--cwd", root, "--journal", path.join(root, "driver.jsonl")];
const runtimeRoot = path.join(root, "runtime");
const env = { DD_FLOW_CONFIG_HOME: runtimeRoot };
if (profile.harness === "codex-desktop") {
  env.CODEX_HOME = path.join(root, "codex-home"); await mkdir(env.CODEX_HOME);
  await symlink(path.join(process.env.CODEX_HOME ?? path.join(os.homedir(), ".codex"), "auth.json"), path.join(env.CODEX_HOME, "auth.json"));
}
const call = command => callDriver(profile, [...command, ...args], { cwd: root, env });
const assistantText = receipt => receipt.assistant_text ?? receipt.result?.response ?? receipt.result?.text ?? receipt.text ?? "";
const start = ["daemon", "start", ...(["codex-desktop", "zcode-acp"].includes(profile.harness) ? [] : ["--no-flow"])];
const marker = `RECOVERY-${randomUUID()}`;
const scopeId = `smoke-${randomUUID()}`;
const control = (action, extra = []) => commandJson(path.join(runtimeRoot, "bin", "dd-flow"), ["runtime", "scope", action, "--scope-id", scopeId,
  ...(action === "stop" ? ["--request-id", `${scopeId}:stop`] : []), ...extra], { cwd: root, env: { ...env, DD_FLOW_HOME: runtimeRoot } });
const waitScope = async (name, ready) => {
  const deadline = Date.now() + 90_000;
  do {
    result[name] = await control("status");
    if (ready(result[name])) return result[name];
    assert.notEqual(result[name].worker?.status, "failed", JSON.stringify(result[name]));
    await delay(1_000);
  } while (Date.now() < deadline);
  throw new Error(`Scope ${name} did not settle within 90 seconds; see ${name} in receipt.json`);
};
const result = { schema_id: "dd-eval/native-recovery-smoke@1", root, profile_id: profileId, started_at: new Date().toISOString(), capability: "retained_root_after_clean_daemon_stop" };
let running = false;
let activePrompt;
try {
  result.engine = await provisionRuntimeEngine(root, runtimeRoot);
  if (scopeStop) {
    Object.assign(env, judgeRuntimeEnvironment({ runtimeRoot, daemonState: state, profile, codexHome: env.CODEX_HOME,
      resourceHome: path.join(root, "resources"), budget: { schema_id: "dd-flow/runtime-budget@1", scope_id: scopeId, per_harness: {} } }));
    result.scope_id = scopeId;
  }
  const { recoverySettlement } = await import(pathToFileURL(path.join(runtimeRoot, 'harness-runtime/lib/driver-recovery.mjs')).href);
  if (profile.harness === "opencode-server") { await call(start); running = true; }
  result.doctor = await call(['doctor']);
  if (!running) { await call(start); running = true; }
  const created = await call(["session", "create"]);
  const sessionId = created.provider_session_id ?? created.session_id;
  assert.equal(typeof sessionId, "string"); result.session_id = sessionId;
  result.first = await call(["session", "prompt", "--session-id", sessionId, "--prompt", `Read-only native-session qualification. Do not call tools or access files. Remember this exact marker for the next turn: ${marker}. Reply only READY.`]);
  assert.equal(assistantText(result.first).trim(), "READY", `Initial native turn did not acknowledge the marker: ${JSON.stringify(result.first.result ?? result.first)}`);
  await call(["daemon", "stop"]); running = false;
  result.first_settlement = await recoverySettlement(path.join(root, "drivers"));
  await call([...start, "--session-id", sessionId]); running = true;
  result.second = await call(["session", "prompt", "--session-id", sessionId, "--prompt", "Without tools or file access, reply only with the exact marker I asked you to remember in the preceding turn."]);
  const answer = assistantText(result.second);
  assert.equal(answer.trim(), marker);
  assert.equal(result.second.provider_session_id ?? result.second.session_id, sessionId);
  if (activeStop) {
    assert.equal(profile.harness, "codex-desktop", "Active-tree probe currently verifies Codex tree observations only");
    activePrompt = call(["session", "prompt", "--session-id", sessionId, "--prompt",
      "Technical native child cancellation qualification, not product work. Explicitly use your native subagent mechanism to launch exactly one child. The child must run one read-only command: node -e 'setTimeout(() => console.log(\"done\"), 60000)'. It must not access files, use the network, modify anything, or create children. You must wait for that child; do not close it early or start replacements. External operator control will interrupt this tree."])
      .then(receipt => { result.active_prompt = { completed: true, receipt }; }, error => { result.active_prompt = { completed: false, error: errorRecord(error) }; });
    const deadline = Date.now() + 60_000;
    do {
      result.active_tree = await call(["session", "inspect", "--session-id", sessionId]);
      const ids = result.active_tree.tree_session_ids ?? [];
      const unsettled = result.active_tree.unsettled_sessions ?? [];
      if (ids.some(id => id !== sessionId && unsettled.includes(id))) break;
      assert.equal(result.active_prompt, undefined, "Native prompt ended before an active child was observed");
      await delay(1_000);
    } while (Date.now() < deadline);
    assert.ok((result.active_tree.tree_session_ids ?? []).some(id => id !== sessionId && (result.active_tree.unsettled_sessions ?? []).includes(id)), "No active native child was observed; do not claim active-tree stop");
  }
  if (scopePause) {
    const manifestPath = path.join(root, "manifest.json"), bytes = JSON.stringify({ run_id: scopeId, executions: [] });
    await writeFile(manifestPath, bytes);
    const manifest = { schema_id: "dd-flow/runtime-scope-manifest@1", scope_id: scopeId, manifest_path: manifestPath,
      manifest_sha256: createHash("sha256").update(bytes).digest("hex"), execution_ids: [] };
    result.scope_cycles = [];
    for (let cycle = 1; cycle <= pauseCycles; cycle++) {
    const mode = activeStop ? "stop" : "pause", pauseRequest = `${mode}-${cycle}`;
    await appendFile(path.join(root, "events.jsonl"), JSON.stringify({ specversion: "1.0", id: pauseRequest, source: "native-smoke", time: new Date().toISOString(), runid: scopeId,
      type: "dev.dd.eval.control.requested", data: { sequence: cycle, mode, request_id: pauseRequest } }) + "\n");
    result.scope_pause = await control("control", ["--mode", mode, "--request-id", pauseRequest, "--manifest-json", JSON.stringify(manifest)]);
    const paused = await waitScope("scope_paused", status => status.drain?.physical_settled === true && status.drain.generation === result.scope_pause.control.generation);
    assert.equal(paused.dispatch_blocked, true);
    assert.equal(paused.drain.capture.native_bindings.length, 1, "Only the current native owner may resume");
    if (activePrompt) await activePrompt;
    assert.equal(paused.control.generation, cycle);
    result.scope_resume = await control("resume", ["--request-id", `resume-${cycle}`, "--generation", String(paused.control.generation), "--capture-key", paused.drain.capture.journal.artifact_key]);
    await waitScope("scope_released", status => status.release?.current === true && status.dispatch_blocked === false);
    result.third = await call(["session", "prompt", "--session-id", sessionId, "--prompt", "Without tools or file access, reply only with the exact marker I asked you to remember earlier."]);
    assert.equal(assistantText(result.third).trim(), marker);
    assert.equal(result.third.provider_session_id ?? result.third.session_id, sessionId);
    result.scope_cycles.push({ cycle, paused: result.scope_paused, resume: result.scope_resume, released: result.scope_released, prompt: result.third });
    }
    result.scope_pause_capability = activeStop ? "active_native_child_stop_resume_same_root" : "idle_native_judge_pause_resume_same_session";
  }
  if (scopeStop) {
    result.scope_before = await control("status");
    assert.ok(result.scope_before.processes.length > 0, "Scope stop must cover registered native processes");
    result.scope_stop = await control("stop");
    assert.equal(result.scope_stop.settled, true, JSON.stringify(result.scope_stop));
    assert.ok(result.scope_stop.nodes.length > 0);
    running = false;
    result.scope_stop_replay = await control("stop");
    assert.equal(result.scope_stop_replay.settled, true, JSON.stringify(result.scope_stop_replay));
    result.scope_stop_capability = "idle_native_judge_scope_stop_and_replay";
  }
  result.status = "passed";
} catch (error) {
  result.status = "failed"; result.error = errorRecord(error); process.exitCode = 1;
} finally {
  if (scopePause && result.scope_pause && running) {
    try { result.scope_cleanup = await control("stop"); if (result.scope_cleanup.settled) running = false; }
    catch (error) { result.scope_cleanup_error = errorRecord(error); }
  }
  if (running) {
    try { await call(["daemon", "stop", "--cancel-tree"]); }
    catch (error) { result.cleanup_error = errorRecord(error); result.status = "failed"; process.exitCode = 1; }
  }
  if (activePrompt) await activePrompt;
  result.finished_at = new Date().toISOString();
  await writeJsonAtomic(path.join(root, "receipt.json"), result);
  process.stdout.write(`${JSON.stringify({ root, status: result.status, session_id: result.session_id, error: result.error, cleanup_error: result.cleanup_error })}\n`);
}
