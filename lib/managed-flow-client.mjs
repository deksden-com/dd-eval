import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { setTimeout as delay } from "node:timers/promises";
import { commandJson } from "./process-json.mjs";

const hash = value => createHash("sha256").update(value).digest("hex");
const fail = (message, code, details) => { throw Object.assign(new Error(message), { code, details }); };
export function validateMemoryParallelLimit(limit) {
  if (limit !== undefined && (!Number.isInteger(limit) || limit < 1 || limit > 256))
    fail('Memory maxParallel must be an integer from 1 through 256', 'managed_flow_input_invalid', { effect: 'no_effect' });
}

/** Freeze routing through the same CLI boundary in preflight and execution. */
export async function prepareManagedRun({ bin, env, projectRoot, slug, executionRoutingFile, flow = "sdlc", memoryInit }) {
  let args;
  if (flow === "sdlc") {
    if (memoryInit !== undefined) fail("SDLC preparation cannot consume Memory initialization inputs", "managed_flow_input_invalid");
    args = ["run", "prepare-vnext-specify", "--project-root", projectRoot, "--slug", slug, "--execution-routing-file", executionRoutingFile];
  } else if (flow === "mb-init") {
    if (!memoryInit || typeof memoryInit !== "object" || Array.isArray(memoryInit)) fail("Memory preparation requires explicit initialization inputs", "managed_flow_input_invalid");
    const fields = { workspaceRoot: "workspace-root", requestId: "request-id", intakeFile: "intake-file", intakeSha256: "intake-sha256", gitRoute: "git-route", integrationBranch: "integration-branch", profile: "profile", profileFile: "profile-file" };
    if (Object.keys(memoryInit).some(key => !Object.hasOwn(fields, key) && !["stageProfiles", "workProfiles", "maxParallel"].includes(key))
      || ["workspaceRoot", "requestId", "intakeFile", "intakeSha256", "gitRoute", "integrationBranch"].some(key => typeof memoryInit[key] !== "string" || !memoryInit[key])) fail("Memory preparation requires exact scope, original intake and Git policy", "managed_flow_input_invalid");
    args = ["init", "--project-root", projectRoot, "--prepare-only", "--non-interactive"];
    validateMemoryParallelLimit(memoryInit.maxParallel);
    if (memoryInit.maxParallel !== undefined) args.push('--max-parallel', String(memoryInit.maxParallel));
    for (const [key, option] of Object.entries(fields)) if (memoryInit[key] !== undefined) {
      if (typeof memoryInit[key] !== "string" || !memoryInit[key]) fail("Invalid Memory preparation selector", "managed_flow_input_invalid");
      args.push(`--${option}`, memoryInit[key]);
    }
    for (const [key, option] of [["stageProfiles", "stage-profile"], ["workProfiles", "work-profile"]]) if (memoryInit[key] !== undefined) {
      if (!Array.isArray(memoryInit[key]) || memoryInit[key].some(value => typeof value !== "string" || !value)) fail("Invalid Memory preparation profile assignments", "managed_flow_input_invalid");
      for (const value of memoryInit[key]) args.push(`--${option}`, value);
    }
  } else fail(`Unsupported managed flow: ${flow}`, "managed_flow_input_invalid");
  const result = await commandJson(bin, args, { cwd: projectRoot, env });
  if (typeof result.run_id !== "string" || !result.run_id) fail("Managed preparation omitted its logical RUN", "controller_receipt_invalid");
  if (flow === "mb-init" && (result.flow_id !== flow || result.action !== "flow_mb_init_prepared" || result.request_id !== memoryInit.requestId || result.controller !== undefined)) fail("Memory preparation returned a foreign or launched receipt", "controller_receipt_invalid");
  return result;
}

