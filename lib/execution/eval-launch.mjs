import { stat } from "node:fs/promises";
import path from "node:path";
import { causalNodes, verifyCapturedNativeFailure } from "../evidence/native-failure.mjs";
import { isInfrastructureFailure } from "../evidence/failure-classification.mjs";
import { captureRecoveryEvidence } from "../recovery/capture-evidence.mjs";
import { cancelExecutionTree } from "../recovery/execution-cleanup.mjs";
import { preparedForkRun } from "../recovery/eval-fork.mjs";
import { restoreStageSnapshot } from "../recovery/stage-restore.mjs";
import { isInstalledFlow } from "../installed-flows.mjs";
import { runBaselineAdmission } from "../baseline-admission.mjs";
import { assertCheckpointEngine } from "../engine-admission.mjs";
import { appendEvent, hashJson, readEvents, recordOperation, writeJsonAtomic } from "../runner-events.mjs";
import { stages } from "../entry-pack.mjs";
import { commandJson } from "../process-json.mjs";
import { isObservationLoss, isManagedWait, errorRecord } from "../operation-errors.mjs";
import { recordTechnicalNote } from "../technical-notes.mjs";
import { initialFlowBoundary } from "../flow-boundaries.mjs";
import { resolveEvidenceJournals } from "../evidence/evidence-journals.mjs";
import { qualifyWorkspaceHooks } from "../harness/workspace-hooks.mjs";
import { materializeTaskInput } from "../cases/task-input.mjs";
import { admitContractProfiles } from "../harness/driver-call.mjs";
import { executionState } from "./execution-state.mjs";
import { executionDispatchBarrier } from "./dispatch-barrier.mjs";
import { collectFlowStatistics } from "./flow-observation.mjs";
import { provisionRuntimeEngine } from "./runtime-provision.mjs";
import { prepareFocusedEntries } from "./selection.mjs";
import { assertManagedContract } from "./managed-contract.mjs";
import { evalHome, evalRuntimeEnv, runtimeBin, runtimeEnv } from "./runtime-environment.mjs";
import { subjectSessionFor } from "./result-projection.mjs";
import { assertEvalExecutionDispatch } from "./admission.mjs";
import { contractProfile, materializeExecutionContract } from "../execution-contract.mjs";
import { executionBudget } from "./execution-scheduling.mjs";
import { observeManagedExecution } from "./managed-observer.mjs";
import { prepareDeclaredManagedTools } from "../cases/managed-tools.mjs";
import { prepareCaseManagedRun, writeExecutionRouting } from "../cases/managed-run.mjs";
import { prepareE2EInput } from "../cases/materialize-input.mjs";
import { retainedRunProfile } from "../cases/profile-loading.mjs";
import { interactionFixtureManifest } from "../hitl/interaction-fixtures.mjs";
import { materializeOperationalDecision } from "../operational-decision.mjs";

const fail = (message, code = "validation") => { throw Object.assign(new Error(message), { code }); };
const now = () => new Date().toISOString();
async function exists(file) { try { await stat(file); return true; } catch { return false; } }

