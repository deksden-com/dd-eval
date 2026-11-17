import { createHash } from "node:crypto";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { verifyBaselineAdmission } from "../baseline-admission.mjs";
import { appendEvent, hashJson, readEvents, recordOperation, reduceEvents } from "../runner-events.mjs";
import { commandJson } from "../process-json.mjs";
import { errorRecord, isConclusiveManagedFailure, isObservationLoss } from "../operation-errors.mjs";
import { operationContext } from "../operation-context.mjs";
import { withRunnerLock } from "../runner-lock.mjs";
import { validateEntryPack, validateCaseBlueprint } from "../flow-boundaries.mjs";
import { contained } from "../contained-path.mjs";
import { latestObservedStage } from "../evidence/stage-attribution.mjs";
import { assertRetainedRunDefinition } from "../cases/definition-identity.mjs";
import { loadCase, runnerEntry } from "../cases/load-case.mjs";
import { retainedRunProfile } from "../cases/profile-loading.mjs";
import { executionState } from "../execution/execution-state.mjs";
import { assertManagedContract } from "../execution/managed-contract.mjs";
import { evalRuntimeEnv, runtimeBin } from "../execution/runtime-environment.mjs";
import { preparedContextFor, storedExecutionResults, terminalOperation } from "../execution/result-projection.mjs";
import { assertEvalExecutionDispatch } from "../execution/admission.mjs";
import { createHarnessPermits, executionBudget } from "../execution/execution-scheduling.mjs";
import { reconcileFlow, stageRecord } from "../execution/flow-observation.mjs";
import { assertTerminalReconciliation } from "../execution/completion-evidence.mjs";
import { observeManagedExecution } from "../execution/managed-observer.mjs";
import { finalizeRunProjection } from "../evidence/finalization.mjs";
import { readJson } from "../json-file.mjs";
import { executionSnapshotBinding } from "./snapshot-observation.mjs";
import { assertExecutionEngine } from "./fork-inputs.mjs";
import { settleConclusiveHitlFailure } from "./execution-cleanup.mjs";
import { selectRecoverySource, recoverySourceFromEvents, recoveryOperationId } from "./recovery-source.mjs";

const fail = (message, code = "validation") => { throw Object.assign(new Error(message), { code }); };
const sha256 = value => createHash("sha256").update(value).digest("hex");
const now = () => new Date().toISOString();
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
async function exists(file) { try { await stat(file); return true; } catch { return false; } }

/** Reattach to the retained managed controller and recover its execution. */
export async function recoverExecution({ root, events, manifest, execution, loaded, blueprint, profile, recovery = null, terminalOnly = false }) {
  const attempt = path.join(root, "executions", execution.id); const projectRoot = path.join(attempt, "project"); const runtimeRoot = path.join(attempt, "dd-flow-home");
  if (await exists(path.join(attempt, "managed-runtime.json"))) {
    const { binding: managed } = await executionSnapshotBinding(root, execution.id);
    const env = evalRuntimeEnv(runtimeRoot, manifest);
    const resolved = await commandJson(runtimeBin(runtimeRoot), ["engine", "resolve", "--project-root", projectRoot], { cwd: projectRoot, env });
    const engine = resolved.selection?.selected;
    await assertExecutionEngine(manifest, loaded.inputCheckpoint, engine);
    const prepared = preparedContextFor(events, execution.id, execution.stage);
    await verifyBaselineAdmission({ reference: prepared.baseline_admission, definition: loaded.value.baseline_admission, checkpoint: loaded.inputCheckpoint, caseRoot: loaded.root, checkResources: manifest.check_resources, projectRoot });
    const opId = `${manifest.run_id}:${execution.id}:launch`;
    const status = await commandJson(runtimeBin(runtimeRoot), ["run", "drive", "status", "--run", managed.run_id, "--project-root", projectRoot], { cwd: projectRoot, env });
    const controller = status.controller;
    if (!controller?.controller_id || controller.run_id !== managed.run_id || controller.request_id !== `eval:${sha256(opId)}`) fail("Retained managed controller does not match the execution launch", "controller_owner_changed");
    if (managed.runtime_budget && (hashJson(managed.runtime_budget) !== hashJson(executionBudget(manifest.run_id, manifest.profile)) || hashJson(controller.runtime_budget) !== hashJson(managed.runtime_budget))) fail("Retained controller has different experiment concurrency limits", "runtime_budget_conflict");
    const dispatchId = operationContext.getStore()?.operationId ?? executionState(events, manifest.run_id, execution).operation_id;
    let beforeObserve;
    if (recovery) {
      if (terminalOnly) fail("Terminal reconciliation cannot resume a controller", "reconcile_not_terminal");
      if (recovery.run_id !== managed.run_id || typeof recovery.control_id !== "string" || sha256(await readFile(recovery.manifest)) !== recovery.manifest_sha256) fail("Managed recovery evidence does not match its retained RUN", "recovery_evidence_invalid");
      const controlStatus = await commandJson(runtimeBin(runtimeRoot), ["run", "control", "status", "--run", managed.run_id, "--project-root", projectRoot], { cwd: projectRoot, env });
      const control = controlStatus.control;
      const resumeRequestId = `eval-resume:${sha256(dispatchId)}`;
      if (control?.current !== true || control.control_id !== recovery.control_id || control.recovery_id !== recovery.recovery_id || control.capture_path !== recovery.snapshot) fail("Managed recovery source is stale", "recovery_source_stale");
      if (controlStatus.settled !== true && controlStatus.resume_operation?.request_id !== resumeRequestId) fail("Managed controller is not settled for this recovery", "recovery_capture_pending");
      beforeObserve = async () => {
        assertEvalExecutionDispatch(await readEvents(path.join(root, "events.jsonl")), manifest.run_id, execution, dispatchId);
        await assertManagedContract({ runtimeRoot, projectRoot, runId: managed.run_id, resourceHome: manifest.runtime_resource_home, contract: manifest.execution_contract });
        const resumed = await commandJson(runtimeBin(runtimeRoot), ["run", "control", "resume", "--run", managed.run_id, "--project-root", projectRoot, "--from", recovery.control_id, "--request-id", resumeRequestId, "--wait-ms", "1000"], { cwd: projectRoot, env });
        if (resumed.controller?.controller_id !== controller.controller_id) fail("Managed recovery changed its logical controller", "controller_owner_changed");
      };
    }
    if (terminalOnly && !["completed", "stop_target_reached"].includes(controller.status) && !isConclusiveManagedFailure({ details: { controller } })) fail("Managed controller has no completed capture", "reconcile_not_terminal");
    const runProfile = retainedRunProfile(manifest);
    const result = await observeManagedExecution({ events: path.join(root, "events.jsonl"), runId: manifest.run_id, manifest, execution, loaded, blueprint, profile, runProfile,
      permits: createHarnessPermits(runProfile), attempt, projectRoot, runtimeRoot, restored: { run_id: managed.run_id, engine, baseline_admission: prepared.baseline_admission },
      opId: dispatchId, startedAt: prepared.started_at, controllerId: controller.controller_id, terminalOnly, beforeObserve });
    return { ...result, recovered: true };
  }
  fail("Recovery requires a managed execution binding", "execution_migration_required");
}

