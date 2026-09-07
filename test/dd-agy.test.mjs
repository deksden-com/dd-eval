import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import net from "node:net";
import path from "node:path";
import { doctor, usageSnapshot } from "../lib/dd-agy.mjs";
import { callDaemon, startDaemon, stopDaemon, Runtime } from "../lib/dd-agy-daemon.mjs";

test("AGY scopes Stop observations by turn and native step, not a reused execution counter", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "dd-agy-stop-scope-"));
  const paths = { state: path.join(root, "daemon.json"), journal: path.join(root, "events.jsonl") };
  const runtime = new Runtime(paths, { config: { daemonId: "d", cwd: root } });
  runtime.init = { conversation_id: "root" };
  try {
    await runtime.observeHook("Stop", { conversationId: "root", executionNum: 4, fullyIdle: true, transcriptPath: "transcript" });
    const saved = JSON.parse(await readFile(paths.state, "utf8"));
    const resumed = new Runtime(paths, saved);
    assert.equal(resumed.sessionObservations.get("root").stop.executionNum, 4);
    resumed.init = runtime.init;
    resumed.sessionObservations.set("root", { ...resumed.sessionObservations.get("root"), step_floor: 4, stop: null });
    await resumed.observeHook("Stop", { conversationId: "root", executionNum: 4, stepIdx: 4, fullyIdle: false });
    assert.equal(resumed.sessionObservations.get("root").stop, null);
    await resumed.observeHook("Stop", { conversationId: "root", executionNum: 5, fullyIdle: true });
    assert.equal(resumed.sessionObservations.get("root").stop.executionNum, 5);
    await resumed.observeHook("Stop", { conversationId: "root", executionNum: 0, fullyIdle: false });
    assert.equal(resumed.sessionObservations.get("root").stop.fullyIdle, false);
    await resumed.observeHook("Stop", { conversationId: "root", executionNum: 5, fullyIdle: true });
    resumed.lastActivityAt = "sentinel";
    await resumed.observeHook("Stop", { conversationId: "root", executionNum: 5, fullyIdle: true });
    assert.equal(resumed.lastActivityAt, "sentinel");
    resumed.descendants.set("child", { provider_session_id: "child", parent_provider_session_id: "root", status: "unknown" });
    await resumed.persist();
    const restored = new Runtime(paths, JSON.parse(await readFile(paths.state, "utf8")));
    assert.equal(restored.descendants.get("child").parent_provider_session_id, "root");
    await resumed.observeHook("Stop", { conversationId: "child", executionNum: 1, fullyIdle: true });
    assert.equal(resumed.descendants.get("child").status, "completed");
    const hook = { conversationId: "root", stepIdx: 5, toolCall: { name: "run_command", args: "same command" } };
    const first = await resumed.observeHook("PreToolUse", { ...hook, executionNum: 5 });
    const second = await resumed.observeHook("PreToolUse", { ...hook, executionNum: 6 });
    assert.notEqual(first.event_id, second.event_id);
    resumed.observeProviderActivity({ event: "step_update", step_update: { step_id: "1", state: "RUNNING" } });
    resumed.lastActivityAt = "sentinel";
    resumed.observeProviderActivity({ event: "step_update", step_update: { step_id: "1", state: "RUNNING" } });
    assert.equal(resumed.lastActivityAt, "sentinel");
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("AGY ignores prior terminal results, keeps RUNNING open and persists real step identities", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "dd-agy-terminal-scope-"));
  const paths = { state: path.join(root, "daemon.json"), journal: path.join(root, "events.jsonl") };
  const journal = path.join(root, "subject", "events.jsonl");
  const runtime = new Runtime(paths, { config: { daemonId: "d", cwd: root, journal } });
  runtime.init = { conversation_id: "root" };
  let resolved = null, rejected = null;
  try {
    runtime.lastResult = { conversation_id: "root", status: "SUCCESS", num_turns: 4 };
    await runtime.finishTurn({ conversation_id: "root", status: "ERROR", num_turns: 3, error: "old quota" });
    assert.equal(runtime.lastResult.status, "SUCCESS");
    runtime.active = { resolve: value => { resolved = value; }, reject: error => { rejected = error; } };
    await runtime.finishTurn({ conversation_id: "root", status: "RUNNING", num_turns: 5 });
    assert.equal(resolved, null); assert.ok(runtime.active);
    assert.equal(rejected, null); assert.ok(runtime.active);
    const step = { conversation_id: "root", step_index: 100, step_type: "tool", state: "DONE", tool_name: "run_command" };
    runtime.observeStep(step); runtime.observeStep(step);
    await runtime.persist();
    const restored = new Runtime(paths, JSON.parse(await readFile(paths.state, "utf8")));
    restored.init = runtime.init; restored.observeStep(step);
    assert.equal(restored.toolSnapshot().total, 1);
    assert.equal(restored.toolSnapshot().completeness, "complete");
    await runtime.finishTurn({ conversation_id: "root", status: "SUCCESS", num_turns: 5, response: "done" });
    assert.equal(resolved.assistant_text, "done"); assert.equal(resolved.settled, true);
    await runtime.finishTurn({ conversation_id: "root", status: "ERROR", num_turns: 4, error: "late old quota" });
    assert.equal(runtime.lastResult.status, "SUCCESS");
    assert.equal(runtime.lastResult.num_turns, 5);
    runtime.active = { resolve: () => assert.fail("native command rejection cannot succeed"), reject: error => { rejected = error; } };
    await runtime.finishTurn({ conversation_id: "root", status: "ERROR", num_turns: 0, error: "native command unavailable" });
    assert.equal(rejected.code, "agy_provider_failed");
    assert.equal(runtime.active, null);
    await assert.rejects(runtime.finishTurn({ status: "UNKNOWN" }), { code: "agy_terminal_result_invalid" });
    assert.match(await readFile(journal, "utf8"), /stale_terminal_observed/);
    assert.equal(await readFile(journal, "utf8"), await readFile(paths.journal, "utf8"));
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("AGY refuses an unconfirmed child hook and does not treat an unknown child as settled", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "dd-agy-child-identity-"));
  const paths = { state: path.join(root, "daemon.json"), journal: path.join(root, "events.jsonl") };
  const runtime = new Runtime(paths, { config: { daemonId: "d", cwd: root } });
  runtime.init = { conversation_id: "root" };
  runtime.lastResult = { status: "SUCCESS" };
  runtime.sessionObservations.set("root", { stop: { fullyIdle: true } });
  runtime.descendants.set("child", { provider_session_id: "child", parent_provider_session_id: "root", status: "unknown" });
  try {
    assert.equal(runtime.receipt().settled, false);
    await assert.rejects(runtime.observeHook("PreToolUse", { conversationId: "foreign", toolCall: { name: "run_command", args: {} } }), error => error.code === "agy_child_identity_unconfirmed");
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("AGY accepts a terminal root result when AGY omits its root Stop hook", () => {
  const runtime = new Runtime({ state: "/unused", journal: "/unused" }, { config: { daemonId: "d", cwd: "/tmp" } });
  runtime.init = { conversation_id: "root" };
  runtime.lastResult = { status: "SUCCESS" };
  runtime.descendants.set("child", { provider_session_id: "child", parent_provider_session_id: "root", status: "completed" });
  assert.equal(runtime.receipt().settled, true);
  runtime.sessionObservations.set("root", { stop: { fullyIdle: false } });
  assert.equal(runtime.receipt().settled, false);
});

test("AGY usage preserves missing counters as unknown", () => {
  assert.equal(usageSnapshot({ usage: { input_tokens: null, total_tokens: undefined } }).input_tokens, null);
  assert.equal(usageSnapshot({ usage: { input_tokens: null, total_tokens: undefined } }).total_tokens, null);
  assert.equal(usageSnapshot({ usage: { input_tokens: 0 } }).input_tokens, 0);
});

test("AGY prompt timeout reports the final native activity instead of runner progress", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "dd-agy-liveness-"));
  const state = path.join(root, "state"); const socket = path.join(state, "daemon.sock");
  await mkdir(state);
  const server = net.createServer((connection) => {
    connection.setEncoding("utf8"); connection.once("data", (line) => {
      const request = JSON.parse(line);
      if (request.operation !== "daemon.status") return;
      connection.end(`${JSON.stringify({ ok: true, result: { active_tree: true, last_activity_at: "2000-01-01T00:00:00.000Z" } })}\n`);
    });
  });
  try {
    await new Promise((resolve, reject) => { server.once("error", reject); server.listen(socket, resolve); });
    await assert.rejects(callDaemon(state, "session.prompt", {}, 25), (error) => error.code === "subject_liveness_timeout" && error.details.last_activity_at === "2000-01-01T00:00:00.000Z");
  } finally {
    await new Promise((resolve) => server.close(resolve));
    await rm(root, { recursive: true, force: true });
  }
});

