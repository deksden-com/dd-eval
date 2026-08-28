import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { access, mkdtemp, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import test from "node:test";

const exec = promisify(execFile);
const cli = path.resolve("bin/dd-zcode.mjs");

async function run(args) {
  const { stdout } = await exec(process.execPath, [cli, ...args, "--json"], { timeout: 15_000 });
  return JSON.parse(stdout);
}

test("daemon preserves a live background tree across CLI processes and cancels it", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "dd-zcode-daemon-"));
  const stateDir = path.join(root, "state");
  const bridge = path.join(root, "fake-acp.mjs");
  const zcode = path.join(root, "fake-zcode.mjs");
  const journal = path.join(root, "evidence", "events.jsonl");
  await writeFile(zcode, `if (process.argv.includes("--version")) process.stdout.write("0.16.5\\n");`);
  await writeFile(bridge, `
    import readline from "node:readline";
    if (process.argv.includes("--version")) { process.stdout.write("0.13.1\\n"); process.exit(0); }
    if (process.argv.includes("--dd-harness-version")) { process.stdout.write("dd-zcode-harness@1\\n"); process.exit(0); }
    let running = false; let rootRunning = false; let pendingPrompt = null;
    let profile = { provider: "builtin:zai-coding-plan", model: "GLM-5.3", reasoning: "high", mode: "yolo" };
    const send = (value) => process.stdout.write(JSON.stringify(value) + "\\n");
    readline.createInterface({ input: process.stdin }).on("line", (line) => {
      const message = JSON.parse(line);
      if (message.id === undefined) {
        if (message.method === "session/cancel" && pendingPrompt) {
          rootRunning = false; send({ jsonrpc: "2.0", id: pendingPrompt, result: { stopReason: "cancelled" } }); pendingPrompt = null;
        }
        return;
      }
      const { id, method, params = {} } = message; let result = {};
      if (method === "initialize") result = { protocolVersion: 1 };
      else if (method === "session/new") result = { sessionId: "adapter-root" };
      else if (method === "session/resume") result = {};
      else if (method === "zcode/session/resolve") result = { adapterSessionId: params.sessionId, providerSessionId: params.sessionId === "native-fork" ? "native-fork" : "native-root" };
      else if (method === "session/set_mode") profile.mode = params.modeId;
      else if (method === "session/setThoughtLevel") profile.reasoning = params.thoughtLevel;
      else if (method === "session/setModel") [profile.provider, profile.model] = params.modelId.split("\\\\");
      else if (method === "zcode/session/read") result = { projection: { status: rootRunning ? "running" : "idle" }, settings: { model: { current: { providerId: profile.provider, modelId: profile.model } }, thoughtLevel: { current: profile.reasoning }, mode: { current: profile.mode } } };
      else if (method === "zcode/session/subagents") result = running ? { running: [{ agentId: "agent-bg", childSessionId: "child-bg" }], ended: { total: 0, items: [] } } : { running: [], ended: { total: 1, items: [{ agentId: "agent-bg", status: "cancelled" }] } };
      else if (method === "zcode/session/usage") result = { inputTokens: 12, outputTokens: 3 };
      else if (method === "session/cancelBackgroundTask") { running = false; result = { cancelled: true, taskId: params.taskId }; }
      else if (method === "session/prompt" && params.prompt?.[0]?.text === "long") { rootRunning = true; pendingPrompt = id; return; }
      else if (method === "session/prompt") { running = params.prompt?.[0]?.text === "background"; result = { stopReason: "end_turn" }; }
      else if (method === "session/fork") result = { forkedSessionId: "native-fork" };
      send({ jsonrpc: "2.0", id, result });
    });
  `);
  const daemonArgs = ["--state-dir", stateDir, "--cwd", root, "--journal", journal, "--zcode-acp-bin", bridge, "--zcode-path", zcode];
  const profileArgs = ["--provider", "builtin:zai-coding-plan", "--model", "GLM-5.3", "--reasoning", "high", "--mode", "yolo"];
  try {
    const started = await run(["daemon", "start", ...daemonArgs]);
    assert.equal(started.shutdown_state, "running");
    assert.equal((await stat(path.join(stateDir, "daemon.sock"))).mode & 0o777, 0o600);
    const created = await run(["session", "create", "--state-dir", stateDir, ...profileArgs, "--prompt", "prime"]);
    assert.equal(created.provider_session_id, "native-root");
    const prompted = await run(["session", "prompt", "--state-dir", stateDir, "--session-id", "native-root", "--adapter-session-id", "adapter-root", ...profileArgs, "--prompt", "background"]);
    assert.equal(prompted.evidence.subagents.running[0].agentId, "agent-bg");
    const inspected = await run(["session", "inspect", "--state-dir", stateDir, "--session-id", "native-root", "--adapter-session-id", "adapter-root"]);
    assert.equal(inspected.subagents.running.length, 1);
    await assert.rejects(
      () => run(["daemon", "stop", "--state-dir", stateDir]),
      (error) => JSON.parse(error.stderr).code === "tree_not_settled"
    );
    const cancelled = await run(["session", "cancel", "--state-dir", stateDir, "--session-id", "native-root", "--adapter-session-id", "adapter-root"]);
    assert.equal(cancelled.cancellations[0].cancelled, true);
    assert.equal(cancelled.after.running.length, 0);
    const longPrompt = run(["session", "prompt", "--state-dir", stateDir, "--session-id", "native-root", "--adapter-session-id", "adapter-root", ...profileArgs, "--prompt", "long"]);
    await new Promise((resolve) => setTimeout(resolve, 150));
    await assert.rejects(
      () => run(["session", "prompt", "--state-dir", stateDir, "--session-id", "native-root", "--adapter-session-id", "adapter-root", ...profileArgs, "--prompt", "prime"]),
      (error) => JSON.parse(error.stderr).code === "operation_busy"
    );
    const rootCancelled = await run(["session", "cancel", "--state-dir", stateDir, "--session-id", "native-root", "--adapter-session-id", "adapter-root"]);
    assert.equal(rootCancelled.after.running.length, 0);
    assert.equal((await longPrompt).turn.stopReason, "cancelled");
    const stopped = await run(["daemon", "stop", "--state-dir", stateDir]);
    assert.equal(stopped.clean, true);
    await new Promise((resolve) => setTimeout(resolve, 100));
    await assert.rejects(() => access(path.join(stateDir, "daemon.sock")));
    await assert.rejects(
      () => run(["daemon", "start", ...daemonArgs]),
      (error) => JSON.parse(error.stderr).code === "daemon_state_terminal"
    );

    const crashState = path.join(root, "crash-state");
    const crashArgs = ["--state-dir", crashState, ...daemonArgs.slice(2)];
    const restarted = await run(["daemon", "start", ...crashArgs]);
    await run(["session", "create", "--state-dir", crashState, ...profileArgs, "--prompt", "prime"]);
    await run(["session", "prompt", "--state-dir", crashState, "--session-id", "native-root", "--adapter-session-id", "adapter-root", ...profileArgs, "--prompt", "background"]);
    process.kill(restarted.pid, "SIGKILL");
    await new Promise((resolve) => setTimeout(resolve, 200));
    await assert.rejects(
      () => run(["daemon", "start", ...crashArgs]),
      (error) => JSON.parse(error.stderr).code === "invalid_harness_crash"
    );
  } finally {
    try { await run(["daemon", "stop", "--state-dir", stateDir, "--cancel-tree"]); } catch {}
    try { await run(["daemon", "stop", "--state-dir", path.join(root, "crash-state"), "--cancel-tree"]); } catch {}
    await rm(root, { recursive: true, force: true });
  }
});
