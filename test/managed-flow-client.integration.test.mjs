import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, mkdir, writeFile, readFile, chmod, rm } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import os from "node:os";
import path from "node:path";
import { commandJson, commandText } from "../lib/process-json.mjs";
import { observeManagedRun } from "../lib/managed-flow-client.mjs";

test("eval client drives two real CLI lifecycle stages and retains controller-owned captures", { skip: !process.env.DD_EVAL_TEST_FLOW_CLI || !process.env.DD_EVAL_TEST_FLOW_ADAPTER, timeout: 120_000 }, async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "eval-managed-flow-"));
  const project = path.join(root, "project"), home = path.join(root, "home"), cli = path.resolve(process.env.DD_EVAL_TEST_FLOW_CLI);
  const env = { DD_FLOW_HOME: home, DD_FLOW_RESOURCE_HOME: home, DD_FLOW_ENGINE_MODE: "1", CODEX_HOME: path.join(root, "codex-home"), DD_FLOW_TEST_ROOT: root, DD_FLOW_TEST_UNCLEAN_STOP: "0", DD_FLOW_TEST_CAPTURE_FAILURE: "0" };
  const hash = value => createHash("sha256").update(value).digest("hex");
  const write = async (relative, value) => { const file = path.join(root, relative); await mkdir(path.dirname(file), { recursive: true }); await writeFile(file, typeof value === "string" ? value : JSON.stringify(value)); return file; };
  let runId, settled = false;
  try {
    for (const name of ["index", "spec/engineering/index", "epics/index", "epics/EP-001-tasks/index", "protocol/index"]) await write(`project/.memory-bank/${name}.md`, "# Fixture\n");
    await write("project/.memory-bank/dd-flow/project-workspace.json", { schema_id: "dd-flow/project-workspace@1", workspace: { route: "integration_branch_direct", integration_branch: "main", feature_branch_template: null, provision_stage: "protocolize_start" } });
    await write("project/.memory-bank/dd-flow/project-execution.json", { schema_id: "dd-flow/project-execution@3", stage_session_mode: "same_session", plan_review_mode: "off", code_review_mode: "off", merge_mode: "server", merge_delivery: { strategy: "local" }, merge_cleanup: { source: "retain" }, stop_target: "code_completed", code_bootstrap: { command: "true", policy_ref: ".memory-bank/spec/operations/workspace-bootstrap-policy.md" }, execution: { agent_profile_id: "first", stage_overrides: { protocolize: { agent_profile_id: "second" } } } });
    await write("project/.memory-bank/dd-flow/vnext/mb-sdlc-vnext-protocolize.json", { id: "mb-sdlc-vnext-protocolize", version: 5, stages: { specify: { entries: { default: { actions: [{ handler: "specify.bootstrap" }, { agent: {} }, { handler: "specify.accept" }] } } } } });
    for (const stage of ["specify", "protocolize"]) await write(`project/.memory-bank/dd-flow/vnext/${stage}.md`, "Use the assigned authoritative Stage packet.\n");
    await write("project/.memory-bank/dd-flow/mb-sdlc/specify/stage-report-template.html", "<script>__STAGE_REPORT_DATA__</script>");
    for (const id of ["first", "second"]) await write(`home/agent-profiles/${id}.json`, { schema_id: "dd-flow/agent-profile@1", id, harness: "codex", provider: "fixture", model: `model-${id}`, reasoning: "low", mode: "agent", permission: "deny" });
    const adapter = await write("adapter.mjs", `#!${process.execPath}\nawait import(${JSON.stringify(pathToFileURL(path.resolve(process.env.DD_EVAL_TEST_FLOW_ADAPTER)).href)});\n`); await chmod(adapter, 0o700);
    await write("home/harnesses.json", { schema_id: "dd-flow/harness-config@1", harnesses: { "codex-desktop": { adapter_command: adapter, runtime_command: process.execPath } } });
    await mkdir(env.CODEX_HOME);
    const git = args => commandText("git", args, { cwd: project });
    await git(["init", "--quiet", "-b", "main"]); await git(["add", "."]); await git(["-c", "user.name=Fixture", "-c", "user.email=fixture@example.test", "commit", "--quiet", "-m", "fixture"]);
    const started = await commandJson(cli, ["run", "start", "--project-root", project, "--flow-kind", "vnext_protocolize", "--subject-type", "discussion", "--subject-id", "controller-fixture", "--slug", "controller-stages"], { cwd: project, env });
    runId = started.run.id;
    const intake = await write("task.md", "Add task priority so members can order existing tasks.\n");
    const references = {};
    for (const stage of ["specify", "protocolize"]) {
      const file = await write(`${stage}.context.json`, { schema_id: "dd-flow/stage-context@1", stage, objective: "Specify and structure a task priority change.", task_input: [{ role: "task", path: intake, sha256: hash(await readFile(intake)) }] });
      references[stage] = { file, sha256: hash(await readFile(file)) };
    }
    const packageFile = await write("contexts.json", { schema_id: "dd-flow/managed-context@1", stages: { specify: references.specify } });
    const eventMap = new Map(); let controllerId;
    const input = { bin: cli, env, projectRoot: project, runId, requestId: "eval-integration", contextFile: packageFile, stopAfter: "protocolize", captureRoot: path.join(root, "boundaries"), contextFor: async stage => references[stage], answerFor: async () => { throw new Error("fixture must not pause"); }, pollMs: 100 };
    await assert.rejects(observeManagedRun({ ...input, onEvent: async (event, controller) => {
      controllerId = controller.controller_id;
      eventMap.set(event.sequence, event);
      if (event.type === "context_required") throw Object.assign(new Error("fixture observer disconnected"), { code: "rpc_timeout" });
    } }), { code: "rpc_timeout" });
    assert.ok(controllerId);
    let heldSessions;
    for (let retry = 0; retry < 2; retry++) {
      const review = await observeManagedRun({ ...input, controllerId,
        contextFor: async stage => { assert.equal(stage, "protocolize"); return null; },
        beforeDispatch: async () => assert.fail("review cannot dispatch the successor") });
      assert.equal(review.controller.status, "waiting_for_context");
      assert.equal(review.controller.controller_id, controllerId);
      assert.equal(review.pending_context.stage, "protocolize");
      assert.equal(review.boundary.stage, "specify");
      assert.equal(hash(await readFile(review.boundary.manifest)), review.boundary.manifest_sha256);
      if (heldSessions) assert.deepEqual(review.controller.sessions, heldSessions);
      heldSessions = review.controller.sessions;
    }
    const result = await observeManagedRun({ ...input, controllerId, onEvent: async event => eventMap.set(event.sequence, event) });
    const events = [...eventMap.values()];
    settled = result.controller.sessions.every(session => session.stopped);
    assert.equal(result.controller.status, "stop_target_reached"); assert.equal(settled, true);
    assert.equal(result.controller.sessions.length, 2);
    assert.deepEqual(events.filter(event => event.type === "boundary_captured").map(event => event.data.stage), ["specify", "protocolize"]);
    assert.equal(hash(await readFile(result.boundary.manifest)), result.boundary.manifest_sha256);
    const capture = JSON.parse(await readFile(result.boundary.manifest, "utf8"));
    assert.equal(capture.boundary_capture.controller_id, result.controller.controller_id);
    const repeated = await observeManagedRun({ ...input, controllerId, contextFor: async () => assert.fail("completed controller cannot request historical context"), beforeDispatch: async () => assert.fail("completed reattach is read-only") });
    assert.equal(repeated.controller.controller_id, controllerId);
    assert.deepEqual(repeated.controller.sessions, result.controller.sessions);
    assert.deepEqual(repeated.boundary, result.boundary);
  } finally {
    if (runId && !settled) {
      const receipt = await commandJson(cli, ["run", "control", "stop", "--run", runId, "--project-root", project, "--request-id", "test-cleanup", "--force", "--wait-ms", "10000"], { cwd: project, env });
      settled = receipt.settled === true;
    }
    if (!runId || settled) await rm(root, { recursive: true, force: true });
    else throw new Error(`Owned fixture did not settle; retained ${root}`);
  }
});
