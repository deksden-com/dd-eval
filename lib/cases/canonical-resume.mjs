import { readFile } from "node:fs/promises";
import path from "node:path";
import { verifyBaselineAdmission } from "../baseline-admission.mjs";
import { checkResourceEnvironment } from "../check-resources.mjs";
import { assertCheckpointEngine } from "../engine-admission.mjs";
import { hashJson, sha256, writeJsonAtomic } from "../runner-events.mjs";
import { stages, validateEntry as validateStageEntry } from "../entry-pack.mjs";
import { commandJson } from "../process-json.mjs";
import { flowStageCatalog, initialFlowBoundary, materializeCaseStageSlice } from "../flow-boundaries.mjs";
import { harnessConfigKey } from "../harness/driver-bindings.mjs";
import { qualifyWorkspaceHooks } from "../harness/workspace-hooks.mjs";
import { admitContractProfiles } from "../harness/driver-call.mjs";
import { materializeTaskInput } from "./task-input.mjs";
import { canonicalState, assertCanonicalDefinition, canonicalResumeLock } from "./canonical-recovery.mjs";
import { writeCanonicalState } from "./canonical-state.mjs";
import { prepareCaseManagedRun, writeExecutionRouting } from "./managed-run.mjs";
import { loadRunProfile } from "./profile-loading.mjs";
import { restoreStageSnapshot } from "../recovery/stage-restore.mjs";
import { resolveRunContract } from "../execution/run-contract-resolution.mjs";
import { verifyEngineSnapshot } from "../execution/engine-snapshot.mjs";
import { reconcileFlow, restoredRoots } from "../execution/flow-observation.mjs";
import { assertManagedContract } from "../execution/managed-contract.mjs";
import { evalHome, runtimeBin, runtimeEnv } from "../execution/runtime-environment.mjs";
import { materializeExecutionContract, contractProfile } from "../execution-contract.mjs";
import { qualifiedNativeFanoutCapacity, qualifiedCoordinator, recordFanoutCapacity } from "../execution/profile-capacity.mjs";
import { observeManagedRun } from "../managed-flow-client.mjs";
import { hitlCoverageContract } from "../hitl-contract.mjs";
import { interactionJudge } from "../hitl/interaction-judge.mjs";
import { verifyRetainedHitl } from "../hitl/hitl-retained.mjs";
import { interactionFixture, authorizeHitl, assertInteractionJudgePreflight } from "../hitl/interaction-fixtures.mjs";
import { resolveHitlJudgment } from "../hitl/resolve-judgment.mjs";
import { materializeHitlAnswer, acceptedHitlAnswer, hitlProof } from "../hitl/answer-evidence.mjs";
import { readJson } from "../json-file.mjs";

const fail = (message, code = "validation") => { throw Object.assign(new Error(message), { code }); };

/** Resume the canonical reference through the next review boundary. */
export async function canonicalResume({ buildRoot, detachTurns = false }) {
  const root = path.resolve(buildRoot);
  return await canonicalResumeLock(root, async () => await canonicalResumeUnlocked({ buildRoot: root, detachTurns }));
}

