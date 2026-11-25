import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { browserCapabilitySource } from "../browser-capabilities.mjs";
import { observedCompletionScope } from "../completion-scope.mjs";
import { appendEvent, readEvents, recordControllerEvent, writeJsonAtomic } from "../runner-events.mjs";
import { stages } from "../entry-pack.mjs";
import { commandJson } from "../process-json.mjs";
import { observeJudgeCleanup } from "../judge/cleanup.mjs";
import { recordTechnicalNote, publishSubjectTechnicalNotes } from "../technical-notes.mjs";
import { materializeCaseStageSlice } from "../flow-boundaries.mjs";
import { materializeTaskInput } from "../cases/task-input.mjs";
import { reconcileFlow, collectFlowStatistics, restoredRoots } from "./flow-observation.mjs";
import { runtimeEngineIdentity } from "./engine-snapshot.mjs";
import { managedCompletionEvidence, publishExecutionStatistics } from "./completion-evidence.mjs";
import { assertManagedContract } from "./managed-contract.mjs";
import { evalRuntimeEnv, runtimeBin, runtimeEnv } from "./runtime-environment.mjs";
import { assertEvalExecutionDispatch } from "./admission.mjs";
import { observeManagedRun } from "../managed-flow-client.mjs";
import { qualifiedNativeFanoutCapacity, qualifiedCoordinator, recordFanoutCapacity } from "./profile-capacity.mjs";
import { executionBudget } from "./execution-scheduling.mjs";
import { interactionJudge } from "../hitl/interaction-judge.mjs";
import { verifyRetainedHitl, hitlEvidenceFor } from "../hitl/hitl-retained.mjs";
import { readJson } from "../json-file.mjs";
import { interactionFixture, interactiveInputKind, authorizeHitl, executionStages, interactionFixtureManifest, fixtureHash } from "../hitl/interaction-fixtures.mjs";
import { resolveHitlJudgment } from "../hitl/resolve-judgment.mjs";
import { materializeHitlAnswer, hitlProof } from "../hitl/answer-evidence.mjs";

const fail = (message, code = "validation") => { throw Object.assign(new Error(message), { code }); };
const sha256 = value => createHash("sha256").update(value).digest("hex");
const now = () => new Date().toISOString();

