import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { setTimeout as delay } from "node:timers/promises";
import { commandJson } from "./process-json.mjs";
import { isObservationLoss, isConclusiveManagedFailure } from "./operation-errors.mjs";
import { isSourceSnapshotFlow, isDeliveryFlow } from './installed-flows.mjs';

const hash = value => createHash("sha256").update(value).digest("hex");
const fail = (message, code, details) => { throw Object.assign(new Error(message), { code, details }); };
const controllerErrorCode = (controller, fallback) => {
  // A conclusive owner fence does not establish the native operation outcome.
  // Keep that unknown cause in controller.error, but enter bounded cleanup.
  if (isObservationLoss(controller.error)) {
    if (controller.status === "control_requested") return "managed_run_controlled";
    if (isConclusiveManagedFailure({ details: { controller } })) return "managed_run_interrupted";
  }
  return controller.error?.code ?? fallback;
};

/** Bind observation to the exact controller-owned control; engine owns all
 * Work, capture, native owner and recovery admission proofs. */
export function isCurrentTechnicalDependency(controller, event, receipt, runId) {
  const data = event?.data, control = receipt?.control;
  const original = controller?.status === "control_requested" && data?.generation === controller.generation;
  const resuming = ["starting", "control_requested"].includes(controller?.status) && control?.status === "resuming"
    && Number.isSafeInteger(data?.generation) && controller.generation > data.generation && control.generation === controller.generation;
  return (original || resuming) && !controller.error
    && event?.type === "technical_dependency_paused" && data?.schema_id === "dd-flow/controller-dependency@1"
    && typeof data.control_id === "string" && typeof data.request_id === "string"
    && data.request_id.startsWith(`technical:${controller.controller_id}:${data.generation}:`)
    && receipt?.scope?.run_id === runId && control?.current === true && control.requested_mode === "pause"
    && control.control_id === data.control_id && control.request_id === data.request_id;
}
export function validateMemoryParallelLimit(limit) {
  if (limit !== undefined && (!Number.isInteger(limit) || limit < 1 || limit > 256))
    fail('Memory maxParallel must be an integer from 1 through 256', 'managed_flow_input_invalid', { effect: 'no_effect' });
}

export function validateMemoryNativeSelection(selection) {
  if (selection.delegation !== undefined && !['external', 'native'].includes(selection.delegation)
    || selection.allowLiveProbe !== undefined && typeof selection.allowLiveProbe !== 'boolean'
    || selection.nativeConfigHome !== undefined && (typeof selection.nativeConfigHome !== 'string' || !selection.nativeConfigHome))
    fail('Invalid Memory native CLI options', 'managed_flow_input_invalid', { effect: 'no_effect' });
}