/** Prepare and observe one execution while retaining failures and unknown outcomes. */
export async function launchEvalExecution({ root, manifest, execution, loaded, blueprint, pack = null, packRoot = null, preparedEntry = null, permits, onInfrastructureFailure = () => {} }) {
    const runId = manifest.run_id, events = path.join(root, "events.jsonl"), home = evalHome(), profile = manifest.execution_contract ? contractProfile(manifest.execution_contract, manifest.profile.subject.profile_id) : manifest.subject_profile, runProfile = retainedRunProfile(manifest);
    const opId = `${runId}:${execution.id}:launch`;
    if (manifest.kind !== "derived" && execution.mode !== "e2e" && !preparedEntry) {
      assertEvalExecutionDispatch(await readEvents(events), runId, execution, opId);
      preparedEntry = (await prepareFocusedEntries([execution], pack, packRoot))[execution.id];
    }
    const startedAt = now();
    // Keep the evidence variables in the execution scope.  The operation
    // wrapper deliberately rethrows so that this catch can write a durable
    // failed-execution record; declarations inside its callback are otherwise
    // unavailable precisely on an early terminal failure.
    const failureAttempt = path.join(root, "executions", execution.id);
    let attempt = failureAttempt;
    let projectRoot = null;
    let runtimeRoot = null;
    let lifecycle = null;
    const boundaries = [];
    const hitl = [];
    let launcher = null;
    let prompted = null;
    let restored;
    try {
      const result = await recordOperation({ eventsFile: events, source: "dd-eval://runner", runId, executionId: execution.id, traceId: runId, operationId: opId, operation: `execution.${execution.id}.launch`, beforeStart: latest => assertEvalExecutionDispatch(latest, runId, execution, opId), action: async () => {
      await executionDispatchBarrier("execution.prepare");
      if (manifest.kind !== "derived" && await exists(failureAttempt)) fail("Unstarted execution already has preparation artifacts; reconcile their ownership before launch", "execution_preparation_unproven");
      attempt = failureAttempt; projectRoot = path.join(attempt, "project"); runtimeRoot = path.join(attempt, "dd-flow-home");
      await interactionFixtureManifest(loaded.root, [execution], manifest, loaded.value?.flow?.contour ?? stages);
      if (manifest.kind === "derived") {
        restored = await preparedForkRun({ root, manifest, execution, loaded });
      } else {
      const baselineScope = { bin: runtimeBin(runtimeRoot), home: runtimeRoot, resourceHome: manifest.runtime_resource_home, budget: executionBudget(runId, runProfile.value), operationId: opId };
      const checkBaseline = projectRoot => runBaselineAdmission({
        caseRoot: loaded.root, definition: loaded.value.baseline_admission, projectRoot,
        outputRoot: path.join(attempt, "baseline-admission"), checkpoint: loaded.inputCheckpoint,
        beforeCommand: id => executionDispatchBarrier(`baseline:${id}`),
        runtimeScope: baselineScope, checkResources: manifest.check_resources,
      });
      const executionRoutingFile = await writeExecutionRouting(attempt, runProfile.value.subject, profile.id);
      if (!manifest.execution_contract) fail("New execution requires a retained execution contract", "execution_contract_missing");
      await materializeExecutionContract(runtimeRoot, manifest.execution_contract);
      const memory = isInstalledFlow(loaded.value?.flow?.id);
      let entry;
      if (execution.mode === "e2e") {
        restored = await prepareE2EInput({ projectRoot, inputCheckpoint: loaded.inputCheckpoint, flowId: initialFlowBoundary(loaded).flow, integrationBranch: loaded.value.flow.git_policy?.integration_branch });
        restored.engine = await provisionRuntimeEngine(projectRoot, runtimeRoot, { resourceHome: manifest.runtime_resource_home });
        await assertCheckpointEngine(loaded.inputCheckpoint, restored.engine, loaded.value.case_acceptance);
        restored.managed_tools = await prepareDeclaredManagedTools({ checkpoint: loaded.inputCheckpoint, bin: runtimeBin(runtimeRoot), env: runtimeEnv(runtimeRoot), projectRoot });
        const operational = await materializeOperationalDecision({ declaration: runProfile.value.operational_decision, projectRoot, runtimeRoot, evalId: runId, executionId: execution.id, commitOwnedProfile: true, flowId: initialFlowBoundary(loaded).flow });
        if (operational?.materialized_commit) restored.materialized_commit = operational.materialized_commit;
        const admission = await admitContractProfiles(manifest.execution_contract, projectRoot, runtimeRoot);
        await writeJsonAtomic(path.join(attempt, "harness-admission.json"), admission);
        restored.workspace_hooks = await qualifyWorkspaceHooks(profile, projectRoot, runtimeRoot, { install: true, execution: runProfile.value.subject.execution });
        if (!memory) {
          restored.baseline_admission = await checkBaseline(projectRoot);
          await commandJson(runtimeBin(runtimeRoot), ["project", "register", "--root", projectRoot], { cwd: projectRoot, env: runtimeEnv(runtimeRoot) });
        }
        entry = { snapshot: { kind: "bootstrap", run_id: null } };
      } else {
        entry = preparedEntry;
        restored = await restoreStageSnapshot({ home, entry, stage: execution.stage, projectRoot, runtimeRoot, executionRoutingFile, executionContract: manifest.execution_contract, resourceHome: manifest.runtime_resource_home, operational: { declaration: runProfile.value.operational_decision, evalId: runId, executionId: execution.id },flowId:initialFlowBoundary(loaded).flow });
        await materializeExecutionContract(runtimeRoot, manifest.execution_contract);
        await admitContractProfiles(manifest.execution_contract, projectRoot, runtimeRoot);
        await assertCheckpointEngine(loaded.inputCheckpoint, restored.engine, loaded.value.case_acceptance);
        restored.managed_tools = await prepareDeclaredManagedTools({ checkpoint: loaded.inputCheckpoint, bin: runtimeBin(runtimeRoot), env: runtimeEnv(runtimeRoot), projectRoot });
        const baselineProject = path.join(attempt, "baseline-project");
        await prepareE2EInput({ projectRoot: baselineProject, inputCheckpoint: loaded.inputCheckpoint, flowId: initialFlowBoundary(loaded).flow, integrationBranch: loaded.value.flow.git_policy?.integration_branch });
        for (const workspace of new Set([projectRoot, restored.workspace_root, baselineProject].filter(Boolean))) await qualifyWorkspaceHooks(profile, workspace, runtimeRoot, { install: true, execution: runProfile.value.subject.execution });
        restored.baseline_admission = await checkBaseline(baselineProject);
      }
      if (!restored.run_id) {
        const prepared = await prepareCaseManagedRun({ loaded, blueprint, runProfile, scopeId: `eval:${runId}:${execution.id}`, bin: runtimeBin(runtimeRoot), env: evalRuntimeEnv(runtimeRoot, manifest), projectRoot, slug: "eval-subject", executionRoutingFile });
        restored = { ...restored, run_id: prepared.run_id, run_home: prepared.run_root };
        if (memory && execution.mode === 'e2e') restored.baseline_admission = await checkBaseline(projectRoot);
      }
      await materializeExecutionContract(runtimeRoot, manifest.execution_contract);
      await assertManagedContract({ runtimeRoot, projectRoot, runId: restored.run_id, resourceHome: manifest.runtime_resource_home, contract: manifest.execution_contract });
      }
      await writeJsonAtomic(path.join(attempt, "managed-runtime.json"), { schema_id: "dd-eval/managed-runtime@1", run_id: restored.run_id, run_home: restored.run_home, project_root: projectRoot, runtime_root: runtimeRoot, resource_home: manifest.runtime_resource_home, runtime_budget: executionBudget(runId, runProfile.value) });
      for (const note of restored.baseline_admission?.technical_notes ?? []) await recordTechnicalNote(events, runId, { ...note, source_operation_id: opId, consequence: 'cleanup_pending' });
      await materializeTaskInput(loaded.root, blueprint, execution.stage, projectRoot);
      await qualifyWorkspaceHooks(profile, projectRoot, runtimeRoot, { execution: runProfile.value.subject.execution });
      const managedResult = await observeManagedExecution({ events, runId, manifest, execution, loaded, blueprint, profile, runProfile, permits, attempt, projectRoot, runtimeRoot, restored, opId, startedAt, boundaries, hitl,
        onProgress: value => { lifecycle = value.lifecycle ?? lifecycle; prompted = value.driver ?? prompted; } });
      lifecycle = managedResult.lifecycle; prompted = managedResult.driver;
      return managedResult;
      }});
      const completed = result.result ?? result;
      await appendEvent(events, { source: "dd-eval://runner", runId, executionId: execution.id, traceId: runId, type: "dev.dd.eval.execution.candidate_ready", data: { state: "candidate_ready", execution: execution.id, execution_operation_id: opId, result: completed } });
      return completed;
    } catch (error) {
      // An RPC timeout only says this client did not observe the native
      // operation. Keep the execution recoverable and let runner resume
      // reconcile the durable RUN/session rather than manufacturing a failed
      // flow result or sending a duplicate prompt.
      const observedEvents = await readEvents(events);
      const decision = executionState(observedEvents, runId, execution);
      if (["operation_in_progress", "operation_observation_lost", "operation_terminal"].includes(error?.code)) return decision.result;
      if (decision.cancellation?.effective || decision.operation_id !== opId) {
        if (decision.operation_id === opId && !decision.cancellation.settled) {
          let receipt;
          try { receipt = await cancelExecutionTree({ root, manifest, execution, profile, sessionId: subjectSessionFor(observedEvents, execution.id), launchUnwound: true }); }
          catch (cleanupError) { receipt = { settled: false, cleanup_error: errorRecord(cleanupError) }; }
          await appendEvent(events, { source: "dd-eval://runner", runId, executionId: execution.id, traceId: runId,
            ...(receipt.settled ? { id: `execution-cancelled:${hashJson([runId, execution.id, opId, decision.generation])}`, deduplicate: true } : {}),
            type: receipt.settled ? "dev.dd.eval.execution.cancelled" : "dev.dd.eval.execution.cancellation_unconfirmed",
            data: { execution: execution.id, execution_operation_id: opId, execution_generation: decision.generation, receipt } });
        }
        return executionState(await readEvents(events), runId, execution).result;
      }
      if (isManagedWait(error)) {
        // The RUN arbiter owns drain/settlement. Do not strengthen a pause to
        // cancellation, fail its operation, capture a candidate, or start Judge.
        const suspended = { execution: execution.id, state: "awaiting_provider", ...errorRecord(error), control: error.details?.controller ?? null, observed_at: now() };
        await appendEvent(events, { source: "dd-eval://runner", runId, executionId: execution.id, traceId: runId,
          type: "dev.dd.eval.execution.awaiting_provider", data: { ...suspended, execution_operation_id: opId } });
        return suspended;
      }
      let failureStatistics = null;
      const failedRunId = error.lifecycle?.run_id ?? lifecycle?.run_id ?? restored?.run_id ?? (error.code === "snapshot_policy_unconfirmed" ? error.details?.run_id : null) ?? null;
      if (typeof failedRunId === "string" && typeof projectRoot === "string" && typeof runtimeRoot === "string") {
        try {
          failureStatistics = await collectFlowStatistics({ projectRoot, runtimeRoot, runId: failedRunId });
          failureStatistics.observation = await resolveEvidenceJournals({ driver: prompted ?? { controller: error.details?.controller }, statistics: failureStatistics, attempt });
        } catch (statisticsError) {
          failureStatistics = { unavailable: true, error: errorRecord(statisticsError) };
        }
      }
      const evidence = { attempt: failureAttempt, run_id: failedRunId, session_id: subjectSessionFor(observedEvents, execution.id), stage: observedEvents.findLast((event) => event.executionid === execution.id && event.type === "dev.dd.eval.execution.context_prepared")?.data?.stage ?? execution.stage, lifecycle: error.lifecycle ?? lifecycle ?? null, boundaries, hitl, launcher, driver: prompted ?? null, statistics: failureStatistics };
      if (!isObservationLoss(error) && await exists(path.join(attempt, "managed-runtime.json"))) {
        try { evidence.control = await cancelExecutionTree({ root, manifest, execution, profile, sessionId: evidence.session_id, launchUnwound: true }); }
        catch (cleanupError) { evidence.control = { settled: false, cleanup_error: errorRecord(cleanupError) }; }
      }
      if (isObservationLoss(error)) {
        const uncertain = { ...evidence, execution: execution.id, execution_operation_id: opId, state: "awaiting_provider", ...errorRecord(error), error: error instanceof Error ? error.message : String(error), started_at: startedAt, observed_at: now() };
        await appendEvent(events, { source: "dd-eval://runner", runId, executionId: execution.id, traceId: runId, type: "dev.dd.eval.execution.awaiting_provider", data: uncertain });
        return uncertain;
      }
      const failure = { ...evidence, execution: execution.id, state: "failed", ...errorRecord(error), error: error instanceof Error ? error.message : String(error), ...(error?.hitl ? { hitl: [...hitl, error.hitl] } : {}), started_at: startedAt, finished_at: now() };
      if (causalNodes(failure).nodes.some(node => node.details?.failures?.some(child => child.native_binding))) {
        failure.recovery = await captureRecoveryEvidence({ root, manifest, result: failure });
        await verifyCapturedNativeFailure({ evalRoot: root, result: failure });
      }
      await appendEvent(events, { source: "dd-eval://runner", runId, executionId: execution.id, traceId: runId, type: "dev.dd.eval.execution.failed", data: { state: "failed", ...failure, execution_operation_id: opId } });
      if (runProfile.value.failure_policy.stop_run_on_infrastructure_error && isInfrastructureFailure(failure)) onInfrastructureFailure();
      return failure;
    }
}
