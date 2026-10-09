import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, mkdir, writeFile, readFile, rm, symlink } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { commandText, commandJson } from "../lib/process-json.mjs";
import { readBaselineAdmissionPolicy, runBaselineAdmission, verifyBaselineAdmission } from "../lib/baseline-admission.mjs";
import { installMaintenanceFixture } from "./fixtures/maintenance-runtime.mjs";
import { installRuntimeShim } from "../lib/runner.mjs";

test("task-priority baseline provisions its locked Playwright browser before browser checks", async () => {
  const caseRoot = new URL("../cases/sdlc-eval-2026-summer-task-priority/", import.meta.url);
  const definition = JSON.parse(await readFile(new URL("case.json", caseRoot))).baseline_admission;
  const policy = await readBaselineAdmissionPolicy({ caseRoot: caseRoot.pathname, definition });
  const provision = policy.commands.findIndex(command => command.id === "browser-install");
  assert.ok(provision > policy.commands.findIndex(command => command.id === "install"));
  assert.ok(provision < policy.commands.findIndex(command => command.id === "browser"));
  assert.deepEqual(policy.commands[provision].args, ["--filter", "@dd-tasks/web", "exec", "playwright", "install", "chromium", "--only-shell"]);
});

test("light preparation validates the baseline policy without executing its command", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "baseline-policy-"));
  try {
    const marker = path.join(root, "must-not-exist");
    const policy = { schema_id: "dd-eval/baseline-admission-policy@1", commands: [{ id: "check", command: process.execPath, args: ["-e", `require('node:fs').writeFileSync(${JSON.stringify(marker)},'executed')`], timeout_ms: 1000 }] };
    const bytes = JSON.stringify(policy);
    await writeFile(path.join(root, "policy.json"), bytes);
    const definition = { file: "policy.json", sha256: createHash("sha256").update(bytes).digest("hex") };
    assert.deepEqual(await readBaselineAdmissionPolicy({ caseRoot: root, definition }), policy);
    await assert.rejects(readFile(marker), { code: "ENOENT" });
    await assert.rejects(readBaselineAdmissionPolicy({ caseRoot: root, definition: { ...definition, sha256: "0".repeat(64) } }), { code: "baseline_admission_definition_mismatch" });
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("baseline policy@2 is sliding and rejects mixed legacy policy fields", async t => {
  const root = await mkdtemp(path.join(os.tmpdir(), "baseline-sliding-")); t.after(() => rm(root, { recursive: true, force: true }));
  const projectRoot = path.join(root, "project"); await mkdir(projectRoot);
  await commandText("git", ["init", "-q"], { cwd: projectRoot });
  await commandText("git", ["-c", "user.name=test", "-c", "user.email=test@localhost", "commit", "--allow-empty", "-qm", "baseline"], { cwd: projectRoot });
  const checkpoint = { sha256: "a".repeat(64), value: { id: "cp-test", source: { commit: await commandText("git", ["rev-parse", "HEAD"], { cwd: projectRoot }) } } };
  const policy = { schema_id: "dd-eval/baseline-admission-policy@2", commands: [{ id: "check", command: process.execPath, args: ["-e", "console.log('started');let n=0;const t=setInterval(()=>{console.log('progress');if(++n===5)clearInterval(t)},500)"], inactivity_timeout_ms: 1500 }] };
  const write = async () => { const bytes = JSON.stringify(policy); await writeFile(path.join(root, "policy.json"), bytes); return { file: "policy.json", sha256: createHash("sha256").update(bytes).digest("hex") }; };
  let definition = await write();
  assert.equal((await runBaselineAdmission({ caseRoot: root, definition, projectRoot, outputRoot: path.join(root, "evidence"), checkpoint })).status, "passed");
  const receipt = JSON.parse(await readFile(path.join(root, "evidence/receipt.json")));
  assert.equal(receipt.schema_id, "dd-eval/baseline-admission@2"); assert.equal(receipt.checks[0].timeout_kind, "inactivity"); assert.equal(receipt.checks[0].cleanup, "settled");
  const reference = { file: path.join(root, "evidence/receipt.json"), sha256: createHash("sha256").update(await readFile(path.join(root, "evidence/receipt.json"))).digest("hex") };
  await verifyBaselineAdmission({ reference, definition, checkpoint, caseRoot: root });
  for (const corrupt of [value => value.checks.pop(), value => { value.checks[0].id = "foreign"; }, value => { value.checks[0].inactivity_timeout_ms = 1499; }, value => { value.schema_id = "dd-eval/baseline-admission@1"; }]) {
    const changed = structuredClone(receipt); corrupt(changed); const bytes = JSON.stringify(changed); await writeFile(reference.file, bytes);
    await assert.rejects(verifyBaselineAdmission({ reference: { ...reference, sha256: createHash("sha256").update(bytes).digest("hex") }, definition, checkpoint, caseRoot: root }), { code: "baseline_admission_unconfirmed" });
  }
  policy.commands[0].args[1] = "console.log('started');setInterval(()=>{},1000)";
  definition = await write();
  await assert.rejects(runBaselineAdmission({ caseRoot: root, definition, projectRoot, outputRoot: path.join(root, "evidence"), checkpoint }), { code: "baseline_admission_failed" });
  policy.commands[0].timeout_ms = 1000;
  await assert.rejects(readBaselineAdmissionPolicy({ caseRoot: root, definition: await write() }), { code: "baseline_admission_invalid" });
});

test("baseline rejects unbound registration, confirmation and admission before executing its command", async t => {
  const root = await mkdtemp(path.join(os.tmpdir(), "baseline-receipt-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const projectRoot = path.join(root, "project"), cli = path.join(root, "flow.mjs"), marker = path.join(root, "executed"), calls = path.join(root, "calls");
  await mkdir(projectRoot);
  await installMaintenanceFixture(root);
  await commandText("git", ["init", "-q"], { cwd: projectRoot });
  await commandText("git", ["-c", "user.name=test", "-c", "user.email=test@localhost", "commit", "--allow-empty", "-qm", "baseline"], { cwd: projectRoot });
  const checkpoint = { sha256: "a".repeat(64), value: { id: "cp-test", source: { commit: await commandText("git", ["rev-parse", "HEAD"], { cwd: projectRoot }) } } };
  const bytes = JSON.stringify({ schema_id: "dd-eval/baseline-admission-policy@1", commands: [{ id: "check", command: process.execPath, args: ["-e", `require('node:fs').writeFileSync(${JSON.stringify(marker)},'executed')`], timeout_ms: 1000 }] });
  await writeFile(path.join(root, "policy.json"), bytes);
  const definition = { file: "policy.json", sha256: createHash("sha256").update(bytes).digest("hex") };
  for (const fault of ["registration-id", "registration-false", "registration-home", "registration-role", "registration-budget", "registration-malformed-reconciliation", "registration-reconciliation-budget", "registration-ownership-budget", "confirmation-ownership-budget", "confirmation-id", "confirmation-false", "confirmation-pid", "confirmation-expiry", "confirmation-home", "confirmation-budget", "admission-missing", "admission-false", "admission-id"]) {
    await writeFile(calls, "");
    await writeFile(cli, `import fs from 'node:fs'; const a=process.argv.slice(2), action=a[2], value=name=>a[a.indexOf('--'+name)+1], file=${JSON.stringify(path.join(root, "process.json"))};
fs.appendFileSync(${JSON.stringify(calls)},action+'\\n');
let record, result; const fault=${JSON.stringify(fault)}, budget=a.includes('--budget-json')?JSON.parse(value('budget-json')):null;
if(action==='register') { record={id:value('id'),lease_token:'lease',kind:'eval-baseline',owner_id:value('owner'),operation_id:value('operation'),state:'starting',metadata_json:fault==='registration-malformed-reconciliation'?'{':JSON.stringify({dd_flow_home:fault==='registration-home'?'/foreign':process.env.DD_FLOW_HOME,role:fault==='registration-role'?'subject':'probe',owner_pid:Number(value('owner-pid')),budget:['registration-budget','registration-reconciliation-budget'].includes(fault)?{...budget,scope_id:'foreign'}:budget})};fs.writeFileSync(file,JSON.stringify(record));result=['registration-malformed-reconciliation','registration-reconciliation-budget'].includes(fault)?{ok:false,error:{code:'process_maintenance_timeout',message:'original register timeout'}}:{ok:fault!=='registration-false',process:{...record,...(fault==='registration-id'?{id:'foreign'}:{})}}; }
else if(action==='status') result={processes:[JSON.parse(fs.readFileSync(file))]};
else if(action==='confirm') { record=JSON.parse(fs.readFileSync(file));const metadata=JSON.parse(record.metadata_json);result={ok:fault!=='confirmation-false',process:{...record,metadata_json:JSON.stringify({...metadata,...(fault==='confirmation-home'?{dd_flow_home:'/foreign'}:fault==='confirmation-budget'?{budget:{...metadata.budget,scope_id:'foreign'}}:{})}),state:'running',pid:Number(value('pid')),lease_expires_at:new Date(Date.now()+900000).toISOString(),registration_sha256:'a'.repeat(64),...(fault==='confirmation-id'?{id:'foreign'}:fault==='confirmation-pid'?{pid:1}:fault==='confirmation-expiry'?{lease_expires_at:'invalid'}:{})}}; }
else if(action==='heartbeat') result={ok:true,process_id:value('id'),lease_expires_at:new Date(Date.now()+900000).toISOString(),registration_sha256:'a'.repeat(64)};
else if(action==='check-admission') result=fault==='admission-missing'?{}:{ok:true,admitted:fault!=='admission-false',process_id:fault==='admission-id'?'foreign':value('id')};
else if(action==='finish') { if(fault==='confirmation-ownership-budget'){ const retained=JSON.parse(fs.readFileSync(file));try { process.kill(retained.pid,0);throw Error('owned baseline gate must exit before finish'); } catch(error) { if(error.code!=='ESRCH')throw error; }}result={ok:true}; }else throw Error('unexpected '+action);
if(fault==='registration-ownership-budget'&&action==='register'||fault==='confirmation-ownership-budget'&&action==='confirm') { if(action==='confirm')fs.writeFileSync(file,JSON.stringify({...record,pid:Number(value('pid'))}));result={ok:false,error:{code:'process_ownership_unconfirmed',message:'ownership episode exhausted after late ACK'}}; }
console.log(JSON.stringify(result));`);
    await assert.rejects(runBaselineAdmission({ caseRoot: root, definition, projectRoot, outputRoot: path.join(root, "evidence"), checkpoint,
      runtimeScope: { bin: cli, home: root, resourceHome: path.join(root, "resources"), budget: { schema_id: "dd-flow/runtime-budget@1", scope_id: "EVAL-baseline", per_harness: {} }, operationId: `baseline-${fault}` } }), { code: fault.endsWith("ownership-budget") ? "process_ownership_unconfirmed" : ["registration-malformed-reconciliation", "registration-reconciliation-budget"].includes(fault) ? "process_maintenance_timeout" : "process_maintenance_receipt_invalid" }, fault);
    await assert.rejects(readFile(marker), { code: "ENOENT" }, fault);
    const receipt = JSON.parse(await readFile(path.join(root, "evidence/receipt.json")));
    assert.equal(receipt.status, "failed", fault);
    assert.ok(receipt.finished_at, fault);
    assert.equal(receipt.error.code, fault.endsWith("ownership-budget") ? "process_ownership_unconfirmed" : ["registration-malformed-reconciliation", "registration-reconciliation-budget"].includes(fault) ? "process_maintenance_timeout" : "process_maintenance_receipt_invalid", fault);
    const expectedCalls = fault.startsWith("confirmation-") ? ["register", "confirm", "finish"] : fault.startsWith("admission-") ? ["register", "confirm", "heartbeat", "check-admission", "finish"] : fault.includes("reconciliation") ? ["register", "status"] : ["register"];
    assert.deepEqual((await readFile(calls, "utf8")).trim().split("\n"), expectedCalls, fault);
  }
});

test("baseline owner loss exits despite continuing output and failed physical cleanup", { timeout: 30000 }, async t => {
  const root = await mkdtemp(path.join(os.tmpdir(), "baseline-owner-loss-"));
  const projectRoot = path.join(root, "project"), cli = path.join(root, "flow.mjs"), marker = path.join(root, "active"), calls = path.join(root, "calls"), binding = path.join(root, "binding.json");
  const originalInterval = globalThis.setInterval, originalKill = process.kill;
  t.after(async () => {
    globalThis.setInterval = originalInterval; process.kill = originalKill;
    const record = JSON.parse(await readFile(binding, "utf8").catch(() => "null"));
    if (record?.pid) { try { originalKill(-record.pid, "SIGKILL"); } catch (error) { if (error.code !== "ESRCH") throw error; } }
    await new Promise(resolve => setTimeout(resolve, 100));
    await rm(root, { recursive: true, force: true });
  });
  await mkdir(projectRoot); await installMaintenanceFixture(root);
  await commandText("git", ["init", "-q"], { cwd: projectRoot });
  await commandText("git", ["-c", "user.name=test", "-c", "user.email=test@localhost", "commit", "--allow-empty", "-qm", "baseline"], { cwd: projectRoot });
  const checkpoint = { sha256: "a".repeat(64), value: { id: "cp-test", source: { commit: await commandText("git", ["rev-parse", "HEAD"], { cwd: projectRoot }) } } };
  // This witness tests lease loss, not silence: allow loaded-host startup before
  // the deliberately rejected heartbeat, retaining the exact error assertions.
  const bytes = JSON.stringify({ schema_id: "dd-eval/baseline-admission-policy@2", commands: [{ id: "check", command: process.execPath, args: ["-e", `require('node:fs').writeFileSync(${JSON.stringify(marker)},'active');setInterval(()=>console.log('productive'),10)`], inactivity_timeout_ms: 10000 }] });
  await writeFile(path.join(root, "policy.json"), bytes);
  await writeFile(cli, `import fs from 'node:fs';const a=process.argv.slice(2),action=a[2],v=n=>a[a.indexOf('--'+n)+1],file=${JSON.stringify(binding)},marker=${JSON.stringify(marker)};fs.appendFileSync(${JSON.stringify(calls)},action+'\\n');let r;
if(action==='register')r={id:v('id'),lease_token:'lease',kind:'eval-baseline',owner_id:v('owner'),operation_id:v('operation'),state:'starting',metadata_json:JSON.stringify({dd_flow_home:process.env.DD_FLOW_HOME,role:'probe',owner_pid:Number(v('owner-pid')),budget:JSON.parse(v('budget-json'))})};else r=JSON.parse(fs.readFileSync(file));
if(action==='confirm')Object.assign(r,{pid:Number(v('pid')),state:'running',lease_expires_at:new Date(Date.now()+900000).toISOString(),registration_sha256:'a'.repeat(64)});
let result={ok:true,process:r};if(action==='heartbeat'){r.heartbeats=(r.heartbeats??0)+1;if(r.heartbeats>1){while(!fs.existsSync(marker))await new Promise(resolve=>setTimeout(resolve,10));result={ok:false};}else result={ok:true,process_id:r.id,lease_expires_at:r.lease_expires_at,registration_sha256:r.registration_sha256};}if(action==='check-admission')result={ok:true,admitted:true,process_id:r.id};fs.writeFileSync(file,JSON.stringify(r));console.log(JSON.stringify(result));`);
  globalThis.setInterval = (callback, milliseconds, ...args) => originalInterval(callback, milliseconds === 30000 ? 100 : milliseconds, ...args);
  process.kill = (pid, signal) => { if (pid < 0 && signal !== 0) throw Object.assign(new Error("denied owned retirement"), { code: "EPERM" }); return originalKill(pid, signal); };
  await assert.rejects(runBaselineAdmission({ caseRoot: root, definition: { file: "policy.json", sha256: createHash("sha256").update(bytes).digest("hex") }, projectRoot, outputRoot: path.join(root, "evidence"), checkpoint,
    runtimeScope: { bin: cli, home: root, resourceHome: path.join(root, "resources"), budget: { scope_id: "EVAL-loss", per_harness: {} }, operationId: "baseline-loss" } }), error => error.code === "process_lease_lost" && error.cleanup_error?.code === "EPERM");
  assert.equal(await readFile(marker, "utf8"), "active");
  assert.ok(!(await readFile(calls, "utf8")).includes("finish\n"));
});

test("baseline admission is pinned, records failure and rejects source mutations", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "baseline-admission-"));
  const projectRoot = path.join(root, "project"); await mkdir(projectRoot);
  try {
    await commandText("git", ["init", "-q"], { cwd: projectRoot });
    await writeFile(path.join(projectRoot, "source.txt"), "baseline");
    await commandText("git", ["add", "."], { cwd: projectRoot });
    await commandText("git", ["-c", "user.name=test", "-c", "user.email=test@localhost", "commit", "-qm", "baseline"], { cwd: projectRoot });
    const checkpoint = { sha256: "a".repeat(64), value: { id: "cp-test", source: { commit: await commandText("git", ["rev-parse", "HEAD"], { cwd: projectRoot }) } } };
    async function run(script, beforeCommand, runtimeScope, timeoutMs = 10000, sliding = false) {
      const bytes = JSON.stringify({ schema_id: `dd-eval/baseline-admission-policy@${sliding ? 2 : 1}`, commands: [{ id: "check", command: process.execPath, args: ["-e", script], [sliding ? "inactivity_timeout_ms" : "timeout_ms"]: timeoutMs }] });
      await writeFile(path.join(root, "policy.json"), bytes);
      const definition = { file: "policy.json", sha256: createHash("sha256").update(bytes).digest("hex") };
      return runBaselineAdmission({ caseRoot: root, definition, projectRoot, outputRoot: path.join(root, "evidence"), checkpoint, beforeCommand, runtimeScope });
    }
    assert.equal((await run('console.log("baseline accepted")')).status, "passed");
    await assert.rejects(run('setInterval(()=>{},1000)', undefined, undefined, 100), { code: "baseline_admission_failed" });
    assert.deepEqual(JSON.parse(await readFile(path.join(root, "evidence/receipt.json"))).checks.map(({ exit_code, timed_out }) => ({ exit_code, timed_out })), [{ exit_code: 124, timed_out: true }]);
    await assert.rejects(run('require("node:fs").writeFileSync("source.txt", "must not execute")', async id => {
      assert.equal(id, "check");
      throw Object.assign(new Error("EVAL cancelled postgresql://user:secret@localhost/db api_key=private"), { code: "runtime_scope_stopped" });
    }), { code: "runtime_scope_stopped" });
    const interrupted = JSON.parse(await readFile(path.join(root, "evidence/receipt.json")));
    assert.equal(interrupted.status, "failed");
    assert.ok(interrupted.finished_at);
    assert.equal(interrupted.error.code, "runtime_scope_stopped");
    assert.equal(interrupted.error.message, "EVAL cancelled postgresql://[redacted] api_key=[redacted]");
    assert.deepEqual(interrupted.checks, []);
    assert.equal(await readFile(path.join(projectRoot, "source.txt"), "utf8"), "baseline");
    if (process.env.DD_EVAL_TEST_FLOW_CLI) {
      const scope = { bin: path.resolve(process.env.DD_EVAL_TEST_FLOW_CLI), home: path.join(root, "runtime"), resourceHome: path.join(root, "resources"), budget: { schema_id: "dd-flow/runtime-budget@1", scope_id: "EVAL-baseline", per_harness: {} }, operationId: "baseline-check" };
      const selected = { snapshot_root: path.dirname(path.dirname(scope.bin)), entrypoint: path.join('dist', path.basename(scope.bin)) };
      const controlBin = await installRuntimeShim(path.join(root, 'control-runtime'), selected);
      scope.bin = await installRuntimeShim(scope.home, selected);
      await assert.rejects(run('throw Error("wrong-home command must not execute")', undefined, { ...scope, bin: controlBin, budget: { ...scope.budget, scope_id: 'EVAL-wrong-home' }, operationId: 'baseline-wrong-home' }), { code: 'process_maintenance_receipt_invalid' });
      assert.equal((await run('console.log("owned baseline")', undefined, scope)).status, "passed");
      assert.equal((await run('console.log("started");let n=0;const t=setInterval(()=>{console.log("progress");if(++n===5)clearInterval(t)},500)', undefined, { ...scope, operationId: "baseline-sliding-owned" }, 1500, true)).status, "passed");
      // Admission may take longer than the command's timeout, but must not
      // kill the blocked gate before its live ownership can be confirmed.
      const delayedCli = path.join(root, "delayed-flow.mjs");
      await writeFile(delayedCli, `import {spawn} from 'node:child_process';\nconst args=process.argv.slice(2);\nif(args[0]==='runtime' && args[1]==='process' && args[2]==='register') await new Promise(resolve=>setTimeout(resolve,1500));\nconst child=spawn(${JSON.stringify(scope.bin)},args,{stdio:'inherit'});\nchild.once('error',()=>process.exit(1));\nchild.once('exit',code=>process.exit(code??1));\n`);
      assert.equal((await run('console.log("admitted before command timeout")', undefined, { ...scope, bin: delayedCli, operationId: "baseline-slow-admission" }, 1000)).status, "passed");
      await assert.rejects(run('setInterval(()=>{},1000)', undefined, { ...scope, operationId: "baseline-command-timeout" }, 100), { code: "baseline_admission_failed" });
      assert.deepEqual(JSON.parse(await readFile(path.join(root, "evidence/receipt.json"))).checks.map(({ exit_code, timed_out }) => ({ exit_code, timed_out })), [{ exit_code: 124, timed_out: true }]);
      const marker = path.join(root, "active-baseline");
      const active = run(`require("node:fs").writeFileSync(${JSON.stringify(marker)},String(process.pid)); setInterval(()=>{},1000)`, undefined, { ...scope, operationId: "baseline-active" }).then(value => ({ value }), error => ({ error }));
      let pid;
      for (let attempt = 0; attempt < 500; attempt++) {
        const bytes = await readFile(marker, "utf8").catch(() => null);
        if (bytes) { pid = Number(bytes); break; }
        await new Promise(resolve => setTimeout(resolve, 20));
      }
      assert.ok(pid, "registered baseline reached its productive command");
      const stopped = await commandJson(scope.bin, ["runtime", "scope", "stop", "--scope-id", scope.budget.scope_id, "--request-id", "cancel"], { cwd: projectRoot, env: { DD_FLOW_HOME: scope.home, DD_FLOW_RESOURCE_HOME: scope.resourceHome } });
      assert.equal(stopped.settled, true);
      assert.equal((await active).error?.code, "baseline_admission_failed");
      assert.throws(() => process.kill(pid, 0), { code: "ESRCH" });
      await assert.rejects(run('require("node:fs").writeFileSync("source.txt", "must not execute")', undefined, scope), { code: "runtime_scope_stopped" });
      assert.equal(await readFile(path.join(projectRoot, "source.txt"), "utf8"), "baseline");
    }
    await assert.rejects(run("process.exit(1)"), { code: "baseline_admission_failed" });
    assert.equal(JSON.parse(await readFile(path.join(root, "evidence/receipt.json"))).status, "failed");
    await assert.rejects(run('require("node:fs").writeFileSync("source.txt", "modified")'), { code: "baseline_admission_failed" });
    assert.equal(JSON.parse(await readFile(path.join(root, "evidence/receipt.json"))).status, "source_changed");
    await assert.rejects(runBaselineAdmission({ caseRoot: root, definition: { file: "policy.json", sha256: "0".repeat(64) }, projectRoot, outputRoot: root, checkpoint }), { code: "baseline_admission_definition_mismatch" });
  } finally { await rm(root, { recursive: true, force: true }); }
});