test("AGY daemon enforces liveness for a silent live provider", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "dd-agy-live-liveness-"));
  const fake = path.join(root, "fake-agy.mjs"), state = path.join(root, "state"), project = path.join(root, "project"), flowHome = path.join(root, "flow-home");
  await mkdir(project); await mkdir(flowHome);
  await writeFile(fake, `#!/usr/bin/env node
const a=process.argv.slice(2);if(a.includes('--version')){console.log('1');process.exit()}if(a.includes('models')){console.log('gemini-3.1-pro-high');process.exit()}console.log(JSON.stringify({event:'init',conversation_id:'s',init:{model:'gemini-3.1-pro-high',permission_mode:'always-proceed'}}));process.stdin.resume();
`, { mode: 0o755 });
  try {
    await startDaemon({ stateDir: state, cwd: project, bin: fake, projectRoot: project, ddFlowBin: fake, ddFlowHome: flowHome, entryPath: path.resolve("bin/dd-agy.mjs") });
    await assert.rejects(callDaemon(state, "session.prompt", { sessionId: "s", prompt: "wait" }, 1_000), error => error.code === "subject_liveness_timeout");
  } finally { try { await stopDaemon({ stateDir: state, cancelTree: true, timeoutMs: 1000 }); } catch {} await rm(root, { recursive: true, force: true }); }
});