/** Recover one failed execution from an explicitly retained recovery source. */
export async function runnerRecover({ evalRoot, executionId = null, fromRecoveryId }) {
  return withRunnerLock(`${path.resolve(evalRoot)}.lifecycle`, () => recoverLocked({ evalRoot, executionId, fromRecoveryId }));
}

async function recoverLocked({ evalRoot, executionId = null, fromRecoveryId }) {
  const root = path.resolve(evalRoot); const manifest = await readJson(path.join(root, "manifest.json")); const loaded = await loadCase(manifest.case_id); const profile = manifest.subject_profile; const blueprint = (await runnerEntry(manifest, loaded)).blueprint;
  await assertRetainedRunDefinition(manifest, loaded);
  const recoveryEvents = await readEvents(path.join(root, "events.jsonl"));
  if (reduceEvents(recoveryEvents).state === "finished") fail("Finished EVAL cannot create a recovery generation", "execution_terminal");
  const prior = storedExecutionResults(recoveryEvents, manifest);
  const source = recoverySourceFromEvents(recoveryEvents, executionId, fromRecoveryId)
    ?? selectRecoverySource(prior, executionId, fromRecoveryId);
  const selected = manifest.executions.filter((execution) => execution.id === source.execution && source.state === "failed");
  if (selected.length === 0 && source.recovery?.resumed_at) return { root, run_id: manifest.run_id, reused: true, executions: prior };
  if (selected.length === 0) fail(executionId ? `execution ${executionId} has no failed recovery candidate` : "no failed execution is eligible for recovery", "recovery_not_eligible");
  const recovered = [];
  for (const execution of selected) {
    // Keep using the explicit sealed source. `prior` reflects the newest
    // projection and can instead be a failed retry with only recovery_parent_id.
    const failure = source.execution === execution.id ? source : prior.find((result) => result.execution === execution.id);
    const recovery = failure?.recovery;
    if (typeof recovery?.recovery_id !== "string" || typeof recovery?.run_id !== "string") fail(`execution ${execution.id} has no sealed recovery evidence`, "recovery_evidence_missing");
    const attempt = path.join(root, "executions", execution.id);
    if (sha256(await readFile(recovery.manifest)) !== recovery.manifest_sha256) fail("recovery manifest checksum mismatch", "recovery_evidence_invalid");
    const managed = await exists(path.join(attempt, "managed-runtime.json"));
    if (!managed) fail("Legacy execution requires explicit migration before productive recovery", "execution_migration_required");
    const operationId = recoveryOperationId(await readEvents(path.join(root, "events.jsonl")), manifest.run_id, execution.id, recovery.recovery_id);
    let receipt;
    try { receipt = await recordOperation({ eventsFile: path.join(root, "events.jsonl"), source: "dd-eval://runner", runId: manifest.run_id, executionId: execution.id, traceId: manifest.run_id, operationId, operation: `execution.${execution.id}.recover`, action: async () => {
      const events = await readEvents(path.join(root, "events.jsonl"));
      const result = await recoverExecution({ root, events, manifest, execution, loaded, blueprint, profile, recovery });
      return { ...result, recovery: { ...recovery, resumed_at: now() } };
    } }); } catch (error) {
      if (isObservationLoss(error) || ["managed_run_controlled", "operation_in_progress", "operation_terminal"].includes(error.code)) throw error;
      const failed = { ...errorRecord(error), execution: execution.id, execution_operation_id: operationId, attempt, stage: error.hitl?.stage ?? execution.stage, state: "failed", code: error.code ?? "execution_failed", error: error.message, recovery_parent_id: recovery.recovery_id,
        ...await settleConclusiveHitlFailure({ error, root, manifest, execution, profile }) };
      await appendEvent(path.join(root, "events.jsonl"), { source: "dd-eval://runner", runId: manifest.run_id, executionId: execution.id, traceId: manifest.run_id, type: "dev.dd.eval.execution.failed", data: failed });
      receipt = { result: failed };
    }
    recovered.push(receipt.result ?? receipt);
  }
  const finalized = await finalizeRunProjection({ root, manifest, loaded });
  return { root, run_id: manifest.run_id, executions: finalized.results, recovered, ...(finalized.candidate ? { candidate: finalized.candidate } : {}), ...(finalized.judge ? { judge: finalized.judge } : {}), state: finalized.state };
}

