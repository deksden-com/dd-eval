import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { setTimeout as delay } from "node:timers/promises";
import { commandJson } from "./process-json.mjs";

const hash = value => createHash("sha256").update(value).digest("hex");
const fail = (message, code, details) => { throw Object.assign(new Error(message), { code, details }); };

/** Freeze routing through the same CLI boundary in preflight and execution. */
export async function prepareManagedRun({ bin, env, projectRoot, slug, executionRoutingFile }) {
  const result = await commandJson(bin, ["run", "prepare-vnext-specify", "--project-root", projectRoot, "--slug", slug, "--execution-routing-file", executionRoutingFile], { cwd: projectRoot, env });
  if (typeof result.run_id !== "string" || !result.run_id) fail("Managed preparation omitted its logical RUN", "controller_receipt_invalid");
  return result;
}

/** Experiment-side observation only. CLI owns Sessions, fan-out and boundaries. */
export async function observeManagedRun({ bin, env, projectRoot, runId, requestId, controllerId: retainedControllerId, contextFile, stopAfter, captureRoot, contextFor, answerFor, onEvent, beforeDispatch = async () => {}, pollMs = 1000, observeOnce = false }) {
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
  for (;;) {
    const status = await call(["run", "drive", "status", ...scope, "--after", String(cursor)]);
    if (status.controller?.controller_id !== controllerId) fail("Managed owner changed; explicit recovery is required", "controller_owner_changed", { expected: controllerId, observed: status.controller });
    for (const event of status.events ?? []) {
      if (!Number.isSafeInteger(event.sequence) || event.sequence <= cursor) fail("Controller events are not ordered", "controller_receipt_invalid");
      await onEvent?.(event, status.controller);
      if (event.type === "boundary_captured") boundary = event.data;
      if (event.type === "context_required") pendingContext = event;
      if (["context_accepted", "stage_entered"].includes(event.type) && event.data.stage === pendingContext?.data.stage) pendingContext = null;
      cursor = event.sequence;
    }
    // Drain paginated events before interpreting a terminal projection.
    if ((status.events?.length ?? 0) === 100) continue;
    if (["completed", "stop_target_reached"].includes(status.controller.status)) return { controller: status.controller, boundary, cursor };
    if (status.controller.status === "control_requested") {
      fail("Managed RUN is suspended by operator control", "managed_run_controlled", { controller: status.controller, boundary });
    }
    if (["recovery_required", "capture_failed", "cancelled", "superseded"].includes(status.controller.status)) {
      fail(status.controller.error?.message ?? `Managed RUN is ${status.controller.status}`, status.controller.error?.code ?? "managed_run_interrupted", { controller: status.controller, boundary });
    }
    if (status.controller.status === "waiting_for_context" && pendingContext) {
      const event = pendingContext;
      const reference = await contextFor(event.data.stage, event.data.attempt);
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
      if (!stage?.pause?.id) fail("Managed HITL omitted its pause identity", "hitl_pause_invalid");
      if (!answered.has(stage.pause.id)) {
        const answerFile = await answerFor(stage, run, status.controller);
        await beforeDispatch();
        await call(["run", "drive", "answer", ...scope, "--request-id", `answer:${hash(`${requestId}:${stage.pause.id}`)}`, "--pause-id", stage.pause.id, "--answer-file", answerFile]);
        answered.add(stage.pause.id);
      }
    }
    if (observeOnce) return { controller: status.controller, boundary, cursor };
    await delay(pollMs);
  }
}
