import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile } from "node:fs/promises";
import path from "node:path";
import { homesFile, registerRunHome, registryEnvironment } from "../homes.mjs";
import { withPriorEvalRetirement, retirementEligible, prepareLaunchResources } from "../eval-retirement.mjs";
import { finalizeRunProjection } from "../evidence/finalization.mjs";
import { selectCheckResources } from "../check-resources.mjs";
import { assertCheckpointLaunchable } from "../engine-admission.mjs";
import { appendEvent, completeOperation, hashJson, readEvents, recordOperationError, reduceEvents, writeJsonAtomic } from "../runner-events.mjs";
import { stages } from "../entry-pack.mjs";
import { errorRecord, isObservationLoss, isManagedWait, isConclusiveManagedFailure, isConclusiveHitlFailure } from "../operation-errors.mjs";
import { assertFinalJudgeScope } from "../judge/final-judge-contract.mjs";
import { validateCaseBlueprint } from "../flow-boundaries.mjs";
import { withRunnerLock } from "../runner-lock.mjs";
import { captureDefinitionIdentity, assertRetainedRunDefinition } from "../cases/definition-identity.mjs";
import { contained } from "../contained-path.mjs";
import { prepareEvalInputs } from "./eval-inputs.mjs";
import { resolveRunContract } from "./run-contract-resolution.mjs";
import { cancelInfrastructureQueue, terminalExecution } from "./infrastructure-stop.mjs";
import { executionState } from "./execution-state.mjs";
import { prepareRunnerContinuation } from "./continuation-admission.mjs";
import { terminalOperation } from "./result-projection.mjs";
import { provisionRuntimeEngine } from "./runtime-provision.mjs";
import { selectCaseExecutions, selectionNeedsEntryPack, prepareFocusedEntries } from "./selection.mjs";
import { evalHome, runtimeBin, runtimeEnv } from "./runtime-environment.mjs";
import { assertEvalAdmission } from "./admission.mjs";
import { contractProfile, assertExpectedExecutionInputs, executionContextHash } from "../execution-contract.mjs";
import { runLimitedQueue, createHarnessPermits } from "./execution-scheduling.mjs";
import { launchEvalExecution } from "./eval-launch.mjs";
import { assertProfileCapacity } from "./profile-capacity.mjs";
import { recoverExecution } from "../recovery/execution-recovery.mjs";
import { settleConclusiveHitlFailure } from "../recovery/execution-cleanup.mjs";
import { fixturesValidate } from "../cases/fixture-validation.mjs";
import { loadCase, runnerEntry } from "../cases/load-case.mjs";
import { loadRunProfile, retainedRunProfile } from "../cases/profile-loading.mjs";
import { assertHitlQualification } from "../hitl/qualification-inputs.mjs";
import { semanticFingerprint } from "../semantic-decisions.mjs";
import { readJson } from "../json-file.mjs";
import { executionStages, interactionFixtureManifest, assertInteractionJudgePreflight } from "../hitl/interaction-fixtures.mjs";

const fail = (message, code = "validation") => { throw Object.assign(new Error(message), { code }); };
const now = () => new Date().toISOString();
const sha256 = value => createHash("sha256").update(value).digest("hex");

/** Validate an EVAL profile and create its prepared or productive execution. */
export async function evalRun({ profileFile, prepareOnly = false, expectedInputs }) {
  const runProfile = await loadRunProfile(profileFile);
  const loaded = await loadCase(runProfile.value.case_id);
  assertCheckpointLaunchable(loaded.inputCheckpoint);
  const { contour } = loaded.value.flow;
  const executions = selectCaseExecutions(runProfile.value, loaded.value.flow);
  const reachableStages = executionStages(executions, contour);
  runProfile.executionContract = await resolveRunContract(runProfile, reachableStages, loaded);
  const profile = contractProfile(runProfile.executionContract, runProfile.value.subject.profile_id);
  if (expectedInputs !== undefined) {
    assertExpectedExecutionInputs(expectedInputs, { profile: runProfile.value, contract: runProfile.executionContract,
      checkpoint: { id: loaded.inputCheckpoint.value.id, sha256: loaded.inputCheckpoint.sha256 },
      fixtures: await interactionFixtureManifest(loaded.root, executions, null, contour),
      contextSha256: executionContextHash(validateCaseBlueprint(await readJson(path.join(loaded.root, "entry-pack-source", "stage-context.json")), loaded), reachableStages) });
  }
  const definition = await captureDefinitionIdentity(loaded, runProfile);
  await assertHitlQualification({ loaded, runProfile, definition });
  assertFinalJudgeScope({ profile: runProfile.value, executions, assessment: loaded.assessment });
  const needsEntryPack = selectionNeedsEntryPack(executions);
  if (needsEntryPack && typeof loaded.value.entry_pack !== "string") fail("focused or segment execution requires an accepted entry pack");
  const validated = needsEntryPack ? await fixturesValidate({ caseId: runProfile.value.case_id }) : null;
  return executeEval({ runProfile, profile, loaded, validated, definition, executions, prepareOnly, expectedInputs });
}