/** Experiment-side observation only. CLI owns Sessions, fan-out and boundaries. */
export async function observeManagedRun({ bin, env, projectRoot, runId, requestId, controllerId: retainedControllerId, contextFile, stopAfter, captureRoot, contextFor, answerFor, onEvent, beforeDispatch = async () => {}, pollMs = 1000, observeOnce = false }) {
  let lastObserved = null;
  try {
  const scope = ["--run", runId, "--project-root", projectRoot];
  const call = args => commandJson(bin, args, { cwd: projectRoot, env });
  let controllerId = retainedControllerId;
  if (!controllerId) {
    await beforeDispatch();
    const launched = await call(["run", "drive", "launch", ...scope, "--request-id", requestId, "--context-file", contextFile, "--context-sha256", hash(await readFile(contextFile)), "--stop-after", stopAfter, "--capture-root", captureRoot]);
    controllerId = launched.controller?.controller_id;
  }
  if (!controllerId) fail("Managed launch omitted its controller identity", "controller_receipt_invalid");
  let cursor = 0, boundary = null, pendingContext = null;
  const answered = new Set();
  const readStatus = async () => {
    let status;
    do {
      status = await call(["run", "drive", "status", ...scope, "--after", String(cursor)]);
      if (status.controller?.controller_id !== controllerId) fail("Managed owner changed; explicit recovery is required", "controller_owner_changed", { expected: controllerId, observed: status.controller });
      lastObserved = { controller: status.controller, cursor, provenance: "last_validated_observation" };
      for (const event of status.events ?? []) {
        if (!Number.isSafeInteger(event.sequence) || event.sequence <= cursor) fail("Controller events are not ordered", "controller_receipt_invalid");
        await onEvent?.(event, status.controller);
        if (event.type === "boundary_captured") boundary = event.data;
        if (event.type === "context_required") pendingContext = event;
        if (event.type === "answer_accepted" && event.data.pause_id) answered.add(event.data.pause_id);
        if (["context_accepted", "stage_entered"].includes(event.type) && event.data.stage === pendingContext?.data.stage) pendingContext = null;
        cursor = event.sequence;
        lastObserved.cursor = cursor;
      }
    } while ((status.events?.length ?? 0) === 100);
    return status;
  };
  // Exactly one reader owns the cursor, including while an input is prepared.
  // Consume late action rejection, but never deliver its result after a fence.
  const whileControllerActive = async (action, expected) => {
    let done = false, result, failure;
    const task = Promise.resolve().then(action).then(value => { result = value; }, error => { failure = error; }).finally(() => { done = true; });
    const check = async () => {
      const { controller } = await readStatus();
      if (controller.status !== expected.status || controller.stage !== expected.stage) fail(controller.error?.message ?? "Managed RUN changed while preparing operator input", controller.error?.code ?? "managed_run_controlled", { controller });
    };
    while (!done) {
      await Promise.race([task, delay(Math.max(50, Math.min(1000, pollMs)))]);
      if (!done) await check();
    }
    if (failure) throw failure;
    // An instant callback can finish before the first tick. It still needs a
    // current dispatch barrier, not the pre-callback status snapshot.
    await check();
    return result;
  };
  for (;;) {
    const status = await readStatus();
    // Drain paginated events before interpreting a terminal projection.
    if ((status.events?.length ?? 0) === 100) continue;
    if (["completed", "stop_target_reached"].includes(status.controller.status)) return { controller: status.controller, boundary, cursor };
    if (status.controller.status === "control_requested") {
      fail(status.controller.error?.message ?? "Managed RUN is suspended by operator control", status.controller.error?.code ?? "managed_run_controlled", { controller: status.controller, boundary });
    }
    if (["recovery_required", "capture_failed", "cancelled", "superseded"].includes(status.controller.status)) {
      fail(status.controller.error?.message ?? `Managed RUN is ${status.controller.status}`, status.controller.error?.code ?? "managed_run_interrupted", { controller: status.controller, boundary });
    }
    if (status.controller.status === "waiting_for_context" && pendingContext) {
      const event = pendingContext;
      const reference = await whileControllerActive(() => contextFor(event.data.stage, event.data.attempt), status.controller);
      // Reference authoring may withhold the next slice until manual review.
      // The detached controller keeps ownership; this observer sends no turn.
      if (reference === null) {
        if (!boundary) fail("Cannot review a boundary without its captured receipt", "controller_boundary_missing");
        return { controller: status.controller, boundary, cursor, pending_context: event.data };
      }
      await beforeDispatch();
      await call(["run", "drive", "context", ...scope, "--controller-id", controllerId, "--request-id", `context:${hash(`${requestId}:${event.sequence}`)}`, "--stage", event.data.stage, "--context-file", reference.file, "--context-sha256", reference.sha256]);
      pendingContext = null;
    }
    if (status.controller.status === "waiting_for_user") {
      const run = await call(["run", "status", runId, "--project-root", projectRoot]);
      const stage = run.index?.stage_runs?.find(stage => ["paused", "waiting_for_user"].includes(stage.status));
      // The native answer Turn resumes the Stage before drive leaves waiting_for_user.
      // Accepted-answer events also preserve this distinction after observer restart.
      const resumed = !stage && answered.size > 0 && run.index?.stage_runs?.some(stage => stage.stage === status.controller.stage && ["running", "done"].includes(stage.status));
      if (!stage?.pause?.id && !resumed) fail("Managed HITL omitted its pause identity", "hitl_pause_invalid");
      if (stage && !answered.has(stage.pause.id)) {
        const answerFile = await whileControllerActive(() => answerFor?.(stage, run, status.controller), status.controller);
        if (answerFile == null) return { controller: status.controller, boundary, cursor, pending_answer: { pause_id: stage.pause.id } };
        await beforeDispatch();
        await call(["run", "drive", "answer", ...scope, "--request-id", `answer:${hash(`${requestId}:${stage.pause.id}`)}`, "--pause-id", stage.pause.id, "--answer-file", answerFile]);
        answered.add(stage.pause.id);
      }
    }
    if (observeOnce) return { controller: status.controller, boundary, cursor };
    await delay(pollMs);
  }
  } catch (error) {
    if (lastObserved && error && typeof error === "object") {
      error.details = { ...error.details,
        ...(error.details?.controller ? {} : { controller: lastObserved.controller }),
        observation: error.details?.observation ?? { cursor: lastObserved.cursor, provenance: lastObserved.provenance }
      };
    }
    throw error;
  }
}
