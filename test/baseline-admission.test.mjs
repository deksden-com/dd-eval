import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, mkdir, writeFile, readFile, rm, symlink } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { commandText, commandJson } from "../lib/process-json.mjs";
import { readBaselineAdmissionPolicy, runBaselineAdmission } from "../lib/baseline-admission.mjs";
import { installMaintenanceFixture } from "./fixtures/maintenance-runtime.mjs";

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
  for (const fault of ["registration-id", "registration-false", "registration-home", "registration-role", "registration-budget", "registration-malformed-reconciliation", "registration-reconciliation-budget", "confirmation-id", "confirmation-false", "confirmation-pid", "confirmation-expiry", "confirmation-home", "confirmation-budget", "admission-missing", "admission-false", "admission-id"]) {
    await writeFile(calls, "");
    await writeFile(cli, `import fs from 'node:fs'; const a=process.argv.slice(2), action=a[2], value=name=>a[a.indexOf('--'+name)+1], file=${JSON.stringify(path.join(root, "process.json"))};
fs.appendFileSync(${JSON.stringify(calls)},action+'\\n');
let record, result; const fault=${JSON.stringify(fault)}, budget=a.includes('--budget-json')?JSON.parse(value('budget-json')):null;
if(action==='register') { record={id:value('id'),lease_token:'lease',kind:'eval-baseline',owner_id:value('owner'),operation_id:value('operation'),state:'starting',metadata_json:fault==='registration-malformed-reconciliation'?'{':JSON.stringify({dd_flow_home:fault==='registration-home'?'/foreign':process.env.DD_FLOW_HOME,role:fault==='registration-role'?'subject':'probe',owner_pid:Number(value('owner-pid')),budget:['registration-budget','registration-reconciliation-budget'].includes(fault)?{...budget,scope_id:'foreign'}:budget})};fs.writeFileSync(file,JSON.stringify(record));result=['registration-malformed-reconciliation','registration-reconciliation-budget'].includes(fault)?{ok:false,error:{code:'process_maintenance_timeout',message:'original register timeout'}}:{ok:fault!=='registration-false',process:{...record,...(fault==='registration-id'?{id:'foreign'}:{})}}; }
else if(action==='status') result={processes:[JSON.parse(fs.readFileSync(file))]};
else if(action==='confirm') { record=JSON.parse(fs.readFileSync(file));const metadata=JSON.parse(record.metadata_json);result={ok:fault!=='confirmation-false',process:{...record,metadata_json:JSON.stringify({...metadata,...(fault==='confirmation-home'?{dd_flow_home:'/foreign'}:fault==='confirmation-budget'?{budget:{...metadata.budget,scope_id:'foreign'}}:{})}),state:'running',pid:Number(value('pid')),lease_expires_at:new Date(Date.now()+900000).toISOString(),registration_sha256:'a'.repeat(64),...(fault==='confirmation-id'?{id:'foreign'}:fault==='confirmation-pid'?{pid:1}:fault==='confirmation-expiry'?{lease_expires_at:'invalid'}:{})}}; }
else if(action==='check-admission') result=fault==='admission-missing'?{}:{ok:true,admitted:fault!=='admission-false',process_id:fault==='admission-id'?'foreign':value('id')};
else if(action==='finish') result={ok:true};else throw Error('unexpected '+action);
console.log(JSON.stringify(result));`);
    await assert.rejects(runBaselineAdmission({ caseRoot: root, definition, projectRoot, outputRoot: path.join(root, "evidence"), checkpoint,
      runtimeScope: { bin: cli, home: root, resourceHome: path.join(root, "resources"), budget: { schema_id: "dd-flow/runtime-budget@1", scope_id: "EVAL-baseline", per_harness: {} }, operationId: `baseline-${fault}` } }), { code: ["registration-malformed-reconciliation", "registration-reconciliation-budget"].includes(fault) ? "process_maintenance_timeout" : "process_maintenance_receipt_invalid" }, fault);
    await assert.rejects(readFile(marker), { code: "ENOENT" }, fault);
    const receipt = JSON.parse(await readFile(path.join(root, "evidence/receipt.json")));
    assert.equal(receipt.status, "failed", fault);
    assert.ok(receipt.finished_at, fault);
    assert.equal(receipt.error.code, ["registration-malformed-reconciliation", "registration-reconciliation-budget"].includes(fault) ? "process_maintenance_timeout" : "process_maintenance_receipt_invalid", fault);
    const expectedCalls = fault.startsWith("confirmation-") ? ["register", "confirm", "finish"] : fault.startsWith("admission-") ? ["register", "confirm", "check-admission", "finish"] : fault.includes("reconciliation") ? ["register", "status"] : ["register"];
    assert.deepEqual((await readFile(calls, "utf8")).trim().split("\n"), expectedCalls, fault);
  }
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
    async function run(script, beforeCommand, runtimeScope, timeoutMs = 10000) {
      const bytes = JSON.stringify({ schema_id: "dd-eval/baseline-admission-policy@1", commands: [{ id: "check", command: process.execPath, args: ["-e", script], timeout_ms: timeoutMs }] });
      await writeFile(path.join(root, "policy.json"), bytes);
      const definition = { file: "policy.json", sha256: createHash("sha256").update(bytes).digest("hex") };
      return runBaselineAdmission({ caseRoot: root, definition, projectRoot, outputRoot: path.join(root, "evidence"), checkpoint, beforeCommand, runtimeScope });
    }
    assert.equal((await run('console.log("baseline accepted")')).status, "passed");
    await assert.rejects(run('setInterval(()=>{},1000)', undefined, undefined, 100), { code: "baseline_admission_failed" });
    assert.deepEqual(JSON.parse(await readFile(path.join(root, "evidence/receipt.json"))).checks.map(({ exit_code, timed_out }) => ({ exit_code, timed_out })), [{ exit_code: 124, timed_out: true }]);
    await assert.rejects(run('require("node:fs").writeFileSync("source.txt", "must not execute")', async id => {
      assert.equal(id, "check");
      throw Object.assign(new Error("EVAL cancelled"), { code: "runtime_scope_stopped" });
    }), { code: "runtime_scope_stopped" });
    const interrupted = JSON.parse(await readFile(path.join(root, "evidence/receipt.json")));
    assert.equal(interrupted.status, "failed");
    assert.ok(interrupted.finished_at);
    assert.equal(interrupted.error.code, "runtime_scope_stopped");
    assert.deepEqual(interrupted.checks, []);
    assert.equal(await readFile(path.join(projectRoot, "source.txt"), "utf8"), "baseline");
    if (process.env.DD_EVAL_TEST_FLOW_CLI) {
      const scope = { bin: path.resolve(process.env.DD_EVAL_TEST_FLOW_CLI), home: path.join(root, "runtime"), resourceHome: path.join(root, "resources"), budget: { schema_id: "dd-flow/runtime-budget@1", scope_id: "EVAL-baseline", per_harness: {} }, operationId: "baseline-check" };
      assert.equal((await run('console.log("owned baseline")', undefined, scope)).status, "passed");
      await mkdir(scope.home, { recursive: true });
      await symlink(path.join(path.dirname(scope.bin), "harness-runtime"), path.join(scope.home, "harness-runtime"));
      // Admission may take longer than the command's timeout, but must not
      // kill the blocked gate before its live ownership can be confirmed.
      const delayedCli = path.join(root, "delayed-flow.mjs");
      await writeFile(delayedCli, `import {spawn} from 'node:child_process';\nconst args=process.argv.slice(2);\nif(args[0]==='runtime' && args[1]==='process' && args[2]==='register') await new Promise(resolve=>setTimeout(resolve,1500));\nconst child=spawn(process.execPath,[${JSON.stringify(scope.bin)},...args],{stdio:'inherit'});\nchild.once('error',()=>process.exit(1));\nchild.once('exit',code=>process.exit(code??1));\n`);
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