/** Own an EVAL admission, immutable manifest and execution queue. */
export async function executeEval({ runProfile, profile, loaded, validated, definition = null, root: suppliedRoot = null, runId: suppliedRunId = null, kind = "scored", executions: suppliedExecutions = null, prepareOnly = false, preparedInputs = null, expectedInputs }) {
  const registryFile = homesFile();
  const runId = suppliedRunId ?? `EVAL-${new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14)}-${randomUUID().slice(0, 8)}`; const root = suppliedRoot ?? path.join(evalHome(), "runs", runId); const events = path.join(root, "events.jsonl");
  const prepared = preparedInputs ?? await prepareEvalInputs({ runProfile, profile, loaded, validated, executions: suppliedExecutions });
  const { executions, interactionFixtures, entryPackManifest, pack, packRoot, executionContract } = prepared;
  if (expectedInputs !== undefined) assertExpectedExecutionInputs(expectedInputs, { profile: runProfile.value, contract: executionContract,
    checkpoint: { id: loaded.inputCheckpoint.value.id, sha256: loaded.inputCheckpoint.sha256 }, fixtures: interactionFixtures,
    contextSha256: executionContextHash(prepared.directBlueprint ?? prepared.blueprint, executionStages(executions, loaded.value?.flow?.contour ?? stages)) });
  await registerRunHome(root, registryEnvironment({ eval_registry_file: registryFile }));
  await mkdir(path.dirname(root), { recursive: true });
  // Read admission only after an existing initial owner finishes publication,
  // but release lifecycle ownership before cross-EVAL retirement can wait.
  await withRunnerLock(`${path.resolve(root)}.lifecycle`, async () => assertEvalAdmission(await readEvents(events)));
  const controlRoot = path.join(path.resolve(root), "control-runtime");
  await provisionRuntimeEngine(loaded.root, controlRoot, { controlOnly: true, resourceHome: path.resolve(runtimeEnv(root).DD_FLOW_RESOURCE_HOME) });
  const launchResources = !prepareOnly ? await prepareLaunchResources(root) : null;
  if (!prepareOnly) await withPriorEvalRetirement({ caseId: loaded.value.id, resourceHome: path.resolve(runtimeEnv(root).DD_FLOW_RESOURCE_HOME), excludeRoot: root, launchResources,
    maintenanceHome: controlRoot, maintenanceBin: runtimeBin(controlRoot) }, () => writeJsonAtomic(path.join(root, "launch-reservation.json"), {
      schema_id: "dd-eval/launch-reservation@1", run_id: runId, root, resource_home: path.resolve(runtimeEnv(root).DD_FLOW_RESOURCE_HOME), resource_bindings: launchResources, created_at: now()
    }));
  // Initial and resumed observers share ownership through final projection;
  // publishing a manifest must not expose an unlocked, launchable queue.
  let result, primaryError;
  try {
  result = await withRunnerLock(`${path.resolve(root)}.lifecycle`, async () => {
    assertEvalAdmission(await readEvents(events));
    // Operator control must survive an update/removal of the ambient CLI.
    // Reuse the same isolated engine installation as productive RUNs, without
    // requiring provider configuration for this control-only home.
    const controlBin = runtimeBin(controlRoot);
    const manifest = { schema_id: "dd-eval/runner-manifest@1", eval_registry_file: registryFile, flow: structuredClone(loaded.value.flow), runtime_resource_home: path.resolve(runtimeEnv(root).DD_FLOW_RESOURCE_HOME), kind, run_id: runId, case_id: loaded.value.id, entry_pack: entryPackManifest, interaction_fixtures: interactionFixtures, input_checkpoint: { id: loaded.inputCheckpoint.value.id, sha256: loaded.inputCheckpoint.sha256 }, ...(definition ? { definition } : {}), ...(loaded.value.case_acceptance ? { case_acceptance: loaded.value.case_acceptance } : {}), profile: runProfile.value, subject_profile: profile, created_at: now(), executions };
    manifest.execution_contract = executionContract;
    manifest.check_resources = selectCheckResources(manifest.runtime_resource_home);
    await mkdir(manifest.check_resources.playwright_browsers_path, { recursive: true });
    manifest.stage_context_sha256 = executionContextHash(prepared.directBlueprint ?? prepared.blueprint, executionStages(executions, loaded.value.flow.contour));
    manifest.runtime_control_bin = controlBin;
    if (runProfile.value.semantic_decisions?.enabled) manifest.semantic_dependency_sha256 = runProfile.semanticFingerprint ?? await semanticFingerprint(runProfile.value.semantic_decisions);
    if (runProfile.coveragePolicy) {
      manifest.hitl_coverage_policy = runProfile.coveragePolicy;
      manifest.hitl_coverage_policy_sha256 = hashJson(runProfile.coveragePolicy);
    }
    manifest.runtime_recovery_home = path.join(path.resolve(root), "recovery");
    manifest.evidence_contract = "dd-eval/evaluator-evidence@2";
    await writeJsonAtomic(path.join(root, "manifest.json"), manifest); await appendEvent(events, { source: "dd-eval://runner", runId, type: "dev.dd.eval.planned", data: { state: "planned", executions: manifest.executions } });
    if (prepareOnly) return { root, run_id: runId, state: "planned" };
    return executePreparedQueue({ root, manifest, loaded, pack, packRoot, runProfile, prepared, admission: preparedQueueAdmission });
  });
  return result;
  } catch (error) { primaryError = error; throw error; }
  finally {
    if (!prepareOnly) {
      try {
        const manifest = await readJson(path.join(root, "manifest.json"));
        if (retirementEligible(manifest, await readEvents(events))) {
          const { requestRunnerContinuation } = await import("../eval-resume-worker.mjs");
          await requestRunnerContinuation({ evalRoot: root, kind: "cleanup", requestId: `auto-cleanup:initial:${runId}`, cleanupOrigin: "automatic" });
        }
      } catch (error) {
        if (primaryError) primaryError.cleanup_error ??= errorRecord(error);
        else if (result) result.cleanup_error ??= errorRecord(error);
        else if (error.code !== "ENOENT") throw error;
      }
    }
  }
}


