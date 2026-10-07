import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, readFile, chmod, rm } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { buildHitlPacket, hitlCoverageContract } from "../lib/hitl-contract.mjs";
import { resolveHitlJudgment, settleConclusiveHitlFailure, buildReport } from "../lib/runner.mjs";
import { isConclusiveHitlFailure, isConclusiveManagedFailure, isManagedWait, isObservationLoss, errorRecord } from "../lib/operation-errors.mjs";
import { appendEvent, readEvents, reduceEvents, writeJsonAtomic } from "../lib/runner-events.mjs";
import { executionState } from "../lib/execution-state.mjs";

async function refusal() {
  const responses = [{ id: "canonical", topic: "priority", applicability: "specify", answer: "No email feature is specified." }];
  const packet = await buildHitlPacket({ stage: "specify", question: "Which SMTP provider?", responses, verdictContract: hitlCoverageContract });
  try { resolveHitlJudgment({ fixture: { responses, sha256: "a".repeat(64) }, question: packet.question, stage: packet.stage,
    judgment: { packet, receipt_file: "/retained/result.json", profile: "native", session_id: "judge-session", verdict: { schema_id: hitlCoverageContract, status: "uncovered", response_ids: [], uncovered_questions: ["Which SMTP provider?"] } } }); }
  catch (error) { return error; }
  assert.fail("fixture must leave the SMTP decision unresolved");
}

test("reattach recognizes only explicit conclusive HITL codes, not observations or arbitrary exceptions", async () => {
  const error = await refusal();
  assert.equal(isConclusiveManagedFailure(error), false); assert.equal(isConclusiveHitlFailure(error), true);
  assert.equal(isObservationLoss(error), false); assert.equal(isManagedWait(error), false);
  for (const code of ["hitl_coverage_unresolved", "unexpected_hitl", "required_hitl_missing", "unmatched_hitl", "interaction_fixture_gap", "interaction_judge_ambiguous"]) assert.equal(isConclusiveHitlFailure({ code }), true);
  for (const code of ["rpc_timeout", "managed_run_waiting_for_user", "judge_outcome_unknown", "judge_evidence_mismatch", "coverage_policy_invalid", "driver_failed", "unexpected_exception"]) {
    const error = { code }; assert.equal(isConclusiveHitlFailure(error), false);
    assert.deepEqual(await settleConclusiveHitlFailure({ error, root: "/nonexistent" }), {});
  }
});

test("conclusive reattach/recovery uses normal scoped stop, retains original verdict and leaves other execution active", async t => {
  const root = await mkdtemp(path.join(os.tmpdir(), "hitl-reattach-terminal-")); t.after(() => rm(root, { recursive: true, force: true }));
  const runId = "EVAL-HITL", executions = [{ id: "one", stage: "specify" }, { id: "two", stage: "specify" }];
  const manifest = { run_id: runId, case_id: "case", runtime_resource_home: path.join(root, "resources"), profile: { interaction_judge: { verdict_contract: hitlCoverageContract } }, executions };
  const eventsFile = path.join(root, "events.jsonl"), calls = path.join(root, "calls.jsonl");
  await writeJsonAtomic(path.join(root, "manifest.json"), manifest);
  for (const execution of executions) {
    const attempt = path.join(root, "executions", execution.id), runtime = path.join(attempt, "dd-flow-home"), project = path.join(attempt, "project"), bin = path.join(runtime, "bin", "dd-flow");
    await mkdir(path.dirname(bin), { recursive: true }); await mkdir(project);
    await writeJsonAtomic(path.join(attempt, "managed-runtime.json"), { schema_id: "dd-eval/managed-runtime@1", run_id: `RUN-${execution.id}`, project_root: project, runtime_root: runtime });
    await writeFile(bin, `#!${process.execPath}\nconst fs=require('node:fs');fs.appendFileSync(${JSON.stringify(calls)},JSON.stringify(process.argv.slice(2))+'\\n');console.log(JSON.stringify({ok:true,settled:true,control:{current:true,requested_mode:'stop'}}));\n`); await chmod(bin, 0o755);
    await appendEvent(eventsFile, { source: "dd-eval://runner", runId, executionId: execution.id, type: "dev.dd.eval.operation.started", data: { operation_id: `${runId}:${execution.id}:launch`, operation: "launch" } });
  }
  const error = await refusal(), selected = executions[0];
  const settled = await settleConclusiveHitlFailure({ error, root, manifest, execution: selected });
  assert.equal(settled.control.settled, true); assert.deepEqual(settled.hitl, [error.hitl]);
  const invoked = (await readFile(calls, "utf8")).trim().split("\n").map(JSON.parse);
  assert.equal(invoked.length, 1); assert.deepEqual(invoked[0].slice(0, 3), ["run", "control", "stop"]);
  assert.equal(invoked[0][invoked[0].indexOf("--run") + 1], "RUN-one");
  const failed = { execution: selected.id, state: "failed", stage: error.hitl.stage, ...errorRecord(error), ...settled, execution_operation_id: `${runId}:one:launch` };
  await appendEvent(eventsFile, { source: "dd-eval://runner", runId, executionId: selected.id, type: "dev.dd.eval.execution.failed", data: failed });
  const events = await readEvents(eventsFile);
  assert.equal(executionState(events, runId, selected).result.state, "failed");
  assert.notEqual(executionState(events, runId, executions[1]).result.state, "failed");
  assert.equal(Boolean(reduceEvents(events).cancellation), false);
  const report = buildReport({ root, manifest, results: [failed], state: "completed_with_failures" });
  assert.equal(report.run_validity, "valid"); assert.equal(report.interaction_resolution, "unresolved");
  assert.deepEqual(report.observability.interactions.decisions[0].uncovered_questions, ["Which SMTP provider?"]);
});

test("failed scoped stop preserves the primary conclusive verdict and reports unsettled cleanup", async t => {
  const root = await mkdtemp(path.join(os.tmpdir(), "hitl-reattach-stop-failed-")); t.after(() => rm(root, { recursive: true, force: true }));
  const manifest = { run_id: "EVAL-stop", executions: [{ id: "one" }] }, error = await refusal();
  await writeJsonAtomic(path.join(root, "manifest.json"), manifest);
  await writeFile(path.join(root, "events.jsonl"), "");
  // Corrupt owned runtime scope must not authorize any stop; retain diagnostics.
  const attempt = path.join(root, "executions", "one"); await mkdir(attempt, { recursive: true });
  await writeJsonAtomic(path.join(attempt, "managed-runtime.json"), { schema_id: "dd-eval/managed-runtime@1", run_id: "foreign", project_root: "/foreign", runtime_root: "/foreign" });
  const evidence = await settleConclusiveHitlFailure({ error, root, manifest, execution: manifest.executions[0] });
  assert.deepEqual(evidence.hitl, [error.hitl]); assert.equal(evidence.control.settled, false);
  assert.equal(evidence.control.cleanup_error.code, "execution_scope_invalid"); assert.equal(error.code, "hitl_coverage_unresolved");
});
