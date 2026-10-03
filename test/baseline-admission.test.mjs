import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, mkdir, writeFile, readFile, rm, symlink } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { commandText, commandJson } from "../lib/process-json.mjs";
import { readBaselineAdmissionPolicy, runBaselineAdmission } from "../lib/baseline-admission.mjs";

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