for (const version of [1, 2]) test(`baseline custody@${version} uses one monitored grant before its command`, async t => {
  const root = await mkdtemp(path.join(os.tmpdir(), "baseline-custody-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const projectRoot = path.join(root, "project"), cli = path.join(root, "flow.mjs"), calls = path.join(root, "calls"), binding = path.join(root, "binding.json");
  await mkdir(projectRoot);
  await installMaintenanceFixture(root);
  await commandText("git", ["init", "-q"], { cwd: projectRoot });
  await commandText("git", ["-c", "user.name=test", "-c", "user.email=test@localhost", "commit", "--allow-empty", "-qm", "baseline"], { cwd: projectRoot });
  const checkpoint = { sha256: "a".repeat(64), value: { id: "cp-test", source: { commit: await commandText("git", ["rev-parse", "HEAD"], { cwd: projectRoot }) } } };
  const policy = { schema_id: `dd-eval/baseline-admission-policy@${version}`, commands: [{
    id: "check", command: process.execPath, args: ["-e", `require('node:fs').appendFileSync(${JSON.stringify(calls)},'command\\n')`],
    [version === 2 ? "inactivity_timeout_ms" : "timeout_ms"]: 10_000
  }] };
  const bytes = JSON.stringify(policy); await writeFile(path.join(root, "policy.json"), bytes);
  await writeFile(cli, `import fs from 'node:fs';const a=process.argv.slice(2),action=a[2],v=n=>a[a.indexOf('--'+n)+1],file=${JSON.stringify(binding)},calls=${JSON.stringify(calls)};
fs.appendFileSync(calls,action+'\\n');let r,result;
if(action==='register')r={id:v('id'),lease_token:'lease',kind:'eval-baseline',owner_id:v('owner'),operation_id:v('operation'),state:'starting',metadata_json:JSON.stringify({dd_flow_home:process.env.DD_FLOW_HOME,role:'probe',owner_pid:Number(v('owner-pid')),budget:JSON.parse(v('budget-json'))})};else r=JSON.parse(fs.readFileSync(file));
if(action==='confirm')Object.assign(r,{pid:Number(v('pid')),state:'running',lease_expires_at:new Date(Date.now()+900000).toISOString(),registration_sha256:'a'.repeat(64)});
result={ok:true,process:r};
if(action==='heartbeat')result={ok:true,process_id:r.id,lease_expires_at:r.lease_expires_at,registration_sha256:r.registration_sha256};
if(action==='check-admission'){r.admissions=(r.admissions??0)+1;result={ok:true,admitted:r.admissions===1,process_id:r.id};}
fs.writeFileSync(file,JSON.stringify(r));console.log(JSON.stringify(result));`);
  const reference = await runBaselineAdmission({ caseRoot: root, definition: { file: "policy.json", sha256: createHash("sha256").update(bytes).digest("hex") }, projectRoot, outputRoot: path.join(root, "evidence"), checkpoint,
    runtimeScope: { bin: cli, home: root, resourceHome: path.join(root, "resources"), budget: { schema_id: "dd-flow/runtime-budget@1", scope_id: "EVAL-custody", per_harness: {} }, operationId: "baseline-custody" } });
  assert.equal(reference.status, "passed");
  assert.deepEqual((await readFile(calls, "utf8")).trim().split("\n"), ["register", "confirm", "heartbeat", "check-admission", "command", "finish"]);
  const receipt = JSON.parse(await readFile(reference.file, "utf8"));
  assert.equal(receipt.schema_id, `dd-eval/baseline-admission@${version}`);
  assert.equal(receipt.checks[0].timeout_kind, version === 2 ? "inactivity" : undefined);
});