/** Observe one managed execution, handling retained contexts and HITL evidence. */
export async function observeManagedExecution({ events, runId, manifest, execution, loaded, blueprint, profile, runProfile, permits, attempt, projectRoot, runtimeRoot, restored, opId, startedAt, controllerId = null, terminalOnly = false, boundaries = [], hitl = [], onProgress = () => {}, beforeObserve = async () => {} }) {
  await interactionFixtureManifest(loaded.root, [execution], manifest, loaded.value?.flow?.contour ?? stages);
  const contexts = new Map(), hitlRounds = new Map();
  const beforeDispatch = async () => {
    if (terminalOnly) fail("Terminal reconciliation cannot dispatch new work", "reconcile_not_terminal");
    await assertManagedContract({ runtimeRoot, projectRoot, runId: restored.run_id, resourceHome: manifest.runtime_resource_home, contract: manifest.execution_contract });
    await appendEvent(events, { source: "dd-eval://runner", runId, executionId: execution.id, type: "dev.dd.eval.execution.dispatch_accepted",
      data: { operation: "managed_flow", execution_operation_id: opId },
      beforeAppend: prior => assertEvalExecutionDispatch(prior, runId, execution, opId) });
  };
  const retained = (await readEvents(events)).filter(event => event.executionid === execution.id);
  for (const { data } of retained.filter(event => event.type === "dev.dd.eval.execution.context_prepared")) {
    const bytes = await readFile(data.context_file);
    if (sha256(bytes) !== data.materialized_context_sha256) fail("Retained context bytes changed", "context_checksum_mismatch");
    contexts.set(`${data.stage}:${data.attempt ?? 1}`, { stage: data.stage, file: data.context_file, sha256: data.materialized_context_sha256,
      slice: { semantic_package_sha256: data.semantic_package_sha256, context_slice_sha256: data.context_slice_sha256 } });
  }
  for (const { data } of retained.filter(event => event.type === "dev.dd.eval.hitl.matched")) {
    await verifyRetainedHitl({ data, expectedScope: execution.id, expectedEvalId: runId, expectedProfileSha256: manifest.execution_contract?.profile_sha256?.[manifest.profile.interaction_judge?.profile_id] ?? null, legacy: !data.verdict_contract });
    hitlRounds.set(data.stage, Math.max(hitlRounds.get(data.stage) ?? 0, data.round));
  }
  if (controllerId) hitl.push(...await hitlEvidenceFor(retained, execution.id, runId, manifest.execution_contract));
  const contextFor = async (stage, attemptNumber = null) => {
    const key = `${stage}:${attemptNumber ?? 1}`;
    if (contexts.has(key)) return contexts.get(key);
    await beforeDispatch();
    const status = await commandJson(runtimeBin(runtimeRoot), ["run", "status", restored.run_id, "--project-root", projectRoot], { cwd: projectRoot, env: runtimeEnv(runtimeRoot) });
    const selected = status.continuation?.execution;
    const capacityProfile = selected?.delegation?.mode === "native" ? qualifiedCoordinator(selected.coordinator, manifest.execution_contract, profile) : profile;
    const nativeCapacity = qualifiedNativeFanoutCapacity(stage, selected, capacityProfile, loaded.value?.flow?.contour ?? stages);
    if (nativeCapacity !== null) await recordFanoutCapacity({ projectRoot, runtimeRoot, runId: restored.run_id, availableSlots: nativeCapacity });
    const roots = restoredRoots({ status }, projectRoot, runtimeRoot);
    let capabilityBaseline = null;
    if (restored.baseline_admission?.file) {
      const bytes = await readFile(restored.baseline_admission.file);
      if (sha256(bytes) !== restored.baseline_admission.sha256) fail('Baseline capability source changed', 'baseline_admission_evidence_mismatch');
      capabilityBaseline = JSON.parse(bytes);
    }
    const capabilitySource = await browserCapabilitySource({ baseline: capabilityBaseline, runRoot: roots.run });
    await materializeTaskInput(loaded.root, blueprint, stage, projectRoot);
    const file = path.join(attempt, "stage-context", `${stage}-${attemptNumber ?? 1}.json`);
    const slice = await materializeCaseStageSlice({ blueprint, stage, roots, output: file, runtimeSources: capabilitySource ? [capabilitySource] : [] }, loaded);
    const reference = { stage, file, sha256: sha256(await readFile(file)), slice };
    contexts.set(key, reference);
    await appendEvent(events, { source: "dd-eval://runner", runId, executionId: execution.id, type: "dev.dd.eval.execution.context_prepared", data: { stage, attempt: attemptNumber, context_file: file, runtime_engine: runtimeEngineIdentity(restored.engine), baseline_admission: restored.baseline_admission ?? null, semantic_package_sha256: slice.semantic_package_sha256, context_slice_sha256: slice.context_slice_sha256, materialized_context_sha256: reference.sha256 } });
    return reference;
  };
  const first = contexts.get(`${execution.stage}:1`) ?? (controllerId ? fail("Retained initial stage context is missing", "stage_context_missing") : await contextFor(execution.stage));
  const packageFile = path.join(attempt, "managed-context.json");
  if (!controllerId) await writeJsonAtomic(packageFile, { schema_id: "dd-flow/managed-context@1", stages: { [execution.stage]: { file: first.file, sha256: first.sha256 } } });
  const answerFor = async (record, _run, controller) => {
    const stage = record.stage, pause = record.pause;
    const prior = (await readEvents(events)).find(event => event.executionid === execution.id && event.type === "dev.dd.eval.hitl.matched" && event.data.pause_id === pause.id);
    if (prior) {
      await verifyRetainedHitl({ data: prior.data, expectedStage: stage, expectedPauseId: pause.id, expectedScope: execution.id, expectedEvalId: runId, expectedProfileSha256: manifest.execution_contract?.profile_sha256?.[manifest.profile.interaction_judge?.profile_id] ?? null, legacy: !prior.data.verdict_contract });
      hitlRounds.set(stage, Math.max(hitlRounds.get(stage) ?? 0, prior.data.round));
      return prior.data.answer_file;
    }
    const fixture = await interactionFixture(loaded.root, stage, fixtureHash(manifest, stage));
    const rounds = hitlRounds.get(stage) ?? 0;
    const question = await authorizeHitl({ fixture, stage, pause, rounds });
    const reference = [...contexts.values()].findLast(item => item.stage === stage) ?? await contextFor(stage, record.attempt);
    await beforeDispatch();
    const judgment = await interactionJudge({ runProfile, fixture, question, attempt, stage, subjectProfile: profile, projectRoot, runtimeRoot, contextFile: reference.file, permits, evalRunId: runId, controller, resourceHome: manifest.runtime_resource_home, hitlBinding: { stage, pause_id: pause.id, round: rounds + 1, scope_id: execution.id } });
    await beforeDispatch();
    const proof = await hitlProof(judgment, execution.id);
    const exchange = resolveHitlJudgment({ fixture, judgment: { ...judgment, proof }, question, stage });
    const acceptedReceipt = await readJson(judgment.receipt_file);
    if (!['jev', 'semantic_decision'].includes(acceptedReceipt.decision_source)) {
      const cleanup = await observeJudgeCleanup(path.dirname(judgment.receipt_file), acceptedReceipt);
      await recordTechnicalNote(events, runId, { code: 'interaction_judge_cleanup_pending', message: 'Canonical answer retained; Interaction Judge resources await retirement', phase: 'cleanup',
        resource_identity: path.dirname(judgment.receipt_file), consequence: 'cleanup_pending' }, cleanup.status === 'settled');
    }
    const round = rounds + 1, answerFile = await materializeHitlAnswer({ attempt, stage, round, answer: exchange.answer });
    hitlRounds.set(stage, round);
    hitl.push({ ...exchange, round, pause_id: pause.id, answer_file: answerFile, answer_sha256: sha256(exchange.answer), ...proof });
    await appendEvent(events, { source: "dd-eval://runner", runId, executionId: execution.id, type: "dev.dd.eval.hitl.matched", data: { stage, round, pause_id: pause.id, response_ids: exchange.response_ids, answer_file: answerFile, answer_sha256: sha256(exchange.answer), ...proof }, beforeAppend: prior => {
      assertEvalExecutionDispatch(prior, runId, execution, opId);
      return !prior.some(event => event.executionid === execution.id && event.type === "dev.dd.eval.hitl.matched" && event.data.pause_id === pause.id);
    } });
    return answerFile;
  };
  await beforeObserve();
  const flowId = loaded.value.flow?.id ?? 'sdlc';
  const observed = await observeManagedRun({
    bin: runtimeBin(runtimeRoot), env: evalRuntimeEnv(runtimeRoot, manifest, { DD_FLOW_RUNTIME_BUDGET: JSON.stringify(executionBudget(runId, runProfile.value)) }), projectRoot, runId: restored.run_id,
    requestId: `eval:${sha256(`${runId}:${execution.id}:launch`)}`, controllerId, contextFile: packageFile, stopAfter: execution.terminal_stage,
    captureRoot: path.join(attempt, "boundaries"), contextFor, answerFor, flow: flowId,
    interactiveInputFor: flowId === 'interactive' ? async (record, run, controller) => {
      const intakeFile = await answerFor(record, run, controller);
      const matched = (await readEvents(events)).find(event => event.executionid === execution.id && event.type === 'dev.dd.eval.hitl.matched' && event.data.pause_id === record.pause.id);
      if (!matched) fail('Interactive input lacks its retained HITL authorization', 'interactive_input_kind_invalid');
      const fixture = await interactionFixture(loaded.root, record.stage, fixtureHash(manifest, record.stage));
      return { kind: interactiveInputKind(fixture, matched.data.response_ids), intakeFile };
    } : undefined,
    onTechnicalNotes: notes => publishSubjectTechnicalNotes(events, runId, restored.run_id, notes),
    beforeDispatch,
    onEvent: async (event, controller) => {
      await recordControllerEvent({ eventsFile: events, runId, executionId: execution.id, controllerId: controller.controller_id, event });
      if (event.type === "session_created") await appendEvent(events, { source: "dd-eval://runner", runId, executionId: execution.id, type: "dev.dd.eval.subject.session_created", data: { ...event.data, controller_id: controller.controller_id }, beforeAppend: prior => !prior.some(item => item.executionid === execution.id && item.type === "dev.dd.eval.subject.session_created" && item.data.controller_id === controller.controller_id && item.data.session_id === event.data.session_id) });
      if (event.type === "boundary_captured") {
        boundaries.push(event.data);
      }
    }
  });
  onProgress({ driver: observed });
  if (observed.pending_input) throw Object.assign(new Error("Interactive input was retained but delivery needs reconciliation"), { code: "interactive_input_delivery_pending", details: { controller: observed.controller, input: observed.pending_input, effect: 'unknown' } });
  if (observed.pending_answer) throw Object.assign(new Error("Managed RUN is waiting for an authorized user answer"), { code: "managed_run_waiting_for_user", details: { controller: observed.controller, pause: observed.pending_answer } });
  const currentStage = observed.controller.stage;
  const lifecycle = await reconcileFlow({ projectRoot, runtimeRoot, expectedStage: currentStage, runId: restored.run_id,
    onTechnicalNotes: notes => publishSubjectTechnicalNotes(events, runId, restored.run_id, notes) });
  onProgress({ lifecycle });
  const launchOperationId = `${runId}:${execution.id}:launch`;
  const completion = await managedCompletionEvidence({ execution, observed, lifecycle, runId: restored.run_id, operationId: opId, launchOperationId });
  const completedStages = new Set((lifecycle.status.index?.pack_state?.visits ?? lifecycle.status.index?.stage_runs ?? []).filter(stage => stage.status === 'done').map(stage => stage.stage));
  const missingInteractions = [];
  for (const stage of executionStages([execution], loaded.value?.flow?.contour ?? stages)) {
    if (!completedStages.has(stage)) continue;
    const fixture = await interactionFixture(loaded.root, stage, fixtureHash(manifest, stage));
    if (fixture.mode === 'required' && (hitlRounds.get(stage) ?? 0) === 0) missingInteractions.push(stage);
  }
  if (missingInteractions.length) {
    completion.incomplete_evidence = { ...(completion.incomplete_evidence ?? {}), missing: 'Required HITL was not observed for completed Stages', failure: { code: 'required_hitl_missing', stages: missingInteractions } };
    await recordTechnicalNote(events, runId, { code: 'required_hitl_missing', message: 'Accepted execution retained; required interaction evidence is missing', phase: 'assessment_capture', source_operation_id: opId, consequence: 'none' });
  }
  if (!completion.candidate) await recordTechnicalNote(events, runId, { code: 'assessment_snapshot_unavailable', message: 'Accepted terminal execution retained; its assessment snapshot is unavailable or invalid', phase: 'assessment_capture', source_operation_id: opId, consequence: 'none' });
  const statistics = await collectFlowStatistics({ projectRoot, runtimeRoot, runId: restored.run_id });
  if (statistics.observation?.unavailable) await recordTechnicalNote(events, runId, { code: 'statistics_observation_unavailable', message: 'Accepted execution retained; optional statistics are unavailable', phase: 'observation', source_operation_id: opId, consequence: 'none' });
  statistics.controller = observed.controller;
  await publishExecutionStatistics(path.join(attempt, "statistics.json"), statistics, { eventsFile: events, runId, operationId: opId });
  const result = { execution: execution.id, execution_operation_id: opId, ...(launchOperationId !== opId ? { execution_launch_operation_id: launchOperationId } : {}), stage: currentStage, attempt, session_id: observed.controller.sessions.at(-1)?.session_id ?? null, run_id: restored.run_id, runtime_engine: runtimeEngineIdentity(restored.engine), semantic_package_sha256: first.slice.semantic_package_sha256, context_slice_sha256: first.slice.context_slice_sha256, materialized_context_sha256: first.sha256, launcher: null, driver: observed, lifecycle, boundaries, hitl, ...completion, statistics, started_at: startedAt, finished_at: now(), state: "candidate_ready" };
  if (execution.completion_scope) {
    result.stage_outcome = lifecycle.stage_status;
    result.completion_scope = observedCompletionScope(execution, result);
  }
  return result;
}