/** Freeze routing through the same CLI boundary in preflight and execution. */
export async function prepareManagedRun({ bin, env, projectRoot, slug, executionRoutingFile, flow = "sdlc", memoryInit, memoryUpgrade, diagnostic, distillation, memoryFix, interactive, delivery }) {
  const diagnosticFlow = isSourceSnapshotFlow(flow);
  const deliveryFlow = isDeliveryFlow(flow);
  const repair = flow === 'mb-fix';
  const userLed = flow === 'interactive';
  if (delivery !== undefined && !deliveryFlow) fail('Delivery inputs belong to a different flow', 'managed_flow_input_invalid');
  if (interactive !== undefined && !userLed) fail('Interactive inputs belong to a different flow', 'managed_flow_input_invalid');
  if (memoryFix !== undefined && !repair) fail('Repair inputs belong to a different flow', 'managed_flow_input_invalid');
  if (diagnostic !== undefined && (!diagnosticFlow || flow === 'mb-distill') || distillation !== undefined && flow !== 'mb-distill') fail("Source workflow inputs belong to a different flow", "managed_flow_input_invalid");
  const memory = deliveryFlow ? delivery : userLed ? interactive : repair ? memoryFix : diagnosticFlow ? flow === 'mb-distill' ? distillation : diagnostic : flow === 'mb-upgrade' ? memoryUpgrade : memoryInit;
  let args;
  if (diagnosticFlow || repair || userLed || deliveryFlow) {
    const fields = { requestId: 'request-id', intakeFile: 'intake-file', profile: 'profile', profileFile: 'profile-file',
      ...(repair || userLed || deliveryFlow ? { workspaceRoot: repair ? 'workspace-root' : 'workspace' } : {}),
      ...(repair || userLed ? { gitRoute: 'git-route', integrationBranch: 'integration-branch' } : {}),
      ...(repair ? { sourceRunId: 'source-run' } : {}) };
    if (!memory || typeof memory !== 'object' || Array.isArray(memory) || memoryInit !== undefined || memoryUpgrade !== undefined || executionRoutingFile !== undefined
      || Object.keys(memory).some(key => !Object.hasOwn(fields, key) && !['stageProfiles', 'workProfiles', 'maxParallel', 'intakeSha256', ...(repair ? ['findingIds'] : [])].includes(key))
      || ['requestId', 'intakeFile'].some(key => typeof memory[key] !== 'string' || !memory[key])
      || Boolean(memory.profile) === Boolean(memory.profileFile)
      || typeof memory.intakeSha256 !== 'string' || !/^[a-f0-9]{64}$/.test(memory.intakeSha256)) fail('Installed workflow requires exact intake and one explicit executor profile', 'managed_flow_input_invalid');
    if (repair && (['sourceRunId','gitRoute','integrationBranch'].some(key => typeof memory[key] !== 'string' || !memory[key])
      || !/^RUN-[0-9]+(?:-[a-z0-9][a-z0-9-]*)?$/.test(memory.sourceRunId)
      || !['feature_worktree','integration_branch_direct'].includes(memory.gitRoute)
      || !Array.isArray(memory.findingIds) || !memory.findingIds.length || memory.findingIds.length > 4096
      || memory.findingIds.some(id => typeof id !== 'string' || !id.trim() || id.length > 256 || /[\r\n\0]/.test(id))
      || new Set(memory.findingIds).size !== memory.findingIds.length)) fail('Repair requires an exact diagnostic RUN, selected findings and Git policy', 'managed_flow_input_invalid');
    if (userLed && (!['feature_worktree','integration_branch_direct'].includes(memory.gitRoute)
      || typeof memory.integrationBranch !== 'string' || !memory.integrationBranch)) fail('Interactive preparation requires explicit Git policy', 'managed_flow_input_invalid');
    if (memory.maxParallel !== undefined && (!Number.isInteger(memory.maxParallel) || memory.maxParallel < 1 || memory.maxParallel > 64)) fail('Installed workflow maxParallel must be from 1 through 64', 'managed_flow_input_invalid');
    args = ['flow', flow, '--project-root', projectRoot, '--prepare-only', '--non-interactive'];
    if (userLed) args.push('--execution', 'managed');
    for (const [key, option] of Object.entries(fields)) if (memory[key] !== undefined) {
      if (typeof memory[key] !== 'string' || !memory[key]) fail('Invalid diagnostic selector', 'managed_flow_input_invalid');
      args.push(`--${option}`, memory[key]);
    }
    if (repair) for (const id of memory.findingIds) args.push('--finding',id);
    for (const [key, option] of [['stageProfiles', 'stage-profile'], ['workProfiles', 'work-profile']]) if (memory[key] !== undefined) {
      if (!Array.isArray(memory[key]) || memory[key].some(value => typeof value !== 'string' || !value)) fail('Invalid diagnostic profile assignments', 'managed_flow_input_invalid');
      for (const value of memory[key]) args.push(`--${option}`, value);
    }
    if (memory.maxParallel !== undefined) args.push('--max-parallel', String(memory.maxParallel));
    if (hash(await readFile(memory.intakeFile)) !== memory.intakeSha256) fail('Diagnostic intake differs from its pinned input', 'managed_flow_input_invalid');
  } else if (flow === "sdlc") {
    if (memoryInit !== undefined || memoryUpgrade !== undefined) fail("SDLC preparation cannot consume Memory inputs", "managed_flow_input_invalid");
    args = ["run", "prepare-vnext-specify", "--project-root", projectRoot, "--slug", slug, "--execution-routing-file", executionRoutingFile];
  } else if (flow === "mb-init" || flow === "mb-upgrade") {
    if (flow === 'mb-init' && memoryUpgrade !== undefined || flow === 'mb-upgrade' && memoryInit !== undefined)
      fail("Memory inputs belong to a different flow", "managed_flow_input_invalid");
    if (!memory || typeof memory !== "object" || Array.isArray(memory)) fail("Memory preparation requires explicit inputs", "managed_flow_input_invalid");
    validateMemoryNativeSelection(memory);
    const fields = { workspaceRoot: "workspace-root", requestId: "request-id", intakeFile: "intake-file", intakeSha256: "intake-sha256", gitRoute: "git-route", integrationBranch: "integration-branch", profile: "profile", profileFile: "profile-file", delegation: 'delegation', nativeConfigHome: 'native-config-home' };
    if (Object.keys(memory).some(key => !Object.hasOwn(fields, key) && !["stageProfiles", "workProfiles", "maxParallel", "allowLiveProbe"].includes(key))
      || ["workspaceRoot", "requestId", "intakeFile", "intakeSha256", "gitRoute", "integrationBranch"].some(key => typeof memory[key] !== "string" || !memory[key])) fail("Memory preparation requires exact scope, original intake and Git policy", "managed_flow_input_invalid");
    args = [flow === 'mb-init' ? "init" : "upgrade", "--project-root", projectRoot, "--prepare-only", "--non-interactive"];
    if (memory.allowLiveProbe === true) args.push('--allow-live-probe');
    validateMemoryParallelLimit(memory.maxParallel);
    if (memory.maxParallel !== undefined) args.push('--max-parallel', String(memory.maxParallel));
    for (const [key, option] of Object.entries(fields)) if (memory[key] !== undefined) {
      if (typeof memory[key] !== "string" || !memory[key]) fail("Invalid Memory preparation selector", "managed_flow_input_invalid");
      args.push(`--${option}`, memory[key]);
    }
    for (const [key, option] of [["stageProfiles", "stage-profile"], ["workProfiles", "work-profile"]]) if (memory[key] !== undefined) {
      if (!Array.isArray(memory[key]) || memory[key].some(value => typeof value !== "string" || !value)) fail("Invalid Memory preparation profile assignments", "managed_flow_input_invalid");
      for (const value of memory[key]) args.push(`--${option}`, value);
    }
  } else fail(`Unsupported managed flow: ${flow}`, "managed_flow_input_invalid");
  let result, allocatedRun = null;
  try { result = await commandJson(bin, args, { cwd: projectRoot, env }); }
  catch (error) {
    const partial = error.details;
    // The exited CLI explicitly retained this allocation. Reconcile that
    // request once, never retry an unknown outcome or create a replacement RUN.
    if (flow === "sdlc" || error.code !== "run_start_incomplete" || error.cleanup_error
      || partial?.authority_truncated || partial?.effect !== "partial"
      || partial.request_id !== memory.requestId || typeof partial.run_id !== "string" || !partial.run_id
      || !["reconcile_exact_request", "observe_or_reconcile_exact_request"].includes(partial.next_action)) throw error;
    allocatedRun = partial.run_id;
    result = await commandJson(bin, args, { cwd: projectRoot, env });
  }
  if (typeof result.run_id !== "string" || !result.run_id) fail("Managed preparation omitted its logical RUN", "controller_receipt_invalid");
  if (allocatedRun !== null && result.run_id !== allocatedRun) fail("Memory reconciliation returned a replacement RUN", "controller_receipt_invalid");
  if (flow !== "sdlc" && (result.flow_id !== flow || result.action !== `flow_${flow.replaceAll('-', '_')}_prepared` || result.request_id !== memory.requestId || result.controller !== undefined)) fail("Managed preparation returned a foreign or launched receipt", "controller_receipt_invalid");
  return result;
}

