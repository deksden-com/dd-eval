import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import net from "node:net";
import path from "node:path";
import { doctor, usageSnapshot } from "../lib/dd-agy.mjs";
import { callDaemon, startDaemon, stopDaemon } from "../lib/dd-agy-daemon.mjs";

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
    await assert.rejects(callDaemon(state, "session.prompt", { sessionId: "s", prompt: "wait" }, 50), error => error.code === "subject_liveness_timeout");
  } finally { try { await stopDaemon({ stateDir: state, cancelTree: true, timeoutMs: 1000 }); } catch {} await rm(root, { recursive: true, force: true }); }
});

test("dd-agy owns one streaming conversation and rejects headless fork semantics", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "dd-agy-test-"));
  const fake = path.join(root, "fake-agy.mjs"), flow = path.join(root, "fake-flow.mjs"), registry = path.join(root, "registry.log"), state = path.join(root, `state-${"x".repeat(180)}`), project = path.join(root, "project"), flowHome = path.join(root, "flow-home");
  await mkdir(project); await mkdir(flowHome);
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
    const first = await callDaemon(state, "session.prompt", { sessionId: "agy-root", prompt: "specify" });
    assert.equal(first.result.status, "SUCCESS"); assert.equal(first.assistant_text, "specify"); assert.equal(first.usage.total_tokens, 5);
    const next = await callDaemon(state, "session.prompt", { sessionId: "agy-root", prompt: "answer" });
    assert.equal(next.result.response, "answer");
    const config = JSON.parse(await readFile(path.join(state, "gemini", "config", "hooks.json"), "utf8"));
    assert.ok(config["dd-flow"].PreToolUse);
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