const preparedQueueAdmission = Symbol("fresh productive admission");
async function executePreparedQueue({ root, manifest, loaded, pack, packRoot, runProfile, prepared = null, admission }) {
    if (admission !== preparedQueueAdmission) fail("Prepared queue requires a fresh productive barrier", "execution_scope_invalid");
    const reservation = await readJson(path.join(root, "launch-reservation.json"));
    if (reservation.run_id !== manifest.run_id || reservation.root !== root || reservation.resource_home !== manifest.runtime_resource_home) fail("Launch reservation belongs to another EVAL", "execution_scope_invalid");
    const directBlueprint = prepared ? prepared.directBlueprint : manifest.executions.some(execution => execution.mode === "e2e") ? validateCaseBlueprint(await readJson(path.join(loaded.root, "entry-pack-source", "stage-context.json")), loaded) : null;
    const focusedBlueprint = prepared ? prepared.blueprint : pack ? validateCaseBlueprint(await readJson(contained(packRoot, pack.stage_context, "stage_context")), loaded) : null;
    if (!prepared) {
      await interactionFixtureManifest(loaded.root, manifest.executions, manifest, loaded.value?.flow?.contour ?? stages);
      await assertInteractionJudgePreflight({ caseRoot: loaded.root, executions: manifest.executions, runProfile, flowContour: loaded.value?.flow?.contour ?? stages });
    }
    const permits = createHarnessPermits(runProfile);
    const focusedEntries = prepared?.focusedEntries ?? (manifest.kind === "derived" ? {} : await prepareFocusedEntries(manifest.executions, pack, packRoot));
    let stopAfterInfrastructureFailure = false;
    await runLimitedQueue(manifest.executions, runProfile.value.concurrency.global, execution => launchEvalExecution({ root, manifest, execution, loaded, blueprint: execution.mode === "e2e" ? directBlueprint : focusedBlueprint, pack, packRoot, preparedEntry: focusedEntries[execution.id], permits, onInfrastructureFailure: () => { stopAfterInfrastructureFailure = true; } }), () => !stopAfterInfrastructureFailure);
    await cancelInfrastructureQueue({ root, manifest });
    const finalized = await finalizeRunProjection({ root, manifest, loaded, permits });
    return { run_id: manifest.run_id, root, executions: finalized.results, judge_status: finalized.report.judge_status, ...(finalized.judge ? { judge: finalized.judge } : {}), state: finalized.state, execution_state: finalized.execution_state, cleanup_state: finalized.cleanup_state, cleanup_observation: finalized.cleanup_observation };
}