test("dd-agy owns one streaming conversation and rejects headless fork semantics", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "dd-agy-test-"));
  const fake = path.join(root, "fake-agy.mjs"), flow = path.join(root, "fake-flow.mjs"), registry = path.join(root, "registry.log"), state = path.join(root, `state-${"x".repeat(180)}`), project = path.join(root, "project"), flowHome = path.join(root, "flow-home");
  await mkdir(project); await mkdir(flowHome);
  await mkdir(path.join(project, ".agents"));
  await writeFile(path.join(project, ".agents", "hooks.json"), JSON.stringify({
    existing: { Stop: [] },
    PreToolUse: [{ matcher: "*", hooks: [{ type: "command", command: `'${process.execPath}' '${path.resolve("bin/dd-agy.mjs")}' hook handle --old`, timeout: 30 }] }],
    Stop: [{ type: "command", command: `'${process.execPath}' '${path.resolve("bin/dd-agy.mjs")}' hook handle --old`, timeout: 30 }]
  }));
  await writeFile(fake, `#!/usr/bin/env node
const args=process.argv.slice(2); if(args.includes('--version')){console.log('1.1.25');process.exit(0)} if(args.includes('models')){console.log('gemini-3.1-pro-high available');process.exit(0)}
console.log(JSON.stringify({event:'init',conversation_id:'agy-root',init:{model:'gemini-3.1-pro-high',cwd:process.cwd(),permission_mode:'always-proceed'}}));
process.stdin.setEncoding('utf8'); let buffer=''; process.stdin.on('data',chunk=>{buffer+=chunk;let i;while((i=buffer.indexOf('\\n'))>=0){const line=buffer.slice(0,i);buffer=buffer.slice(i+1);if(!line)continue;const message=JSON.parse(line);const text=message.message?.content??'';console.log(JSON.stringify({event:'step_update',step_update:{step_type:'tool',state:'DONE',tool_name:'run_command',tool_info:{}}}));console.log(JSON.stringify({event:'result',result:{conversation_id:'agy-root',status:'SUCCESS',response:text,usage:{input_tokens:3,output_tokens:2,total_tokens:5}}}))}});
`, { mode: 0o755 });
  await writeFile(flow, `#!/usr/bin/env node
import { appendFileSync } from 'node:fs';
appendFileSync(${JSON.stringify(registry)}, process.argv.slice(2).join(' ')+'\\n');
const kind=process.argv[process.argv.indexOf('--kind')+1];
if(process.argv[4] === 'register') process.stdout.write(JSON.stringify({process:{id:'PROC-'+kind,lease_token:'lease-'+kind}})+'\\n');
else process.stdout.write('{"ok":true}\\n');
`, { mode: 0o755 });
  const previousResourceHome = process.env.DD_FLOW_RESOURCE_HOME;
  process.env.DD_FLOW_RESOURCE_HOME = path.join(root, "resources");
  try {
    assert.equal((await doctor({ bin: fake })).compatible, true);
    const status = await startDaemon({ stateDir: state, cwd: project, bin: fake, projectRoot: project, ddFlowBin: flow, ddFlowHome: flowHome, entryPath: path.resolve("bin/dd-agy.mjs") });
    assert.equal(status.provider_ready, true);
    assert.match(status.config.temporary, /^\/tmp\/dd-agy-tmp-/);
    assert.ok(Buffer.byteLength(status.config.temporary) < 104);
    const created = await callDaemon(state, "session.create", {});
    assert.equal(created.provider_session_id, "agy-root"); assert.equal(created.result, null);
    for (const operation of ["prompt", "inspect", "cancel", "resume"]) {
      await assert.rejects(callDaemon(state, `session.${operation}`, { sessionId: "foreign", prompt: "must not run" }), error => error.code === "session_identity_mismatch");
    }
    const first = await callDaemon(state, "session.prompt", { sessionId: "agy-root", prompt: "specify" });
    assert.equal(first.result.status, "SUCCESS"); assert.equal(first.assistant_text, "specify"); assert.equal(first.usage.total_tokens, 5);
    const next = await callDaemon(state, "session.prompt", { sessionId: "agy-root", prompt: "answer" });
    assert.equal(next.result.response, "answer");
    const config = JSON.parse(await readFile(path.join(state, "gemini", "config", "hooks.json"), "utf8"));
    assert.ok(config["dd-flow"].PreToolUse);
    const workspaceHooks = JSON.parse(await readFile(path.join(project, ".agents", "hooks.json"), "utf8"));
    assert.deepEqual(workspaceHooks.PreToolUse, config["dd-flow"].PreToolUse);
    assert.deepEqual(workspaceHooks.PostToolUse, config["dd-flow"].PostToolUse);
    assert.deepEqual(workspaceHooks.Stop, config["dd-flow"].Stop);
    assert.deepEqual(workspaceHooks.existing, { Stop: [] });
    assert.equal(status.config.workspaceHooksPath, path.join(status.config.projectRoot, ".agents", "hooks.json"));
    await stopDaemon({ stateDir: state });
    const terminal = JSON.parse(await readFile(path.join(state, "daemon.json"), "utf8")); assert.equal(terminal.shutdown_state, "clean");
    const calls = await readFile(registry, "utf8");
    assert.match(calls, /agy-daemon/); assert.match(calls, /agy-provider/); assert.match(calls, /runtime process heartbeat --id PROC-agy-provider/); assert.match(calls, /runtime process finish/);
  } finally { if (previousResourceHome === undefined) delete process.env.DD_FLOW_RESOURCE_HOME; else process.env.DD_FLOW_RESOURCE_HOME = previousResourceHome; try { await stopDaemon({ stateDir: state, cancelTree: true, timeoutMs: 1000 }); } catch {} await rm(root, { recursive: true, force: true }); }
});

