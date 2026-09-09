import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, mkdir, writeFile, readFile, readdir, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { restoreStageSnapshot, provisionRuntimeEngine } from "../lib/runner.mjs";

const fixture = `import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const args = process.argv.slice(2), home = process.env.DD_FLOW_HOME;
const root = path.join(home, 'engines', 'fixture', '1');
const manifest = {schema_id:'dd-flow/engine-manifest@1',package_name:'fixture',package_version:'1',engine_version:'1',snapshot_root:root,entrypoint:'cli.mjs',integrity:{checksum:'a'.repeat(64)}};
fs.appendFileSync(process.env.TEST_RESTORE_LOG,JSON.stringify({args,home})+'\\n');
if(args[0]==='engine' && args[1]==='install') {
  fs.mkdirSync(path.join(root,'dist','harness-runtime'),{recursive:true});
  fs.writeFileSync(path.join(root,'dist','harness-runtime','selected-adapter.mjs'),'export const selected = true;');
  fs.copyFileSync(fileURLToPath(import.meta.url),path.join(root,'cli.mjs'));
  fs.writeFileSync(path.join(root,'engine.json'),JSON.stringify(manifest));
  console.log(JSON.stringify({ok:true}));
} else if(args[0]==='engine' && args[1]==='resolve') {
  console.log(JSON.stringify({selection:{selected:manifest}}));
} else if(args[0]==='run' && args[1]==='snapshot' && args[2]==='restore') {
  const existing = fs.existsSync(home)?fs.readdirSync(home):[];
  if(existing.some(name=>name!=='agent-profiles')) throw new Error('restore destination is not empty');
  if(process.env.DD_FLOW_ENGINE_MODE!=='1') throw new Error('importer must not route into destination');
  const runHome = path.join(home,'runs','RUN-001'); fs.mkdirSync(runHome,{recursive:true});
  fs.writeFileSync(path.join(runHome,'engine-binding.json'),JSON.stringify({engine:{package_name:'fixture',package_version:'1',engine_version:'1',integrity_checksum:(process.env.TEST_RESTORE_MISMATCH==='1'?'b':'a').repeat(64)}}));
  fs.writeFileSync(path.join(runHome,'retained.txt'),'restored history');
  console.log(JSON.stringify({run_id:'RUN-001',target_stage:'code',run_home:runHome,project_root:args[args.indexOf('--project-root')+1]}));
} else throw new Error('unexpected command '+JSON.stringify(args));
`;

test('qualification provisions an isolated selected runtime without starting a provider', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'eval-qualification-runtime-'));
  const keys = ['DD_FLOW_BIN', 'DD_FLOW_CONFIG_HOME', 'TEST_RESTORE_LOG'];
  const prior = Object.fromEntries(keys.map(key => [key, process.env[key]]));
  try {
    const config = path.join(root, 'config'), runtime = path.join(root, 'runtime');
    await mkdir(config);
    const settings = JSON.stringify({ schema_id: 'dd-flow/harness-config@1', harnesses: {} });
    await writeFile(path.join(config, 'harnesses.json'), settings);
    const executable = path.join(root, 'cli.mjs'), log = path.join(root, 'calls.jsonl');
    await writeFile(executable, fixture);
    process.env.DD_FLOW_BIN = executable; process.env.DD_FLOW_CONFIG_HOME = config; process.env.TEST_RESTORE_LOG = log;
    const selected = await provisionRuntimeEngine(root, runtime);
    assert.ok(selected.snapshot_root.startsWith(runtime + path.sep));
    assert.equal(await readFile(path.join(runtime, 'harnesses.json'), 'utf8'), settings);
    assert.equal(await readFile(path.join(runtime, 'harness-runtime/selected-adapter.mjs'), 'utf8'), 'export const selected = true;');
    assert.match(await readFile(path.join(runtime, 'bin/dd-flow'), 'utf8'), /DD_FLOW_BIN=/);
    const calls = (await readFile(log, 'utf8')).trim().split('\n').map(JSON.parse);
    assert.deepEqual(calls.map(call => call.args.slice(0, 2)), [['engine', 'install'], ['engine', 'resolve']]);
    assert.ok(calls.every(call => call.home === runtime));
    assert.deepEqual(await readdir(config), ['harnesses.json']);
  } finally {
    for (const [key, value] of Object.entries(prior)) { if (value === undefined) delete process.env[key]; else process.env[key] = value; }
    await rm(root, { recursive: true, force: true });
  }
});

for (const mismatch of [false, true]) test(`stage restore uses an external importer and checks RUN engine identity (mismatch: ${mismatch})`, async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "eval-restore-"));
  const prior = Object.fromEntries(["DD_FLOW_BIN", "DD_FLOW_CONFIG_HOME", "TEST_RESTORE_LOG", "TEST_RESTORE_MISMATCH"].map(key => [key, process.env[key]]));
  try {
    const config = path.join(root, "config"), home = path.join(root, "eval-home"), snapshot = path.join(home, "snapshot");
    await mkdir(config); await mkdir(snapshot, { recursive: true });
    await writeFile(path.join(config, "harnesses.json"), JSON.stringify({ schema_id: "dd-flow/harness-config@1", harnesses: {} }));
    const executable = path.join(root, "cli.mjs"), log = path.join(root, "calls.jsonl");
    await writeFile(executable, fixture);
    process.env.DD_FLOW_BIN = executable; process.env.DD_FLOW_CONFIG_HOME = config;
    process.env.TEST_RESTORE_LOG = log; process.env.TEST_RESTORE_MISMATCH = mismatch ? "1" : "0";
    const bytes = JSON.stringify({ schema_id: "dd-flow/eval-run-snapshot@5", purpose: "stage_entry", run_id: "RUN-001", stage_entry: "code" });
    await writeFile(path.join(snapshot, "snapshot.json"), bytes);
    const runtimeRoot = path.join(root, "runtime"), projectRoot = path.join(root, "project");
    const input = { home, stage: "code", runtimeRoot, projectRoot, entry: { snapshot: { kind: "run", run_id: "RUN-001", locator: "snapshot", manifest_sha256: createHash("sha256").update(bytes).digest("hex") } } };
    if (mismatch) await assert.rejects(restoreStageSnapshot(input), { code: "snapshot_engine_mismatch" });
    else {
      const result = await restoreStageSnapshot(input);
      assert.equal(result.engine.snapshot_root.startsWith(runtimeRoot + path.sep), true);
      assert.equal(await readFile(path.join(result.run_home, "retained.txt"), "utf8"), "restored history");
    }
    const calls = (await readFile(log, "utf8")).trim().split("\n").map(JSON.parse);
    const restore = calls.findIndex(call => call.args[0] === "run");
    assert.ok(restore > 0);
    assert.ok(calls.slice(0, restore).every(call => call.home !== runtimeRoot));
    assert.equal(calls[restore].home, runtimeRoot);
    assert.equal(calls.slice(restore + 1).some(call => call.home === runtimeRoot && call.args[1] === "install"), !mismatch);
    assert.ok(!(await readdir(root)).some(name => name.startsWith(".restore-engine-")));
  } finally {
    for (const [key, value] of Object.entries(prior)) { if (value === undefined) delete process.env[key]; else process.env[key] = value; }
    await rm(root, { recursive: true, force: true });
  }
});