/** Read one resume admission snapshot; repeat this after cross-EVAL maintenance. */
async function readResumeAdmission(root, resumeRequestId, expectedManifestSha256) {
  const events = await readEvents(path.join(root, "events.jsonl"));
  const projection = reduceEvents(events);
  if (projection.state === "finished") fail("Finished EVAL cannot resume productive work", "execution_terminal");
  assertEvalAdmission(events);
  if (resumeRequestId !== null && projection.resume?.request_id !== resumeRequestId) fail("EVAL continuation requires its current applied resume", "control_request_stale");
  const manifestBytes = await readFile(path.join(root, "manifest.json"));
  if (expectedManifestSha256 !== null && sha256(manifestBytes) !== expectedManifestSha256) fail("EVAL continuation manifest changed", "runner_definition_drift");
  return { events, manifestBytes, manifest: JSON.parse(manifestBytes) };
}

/** Resume the retained EVAL under its lifecycle and admission barriers. */
export async function runnerResume({ evalRoot, resumeRequestId = null, expectedManifestSha256 = null }) {
  const root = path.resolve(evalRoot);
  const { events, manifestBytes, manifest, prepared } = await withRunnerLock(`${root}.lifecycle`, async () => {
    const admitted = await readResumeAdmission(root, resumeRequestId, expectedManifestSha256);
    return { ...admitted, prepared: await prepareRunnerContinuation(admitted.manifest, admitted.events, root) };
  });
  // Cross-EVAL fences precede lifecycle locks. Never wait for another cleanup
  // worker while holding a lifecycle lock it may need to retire.
  let admission;
  if (prepared && manifest.executions.some(execution => {
    const current = executionState(events, manifest.run_id, execution);
    return !current.started && !terminalExecution(events, manifest, execution);
  })) {
    const launchResources = await prepareLaunchResources(root);
    await withPriorEvalRetirement({ caseId: manifest.case_id, resourceHome: manifest.runtime_resource_home, excludeRoot: root, env: registryEnvironment(manifest), launchResources,
      maintenanceHome: path.join(root, "control-runtime"), maintenanceBin: manifest.runtime_control_bin }, () => writeJsonAtomic(path.join(root, "launch-reservation.json"), {
        schema_id: "dd-eval/launch-reservation@1", run_id: manifest.run_id, root, resource_home: manifest.runtime_resource_home, resource_bindings: launchResources, admitted_at: now()
      }));
    admission = preparedQueueAdmission;
  }
  // The initial owner may still be publishing the retained manifest/queue.
  // This lock protects that read; it does not admit productive execution.
  return withRunnerLock(`${root}.lifecycle`, () => runnerResumeLocked({ root, resumeRequestId, expectedManifestSha256: sha256(manifestBytes), admission }));
}

