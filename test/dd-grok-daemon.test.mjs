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
    if (process.argv.includes("version")) { process.stdout.write(JSON.stringify({currentVersion:"1.0.12 fake"})); process.exit(0); }
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
