import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import test from "node:test";

const exec = promisify(execFile); const cli = path.resolve("bin/dd-grok.mjs");
async function run(args) { const { stdout } = await exec(process.execPath, [cli, ...args, "--json"], { timeout: 15_000 }); return JSON.parse(stdout); }

test("Grok daemon copies explicit auth only into its private home", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "dd-grok-daemon-")); const stateDir = path.join(root, "state"); const grok = path.join(root, "fake-grok.mjs"); const flow = path.join(root, "fake-flow.mjs"); const auth = path.join(root, "source-auth.json"); const journal = path.join(root, "evidence", "events.jsonl");
  await writeFile(auth, '{"test":"credential"}\n', { mode: 0o600 });
  await writeFile(flow, "#!/usr/bin/env node\n");
  await writeFile(grok, `
    import readline from "node:readline";
    if (process.argv.includes("version")) { process.stdout.write(JSON.stringify({currentVersion:"1.0.16 fake"})); process.exit(0); }
    if (process.argv.includes("inspect")) { process.stdout.write(JSON.stringify({ configSources:{layers:[{role:"user",path:process.env.GROK_HOME+"/config.toml"}]}, hooks:[{source:{type:"user",path:process.env.GROK_HOME+"/hooks"}}], skills:[], agents:[], plugins:[], mcpServers:[], permissions:{sources:[]}, externalCompat:{remoteSettingsLoaded:false,cells:["claude","cursor","codex"].map(vendor=>({vendor,surface:"hooks",enabled:false}))}, configWarnings:[] })); process.exit(0); }
    readline.createInterface({input:process.stdin}).on("line", (line) => { const message=JSON.parse(line); if(message.id!==undefined && message.method==="initialize") process.stdout.write(JSON.stringify({jsonrpc:"2.0",id:message.id,result:{protocolVersion:1}})+"\\n"); });
  `);
  const args = ["--state-dir", stateDir, "--cwd", root, "--journal", journal, "--grok-bin", grok, "--auth-path", auth, "--model", "grok-4.6", "--reasoning", "high", "--dd-flow-bin", flow, "--dd-flow-home", root, "--project-root", root];
  try {
    const started = await run(["daemon", "start", ...args]); assert.equal(started.auth_status, "copied"); assert.equal(started.config_isolation.compatibility, "disabled"); assert.equal((await stat(path.join(stateDir, "daemon.sock"))).mode & 0o777, 0o600);
    assert.equal(await readFile(path.join(stateDir, "grok-home", "auth.json"), "utf8"), '{"test":"credential"}\n');
    assert.match(await readFile(path.join(stateDir, "grok-home", "config.toml"), "utf8"), /\[compat\.claude\]/);
    const state = await readFile(path.join(stateDir, "daemon.json"), "utf8"); assert.ok(!state.includes("credential"));
    assert.equal((await run(["daemon", "stop", "--state-dir", stateDir])).clean, true);
  } finally { try { await run(["daemon", "stop", "--state-dir", stateDir, "--cancel-tree"]); } catch {} await rm(root, { recursive: true, force: true }); }
});

test("Grok daemon keeps background subagents active until cancel", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "dd-grok-tree-")); const stateDir = path.join(root, "state"); const grok = path.join(root, "fake-grok.mjs"); const flow = path.join(root, "fake-flow.mjs"); const auth = path.join(root, "auth.json"); const journal = path.join(root, "events.jsonl");
  await writeFile(auth, "{}\n"); await writeFile(flow, "#!/usr/bin/env node\nprocess.stdin.resume();\n");
  await writeFile(grok, `
    import readline from "node:readline";
    if (process.argv.includes("version")) { process.stdout.write(JSON.stringify({currentVersion:"1.0.16 fake"})); process.exit(0); }
    if (process.argv.includes("inspect")) { process.stdout.write(JSON.stringify({ configSources:{layers:[{role:"user",path:process.env.GROK_HOME+"/config.toml"}]}, hooks:[], skills:[], agents:[], plugins:[], mcpServers:[], permissions:{sources:[]}, externalCompat:{remoteSettingsLoaded:false,cells:[]}, configWarnings:[] })); process.exit(0); }
    let running = false; const send = (value) => process.stdout.write(JSON.stringify(value) + "\\n");
    readline.createInterface({input:process.stdin}).on("line", (line) => { const message=JSON.parse(line); if(message.id===undefined) return; const {id,method,params={}}=message; let result={};
      if(method==="initialize") result={protocolVersion:1,_meta:{modelState:{currentModelId:"grok-4.6",availableModels:[{modelId:"grok-4.6",_meta:{reasoningEffort:"high"}}]}}};
      else if(method==="session/new") result={sessionId:"root"};
      else if(method==="session/load") result={};
      else if(method==="session/prompt") { running=params.prompt?.[0]?.text==="background"; result={stopReason:"end_turn"}; }
      else if(method==="_x.ai/session/info") result={result:{sessionId:params.sessionId,data:{cwd:${JSON.stringify(root)}}}};
      else if(method==="_x.ai/session/usage") result={result:{unavailable:true}};
      else if(method==="_x.ai/subagent/list_running") result={result:{subagents:running?[{sessionId:"child-bg"}]:[]}};
      else if(method==="_x.ai/subagent/cancel") { running=false; result={result:{cancelled:true}}; }
      send({jsonrpc:"2.0",id,result});
    });
  `);
  const daemon = ["--state-dir", stateDir, "--cwd", root, "--journal", journal, "--grok-bin", grok, "--auth-path", auth, "--model", "grok-4.6", "--reasoning", "high", "--dd-flow-bin", flow, "--dd-flow-home", root, "--project-root", root];
  try {
    await run(["daemon", "start", ...daemon]);
    await run(["session", "create", "--state-dir", stateDir, "--model", "grok-4.6", "--reasoning", "high", "--prompt", "prime"]);
    const prompted = await run(["session", "prompt", "--state-dir", stateDir, "--session-id", "root", "--model", "grok-4.6", "--reasoning", "high", "--prompt", "background"]);
    assert.equal(prompted.evidence.subagents.subagents[0].sessionId, "child-bg");
    assert.equal((await run(["daemon", "status", "--state-dir", stateDir])).active_tree, true);
    await assert.rejects(() => run(["session", "prompt", "--state-dir", stateDir, "--session-id", "root", "--model", "grok-4.6", "--reasoning", "high", "--prompt", "prime"]), (error) => JSON.parse(error.stderr).code === "tree_not_settled");
    await assert.rejects(() => run(["daemon", "stop", "--state-dir", stateDir]), (error) => JSON.parse(error.stderr).code === "tree_not_settled");
    await run(["session", "cancel", "--state-dir", stateDir, "--session-id", "root"]);
    assert.equal((await run(["daemon", "status", "--state-dir", stateDir])).active_tree, false);
    assert.equal((await run(["daemon", "stop", "--state-dir", stateDir])).clean, true);
  } finally { try { await run(["daemon", "stop", "--state-dir", stateDir, "--cancel-tree"]); } catch {} await rm(root, { recursive: true, force: true }); }
});