/** Experiment-side observation only. CLI owns Sessions, fan-out and boundaries. */
export async function observeManagedRun({ bin, env, projectRoot, runId, requestId, controllerId: retainedControllerId, contextFile, stopAfter, captureRoot, contextFor, answerFor, flow = 'sdlc', interactiveInputFor, onEvent, onTechnicalNotes = async () => {}, beforeDispatch = async () => {}, pollMs = 1000, observeOnce = false }) {
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
  let cursor = 0, boundary = null, pendingContext = null, technicalDependency = null;
  let dependencyIdentity = null, dependencyConflict = false;
  const dependencySources = new Set();
  const answered = new Set();
  const readStatus = async () => {
    let status;
    do {
      status = await call(["run", "drive", "status", ...scope, "--after", String(cursor)]);
      if (status.controller?.controller_id !== controllerId) fail("Managed owner changed; explicit recovery is required", "controller_owner_changed", { expected: controllerId, observed: status.controller });
      try { await onTechnicalNotes(status.technical_notes ?? []); }
      catch { process.stderr.write('Optional Subject technical-note projection unavailable\n'); }
      lastObserved = { controller: status.controller, cursor, provenance: "last_validated_observation" };
      for (const event of status.events ?? []) {
        if (!Number.isSafeInteger(event.sequence) || event.sequence <= cursor) fail("Controller events are not ordered", "controller_receipt_invalid");
        await onEvent?.(event, status.controller);
        if (event.type === "boundary_captured") boundary = event.data;
        if (event.type === "technical_dependency_paused") {
          const data = event.data ?? {};
          const identity = JSON.stringify([data.schema_id, data.request_id, data.generation, data.state_dir]);
          if (data.control_id !== technicalDependency?.data?.control_id) {
            dependencySources.clear(); dependencyConflict = false; dependencyIdentity = identity;
          } else if (identity !== dependencyIdentity) dependencyConflict = true;
          if (data.source_operation_id !== undefined) {
            if (typeof data.source_operation_id === "string" && data.source_operation_id) dependencySources.add(data.source_operation_id);
            else dependencyConflict = true;
          }
          technicalDependency = event;
        }
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
      if (controller.status !== expected.status || controller.stage !== expected.stage) fail(controller.error?.message ?? "Managed RUN changed while preparing operator input", controllerErrorCode(controller, "managed_run_controlled"), { controller });
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
    if (["control_requested", "starting"].includes(status.controller.status) && technicalDependency?.data?.control_id) {
        // Status observes the current scoped control; identity is checked below.
        // --control-id belongs to reconcile, not the public status command.
        const receipt = await call(["run", "control", "status", ...scope]);
        if (isCurrentTechnicalDependency(status.controller, technicalDependency, receipt, runId)) {
          if (observeOnce) return { controller: status.controller, boundary, cursor, pending_dependency: { control_id: technicalDependency.data.control_id } };
          // A concrete source operation is necessary; reconcile is idempotent
          // and independently checks all evidence in the engine. Do not renew
          // a still-draining control's observation budget on every poll.
          if (!dependencyConflict && dependencySources.size === 1
            && ["settled", "resuming"].includes(receipt.control.status)) {
            try {
              await call(["run", "control", "reconcile", ...scope, "--control-id", technicalDependency.data.control_id,
                "--request-id", `technical-observer:${hash(`${controllerId}:${technicalDependency.data.control_id}`)}`]);
            } catch (error) {
              // Ownership can retire, or another intent can supersede this
              // one, between status and reconciliation; re-read all evidence.
              if (!["controller_owner_unsettled", "run_control_state_changed", "run_control_superseded", "run_control_not_resumable", "operation_observation_lost"].includes(error.code)) throw error;
            }
          }
          await delay(Math.max(1000, pollMs));
          continue;
        }
    }
    if (status.controller.status === "control_requested") {
      fail(status.controller.error?.message ?? "Managed RUN is suspended by operator control", controllerErrorCode(status.controller, "managed_run_controlled"), { controller: status.controller, boundary });
    }
    if (["recovery_required", "capture_failed", "cancelled", "superseded"].includes(status.controller.status)) {
      fail(status.controller.error?.message ?? `Managed RUN is ${status.controller.status}`, controllerErrorCode(status.controller, "managed_run_interrupted"), { controller: status.controller, boundary });
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
        if (flow === 'interactive' && stage.stage === 'interactive') {
          const inputs = await call(['interactive', 'inputs', ...scope]);
          if (inputs.run_id !== runId || !/^[a-f0-9]{64}$/.test(inputs.sha256 ?? '')) fail('Interactive inputs belong to a different RUN', 'controller_receipt_invalid');
          const input = await whileControllerActive(() => interactiveInputFor?.(stage, run, status.controller, inputs), status.controller);
          if (input == null) return { controller: status.controller, boundary, cursor, pending_answer: { pause_id: stage.pause.id } };
          if (!['turn', 'finish'].includes(input.kind) || typeof input.intakeFile !== 'string' || !input.intakeFile
            || Object.keys(input).some(key => !['kind', 'intakeFile'].includes(key))) fail('Interactive input requires an explicit turn or finish and original intake file', 'managed_flow_input_invalid');
          await beforeDispatch();
          const receipt = await call(['interactive', input.kind, ...scope, '--request-id', `input-${hash(`${requestId}:${stage.pause.id}:${input.kind}`)}`,
            '--intake-file', input.intakeFile, '--expected-inputs-sha256', inputs.sha256]);
          if (receipt.delivery?.kind !== 'controller_answer') return { controller: status.controller, boundary, cursor,
            pending_input: { pause_id: stage.pause.id, receipt } };
          if (receipt.delivery.pause_id !== stage.pause.id || !receipt.delivery.operation_id?.startsWith(`${controllerId}:answer:`))
            fail('Interactive delivery returned a foreign answer target', 'controller_receipt_invalid', { effect: 'unknown', receipt });
          answered.add(stage.pause.id);
          if (observeOnce) return { controller: status.controller, boundary, cursor };
          await delay(pollMs); continue;
        }
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