async function canonicalResumeUnlocked({ buildRoot, detachTurns = false }) {
  const { root, state, loaded, blueprint } = await canonicalState(buildRoot);
  await assertCanonicalDefinition(state);
  await verifyBaselineAdmission({ reference: state.baseline_admission, definition: loaded.value.baseline_admission, checkpoint: loaded.inputCheckpoint, caseRoot: loaded.root, checkResources: state.check_resources, projectRoot: state.materialized_input?.project_root });
  const retainedEngine = await verifyEngineSnapshot(evalHome(), state.engine);
  await assertCheckpointEngine(loaded.inputCheckpoint, { ...retainedEngine.manifest, snapshot_root: retainedEngine.root }, loaded.value.case_acceptance);
  if (state.status !== "awaiting_reference_resume") fail(`canonical build is ${state.status}, not awaiting reference resume`, "canonical_transition_invalid");
  if (state.reference.session_id && !state.reference.managed) fail("Legacy reference Sessions require explicit migration before managed continuation", "reference_migration_required");
  const retainedProfile = state.reference.run_profile ?? state.reference.coverage_profile;
  const runProfile = retainedProfile ? { file: state.profile_file, value: retainedProfile, coveragePolicy: state.reference.coverage_policy ?? null, semanticFingerprint: state.reference.semantic_dependency_sha256 ?? null } : await loadRunProfile(state.profile_file);
  const attempt = path.join(root, "reference"), projectRoot = path.join(attempt, "project"), runtimeRoot = path.join(attempt, "dd-flow-home");
  if (runProfile.coveragePolicy && state.reference.coverage_policy_sha256 && hashJson(runProfile.coveragePolicy) !== state.reference.coverage_policy_sha256) fail("Reference coverage policy changed", "coverage_policy_invalid");
  runProfile.executionContract = state.reference.execution_contract ?? (state.reference.run_id ? null : await resolveRunContract(runProfile, loaded.value.flow.contour, loaded));
  let profile;
  if (runProfile.executionContract) profile = contractProfile(runProfile.executionContract, runProfile.value.subject.profile_id);
  else {
    const retained = await commandJson(runtimeBin(runtimeRoot), ["run", "status", state.reference.run_id, "--project-root", projectRoot], { cwd: projectRoot, env: runtimeEnv(runtimeRoot) });
    const snapshot = retained.index?.execution_profile;
    const effective = snapshot?.agent_profiles?.[snapshot.settings?.execution?.agent_profile_id];
    if (!effective?.model || !effective.reasoning || !effective.harness) fail("Legacy reference has no frozen Subject profile evidence", "execution_contract_missing");
    profile = { ...effective, harness: harnessConfigKey(effective.harness) };
  }
  const stage = state.current_stage;
  const entry = validateStageEntry(await readJson(path.join(root, state.entries[stage])), stage, flowStageCatalog(loaded.value.flow.contour));
  await assertInteractionJudgePreflight({ caseRoot: loaded.root, executions: [{ stage, terminal_stage: stage }], runProfile, flowContour: loaded.value?.flow?.contour ?? stages });
  const events = path.join(root, "build", "events.jsonl");
  const save = async (type, data) => writeCanonicalState(root, state, { source: "dd-eval://runner", runId: state.revision, type, data });
  if (!state.reference.run_id) {
    state.reference.execution_contract = runProfile.executionContract;
    await save("dev.dd.eval.reference.profiles_frozen", { execution_contract_sha256: runProfile.executionContract.semantic_sha256 });
    const routing = await writeExecutionRouting(attempt, runProfile.value.subject, profile.id);
    const restored = await restoreStageSnapshot({ home: evalHome(), entry, stage, projectRoot, runtimeRoot, authoringEngine: state.engine, executionRoutingFile: routing, executionContract: runProfile.executionContract,flowId:initialFlowBoundary(loaded).flow });
    await materializeExecutionContract(runtimeRoot, runProfile.executionContract);
    await admitContractProfiles(runProfile.executionContract, projectRoot, runtimeRoot);
    await qualifyWorkspaceHooks(profile, projectRoot, runtimeRoot, { install: true, execution: runProfile.value.subject.execution });
    let runId = restored.run_id;
    if (!runId) {
      const prepared = await prepareCaseManagedRun({ loaded, blueprint, runProfile, scopeId: `reference:${root}`, bin: runtimeBin(runtimeRoot), env: runtimeEnv(runtimeRoot, checkResourceEnvironment(state.check_resources)), projectRoot, slug: "reference-subject", executionRoutingFile: routing });
      runId = prepared.run_id;
    }
    if (typeof runId !== "string") fail("Reference preparation omitted its logical RUN", "controller_receipt_invalid");
    state.reference = { ...state.reference, run_profile: runProfile.value, execution_contract: runProfile.executionContract, managed: true, run_id: runId, contexts: {}, answered_pauses: {},
      ...(runProfile.value.interaction_judge?.verdict_contract === hitlCoverageContract ? { coverage_profile: runProfile.value, coverage_policy: runProfile.coveragePolicy ?? null, coverage_policy_sha256: hashJson(runProfile.coveragePolicy ?? null), semantic_dependency_sha256: runProfile.semanticFingerprint ?? null } : {}) };
    await save("dev.dd.eval.reference.run_prepared", { stage, run_id: runId });
  }
  if (!state.reference.managed) fail("Legacy reference RUN requires explicit migration", "reference_migration_required");
  await qualifyWorkspaceHooks(profile, projectRoot, runtimeRoot, { execution: runProfile.value.subject.execution });
  const runId = state.reference.run_id;
  await assertManagedContract({ runtimeRoot, projectRoot, runId, contract: runProfile.executionContract });
  const resolved = await commandJson(runtimeBin(runtimeRoot), ["engine", "resolve", "--project-root", projectRoot], { cwd: projectRoot, env: runtimeEnv(runtimeRoot) });
  await assertCheckpointEngine(loaded.inputCheckpoint, resolved.selection?.selected, loaded.value.case_acceptance);
  const contextFor = async (requested, attemptNumber = 1) => {
    if (requested !== stage) return null;
    const key = `${requested}:${attemptNumber ?? 1}`;
    const prior = state.reference.contexts?.[key];
    if (prior) {
      if (sha256(await readFile(prior.file)) !== prior.sha256) fail("Retained reference context changed", "context_checksum_mismatch");
      return prior;
    }
    const status = await commandJson(runtimeBin(runtimeRoot), ["run", "status", runId, "--project-root", projectRoot], { cwd: projectRoot, env: runtimeEnv(runtimeRoot) });
    const selected = status.continuation?.execution;
    const capacityProfile = selected?.delegation?.mode === "native" ? qualifiedCoordinator(selected.coordinator, runProfile.executionContract, profile) : profile;
    const nativeCapacity = qualifiedNativeFanoutCapacity(requested, selected, capacityProfile, loaded.value.flow.contour);
    if (nativeCapacity !== null) await recordFanoutCapacity({ projectRoot, runtimeRoot, runId, availableSlots: nativeCapacity });
    await materializeTaskInput(loaded.root, blueprint, requested, projectRoot);
    const file = path.join(attempt, "stage-context", `${requested}-${attemptNumber ?? 1}.json`);
    const slice = await materializeCaseStageSlice({ blueprint, stage: requested, roots: restoredRoots({ status }, projectRoot, runtimeRoot), output: file }, loaded);
    const reference = { file, sha256: sha256(await readFile(file)), slice };
    state.reference.contexts = { ...state.reference.contexts, [key]: reference };
    await save("dev.dd.eval.reference.context_prepared", { stage: requested, attempt: attemptNumber, context_file: file, materialized_context_sha256: reference.sha256, ...slice });
    return reference;
  };
  const first = await contextFor(stage);
  if (!state.reference.context_package) {
    const file = path.join(attempt, "managed-context.json");
    await writeJsonAtomic(file, { schema_id: "dd-flow/managed-context@1", stages: { [stage]: { file: first.file, sha256: first.sha256 } } });
    state.reference.context_package = file;
    await save("dev.dd.eval.reference.launch_prepared", { run_id: runId, context_package: file });
  }
  const answerFor = async (record, _run, controller) => {
    const pause = record.pause;
    const prior = state.reference.answered_pauses?.[pause.id];
    if (prior) {
      if (prior.receipt_file) await verifyRetainedHitl({ data: prior, expectedStage: record.stage, expectedPauseId: pause.id, expectedScope: `reference:${sha256(root)}`, expectedProfileSha256: runProfile.executionContract?.profile_sha256?.[runProfile.executionContract.roles.interaction_judge] ?? null, legacy: !prior.verdict_contract });
      else await acceptedHitlAnswer({ answerFile: prior.answer_file, answerSha256: prior.answer_sha256 }); // Historical reference journals lacked Judge proof references.
      return prior.answer_file;
    }
    const fixture = await interactionFixture(loaded.root, record.stage, state.interaction_fixtures?.[record.stage]?.interaction_fixture_sha256);
    const rounds = Object.values(state.reference.answered_pauses ?? {}).filter(item => item.stage === record.stage).length;
    const question = await authorizeHitl({ fixture, stage: record.stage, pause, rounds });
    const context = await contextFor(record.stage, record.attempt);
    if (!context) fail("Reference HITL crossed its unapproved boundary", "reference_boundary_unapproved");
    const judged = await interactionJudge({ runProfile, fixture, question, attempt, stage: record.stage, subjectProfile: profile, projectRoot, runtimeRoot, contextFile: context.file, controller, hitlBinding: { stage: record.stage, pause_id: pause.id, round: rounds + 1, scope_id: `reference:${sha256(root)}` } });
    const proof = await hitlProof(judged, `reference:${sha256(root)}`);
    const exchange = resolveHitlJudgment({ fixture, judgment: { ...judged, proof }, question, stage: record.stage });
    const answerFile = await materializeHitlAnswer({ attempt, stage: record.stage, round: rounds + 1, answer: exchange.answer });
    const evidence = { stage: record.stage, round: rounds + 1, response_ids: exchange.response_ids, answer_file: answerFile, answer_sha256: sha256(exchange.answer), pause_id: pause.id, ...proof };
    state.reference.answered_pauses = { ...state.reference.answered_pauses, [pause.id]: evidence };
    await save("dev.dd.eval.reference.hitl.matched", { ...evidence, pause_id: pause.id, judge_session_id: judged.session_id, receipt_file: judged.receipt_file });
    return answerFile;
  };
  const observed = await observeManagedRun({
    bin: runtimeBin(runtimeRoot), env: runtimeEnv(runtimeRoot, checkResourceEnvironment(state.check_resources)), projectRoot, runId,
    requestId: `reference:${sha256(root)}`, controllerId: state.reference.controller_id,
    contextFile: state.reference.context_package, stopAfter: loaded.value.flow.terminal_stage,
    captureRoot: path.join(attempt, "boundaries"), contextFor, answerFor, observeOnce: detachTurns,
    beforeDispatch: () => assertManagedContract({ runtimeRoot, projectRoot, runId, contract: runProfile.executionContract }),
    onEvent: async (event, controller) => {
      state.reference.controller_id = controller.controller_id;
      state.reference.session_id = controller.sessions.at(-1)?.session_id ?? null;
      if (event.sequence > (state.reference.event_cursor ?? 0)) {
        state.reference.event_cursor = event.sequence;
        await save("dev.dd.eval.reference.controller_event", { controller_id: controller.controller_id, ...event });
      }
    }
  });
  state.reference.controller_id = observed.controller.controller_id;
  state.reference.session_id = observed.controller.sessions.at(-1)?.session_id ?? null;
  if (observed.boundary?.stage !== stage) {
    if (!detachTurns) fail("Reference controller did not capture its review boundary", "stage_boundary_incomplete");
    await save("dev.dd.eval.reference.observing", { stage, controller_id: observed.controller.controller_id });
    return { build: root, state, next: { kind: "wait_reference_turn", stage, controller_id: observed.controller.controller_id } };
  }
  const lifecycle = await reconcileFlow({ projectRoot, runtimeRoot, expectedStage: stage, runId });
  if (lifecycle.stage_status !== "done" || sha256(await readFile(observed.boundary.manifest)) !== observed.boundary.manifest_sha256) fail("Reference capture does not match a completed stage", "stage_boundary_incomplete");
  const fixture = await interactionFixture(loaded.root, stage, state.interaction_fixtures?.[stage]?.interaction_fixture_sha256);
  if (fixture.mode === "required" && !Object.values(state.reference.answered_pauses ?? {}).some(item => item.stage === stage)) fail(`required HITL did not occur at ${stage}`, "required_hitl_missing");
  state.reference.boundary = observed.boundary;
  state.status = "waiting_for_reference_review";
  state.completed_stage = stage;
  state.context_receipt = { semantic_package_sha256: first.slice.semantic_package_sha256, context_slice_sha256: first.slice.context_slice_sha256, materialized_context_sha256: first.sha256 };
  await save("dev.dd.eval.reference.stage_done", { stage, run_id: runId, controller_id: observed.controller.controller_id, boundary: observed.boundary });
  return { build: root, state, lifecycle, next: { kind: "reference_review", message: `Review ${stage}, then run canonical boundary accept.` } };
}