test("dd-agy reports a provider rejection before init and closes its daemon", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "dd-agy-init-failure-"));
  const fake = path.join(root, "fake-agy.mjs"), flow = path.join(root, "fake-flow.mjs"), registry = path.join(root, "registry.log"), state = path.join(root, "state"), project = path.join(root, "project"), flowHome = path.join(root, "flow-home");
  await mkdir(project); await mkdir(flowHome);
  await writeFile(fake, `#!/usr/bin/env node
const args=process.argv.slice(2); if(args.includes('--version')){console.log('1.1.25');process.exit(0)} if(args.includes('models')){console.log('gemini-3.1-pro-high available');process.exit(0)}
console.log(JSON.stringify({event:'result',result:{conversation_id:'',status:'ERROR',error:'provider rejected this account'}}));
`, { mode: 0o755 });
  await writeFile(flow, `#!/usr/bin/env node
import { appendFileSync } from 'node:fs';
appendFileSync(${JSON.stringify(registry)}, process.argv.slice(2).join(' ')+'\\n');
const kind=process.argv[process.argv.indexOf('--kind')+1];
if(process.argv[4] === 'register') process.stdout.write(JSON.stringify({process:{id:'PROC-'+kind,lease_token:'lease-'+kind}})+'\\n');
else process.stdout.write('{"ok":true}\\n');
`, { mode: 0o755 });
  const previousResourceHome = process.env.DD_FLOW_RESOURCE_HOME;
  process.env.DD_FLOW_RESOURCE_HOME = path.join(root, "resources");
  try {
    await assert.rejects(
      startDaemon({ stateDir: state, cwd: project, bin: fake, projectRoot: project, ddFlowBin: flow, ddFlowHome: flowHome, entryPath: path.resolve("bin/dd-agy.mjs") }),
      error => error.code === "agy_provider_rejected" && error.message === "provider rejected this account"
    );
    const terminal = JSON.parse(await readFile(path.join(state, "daemon.json"), "utf8"));
    assert.equal(terminal.shutdown_state, "failed");
    await assert.rejects(callDaemon(state, "daemon.status", {}, 250), error => error.code === "daemon_not_running");
    const calls = await readFile(registry, "utf8");
    assert.match(calls, /agy-provider/);
    assert.match(calls, /runtime process stop --id PROC-agy-provider .*--lease-token lease-agy-provider/);
  } finally {
    if (previousResourceHome === undefined) delete process.env.DD_FLOW_RESOURCE_HOME; else process.env.DD_FLOW_RESOURCE_HOME = previousResourceHome;
    await rm(root, { recursive: true, force: true });
  }
});