async function runnerResumeLocked({ root, resumeRequestId, expectedManifestSha256, admission }) {
  const { manifest } = await readResumeAdmission(root, resumeRequestId, expectedManifestSha256);
  // A replacement observer must retain the prior owner's infrastructure stop,
  // before validating or admitting any of its still-unstarted queue entries.
  await cancelInfrastructureQueue({ root, manifest });
  const prepared = await prepareRunnerContinuation(manifest, await readEvents(path.join(root, "events.jsonl")), root);
  const loaded = prepared?.loaded ?? await loadCase(manifest.case_id); const profile = manifest.subject_profile;
  const { blueprint, pack, packRoot } = prepared ?? await runnerEntry(manifest, loaded);
  let events = await readEvents(path.join(root, "events.jsonl"));
  const runProfile = retainedRunProfile(manifest);
  if (manifest.executions.every(execution => {
    const current = executionState(events, manifest.run_id, execution);
    return !current.started && current.result.state === "awaiting_provider";
  })) {
    if (!prepared) { await assertRetainedRunDefinition(manifest, loaded); assertProfileCapacity(profile, manifest.executions, manifest.execution_contract); }
    return executePreparedQueue({ root, manifest, loaded, pack, packRoot, runProfile, prepared, admission });
  }
  let queuePrepared = Boolean(prepared), stopQueue = false, permits, directBlueprint;
  for (const execution of manifest.executions) {
    const current = executionState(events, manifest.run_id, execution);
    if (current.result.state === "cancelled" && current.cancellation?.settled) continue;
    const operationId = current.operation_id;
    const operation = terminalOperation(events, operationId);
    if (operation?.terminal === "completed" && operation.result) continue;
    if (operation?.terminal === "failed") {
      // A conclusive failure only needs cleanup/capture projection. Recovery
      // remains explicit and must allocate its own productive operation.
      continue;
    }
    if (operation?.terminal) fail(`execution ${execution.id} operation is already ${operation.terminal}; recovery must create an explicit recovery operation`, "operation_terminal");
    if (!queuePrepared) {
      await assertRetainedRunDefinition(manifest, loaded);
      queuePrepared = true;
    }
    if (!operation?.started && operationId === `${manifest.run_id}:${execution.id}:launch`) {
      if (stopQueue) {
        await cancelInfrastructureQueue({ root, manifest });
        events = await readEvents(path.join(root, "events.jsonl"));
        continue;
      }
      if (!permits) {
        if (!prepared) { assertProfileCapacity(profile, manifest.executions, manifest.execution_contract); await assertInteractionJudgePreflight({ caseRoot: loaded.root, executions: manifest.executions, runProfile, flowContour: loaded.value?.flow?.contour ?? stages }); }
        directBlueprint = prepared ? prepared.directBlueprint : manifest.executions.some(item => item.mode === "e2e") ? validateCaseBlueprint(await readJson(path.join(loaded.root, "entry-pack-source", "stage-context.json")), loaded) : null;
        permits = createHarnessPermits(runProfile); queuePrepared = true;
      }
      await launchEvalExecution({ root, manifest, execution, loaded, blueprint: execution.mode === "e2e" ? directBlueprint : blueprint, pack, packRoot, preparedEntry: prepared?.focusedEntries?.[execution.id], permits, onInfrastructureFailure: () => { stopQueue = true; } });
      events = await readEvents(path.join(root, "events.jsonl"));
      continue;
    }
    let recovery;
    try { recovery = await recoverExecution({ root, events, manifest, execution, loaded, blueprint, profile }); }
    catch (error) {
      if (["operation_in_progress", "operation_terminal"].includes(error.code)) throw error;
      if (!isObservationLoss(error) && !isManagedWait(error) && !isConclusiveManagedFailure(error) && !isConclusiveHitlFailure(error)) throw error;
      await recordOperationError({ eventsFile: path.join(root, "events.jsonl"), source: "dd-eval://runner", runId: manifest.run_id, executionId: execution.id, traceId: manifest.run_id, operationId, operation: `execution.${execution.id}.reattach`, error });
      if (isObservationLoss(error) || isManagedWait(error)) throw error;
      recovery = { execution: execution.id, execution_operation_id: operationId, attempt: path.join(root, "executions", execution.id), stage: error.hitl?.stage ?? execution.stage, state: "failed", ...errorRecord(error), error: error.message, driver: { controller: error.details?.controller ?? null }, finished_at: now(),
        ...await settleConclusiveHitlFailure({ error, root, manifest, execution, profile }) };
      await appendEvent(path.join(root, "events.jsonl"), { source: "dd-eval://runner", runId: manifest.run_id, executionId: execution.id, traceId: manifest.run_id, type: "dev.dd.eval.execution.failed", data: recovery });
      events = await readEvents(path.join(root, "events.jsonl"));
      continue;
    }
    if (recovery.state === "candidate_ready") await completeOperation({ eventsFile: path.join(root, "events.jsonl"), source: "dd-eval://runner", runId: manifest.run_id, executionId: execution.id, traceId: manifest.run_id, operationId, operation: `execution.${execution.id}.${operationId.endsWith(":launch") ? "launch" : "recover"}`, result: recovery });
    else await appendEvent(path.join(root, "events.jsonl"), { source: "dd-eval://runner", runId: manifest.run_id, executionId: execution.id, traceId: manifest.run_id, type: "dev.dd.eval.execution.awaiting_provider", data: { state: "awaiting_provider", execution: execution.id, recovery } });
    events = await readEvents(path.join(root, "events.jsonl"));
  }
  const finalized = await finalizeRunProjection({ root, manifest, loaded });
  return { root, run_id: manifest.run_id, executions: finalized.results, judge_status: finalized.report.judge_status, ...(finalized.candidate ? { candidate: finalized.candidate } : {}), ...(finalized.judge ? { judge: finalized.judge } : {}), state: finalized.state, execution_state: finalized.execution_state, cleanup_state: finalized.cleanup_state, cleanup_observation: finalized.cleanup_observation };
}