/** Reconcile failed executions only after a terminal controller observation. */
export async function runnerReconcile({ evalRoot }) {
  const root = path.resolve(evalRoot); const manifest = await readJson(path.join(root, "manifest.json")); const loaded = await loadCase(manifest.case_id); const profile = manifest.subject_profile;
  let blueprint;
  if (manifest.entry_pack) {
    const packFile = contained(repoRoot, manifest.entry_pack.file, "manifest entry pack"); const pack = validateEntryPack(await readJson(packFile), loaded.value.id, loaded.value.flow);
    blueprint = validateCaseBlueprint(await readJson(contained(path.dirname(packFile), pack.stage_context, "stage_context")), loaded);
  } else blueprint = validateCaseBlueprint(await readJson(path.join(loaded.root, "entry-pack-source", "stage-context.json")), loaded);
  let events = await readEvents(path.join(root, "events.jsonl"));
  for (const execution of manifest.executions) {
    const launchId = `${manifest.run_id}:${execution.id}:launch`; const launched = terminalOperation(events, launchId);
    const completed = launched?.terminal === "completed" ? launched.result : null;
    if (completed) continue;
    if (launched?.terminal !== "failed") fail(`execution ${execution.id} is not eligible for terminal reconciliation`, "reconcile_not_eligible");
    const operationId = `${launchId}:reconcile`;
    // An early inspection must not consume the one durable reconciliation operation.
    const attempt = path.join(root, "executions", execution.id); const projectRoot = path.join(attempt, "project"); const runtimeRoot = path.join(attempt, "dd-flow-home");
    const lifecycle = await reconcileFlow({ projectRoot, runtimeRoot, expectedStage: execution.stage, runId: null }); const currentStage = latestObservedStage(lifecycle.status, execution.stage, loaded.value.flow.contour);
    assertTerminalReconciliation(execution, currentStage, stageRecord(lifecycle, currentStage));
    const receipt = await recordOperation({ eventsFile: path.join(root, "events.jsonl"), source: "dd-eval://runner", runId: manifest.run_id, executionId: execution.id, traceId: manifest.run_id, operationId, operation: `execution.${execution.id}.reconcile`, action: async () => {
      return await recoverExecution({ root, events, manifest, execution, loaded, blueprint, profile, terminalOnly: true });
    } });
    const result = receipt.result ?? receipt;
    await appendEvent(path.join(root, "events.jsonl"), { source: "dd-eval://runner", runId: manifest.run_id, executionId: execution.id, traceId: manifest.run_id, type: "dev.dd.eval.execution.candidate_ready", data: { state: "candidate_ready", execution: execution.id, result, reconciled: true } });
    events = await readEvents(path.join(root, "events.jsonl"));
  }
  const reconciled = storedExecutionResults(await readEvents(path.join(root, "events.jsonl")), manifest);
  const finalized = await finalizeRunProjection({ root, manifest, loaded });
  return { root, run_id: manifest.run_id, executions: reconciled, ...(finalized.candidate ? { candidate: finalized.candidate } : {}), ...(finalized.judge ? { judge: finalized.judge } : {}), state: finalized.state };
}
