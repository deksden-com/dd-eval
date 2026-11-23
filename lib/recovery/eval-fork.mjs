import { createHash, randomUUID } from "node:crypto";
import { cp, mkdir, readFile, readdir, rm, stat } from "node:fs/promises";
import path from "node:path";
import { homesFile, registerRunHome, registryEnvironment } from "../homes.mjs";
import { verifyBaselineAdmission, runBaselineAdmission } from "../baseline-admission.mjs";
import { assertCheckpointLaunchable, assertExecutionEngine, verifyEngineArtifact } from "../engine-admission.mjs";
import { appendEvent, hashJson, readEvents, writeJsonAtomic } from "../runner-events.mjs";
import { commandJson } from "../process-json.mjs";
import { inheritedFlowStages } from "../flow-boundaries.mjs";
import { withRunnerLock } from "../runner-lock.mjs";
import { prepareRuntimeHarnessConfig } from "../harness/runtime-setup.mjs";
import { qualifyWorkspaceHooks } from "../harness/workspace-hooks.mjs";
import { ignoreEvalLocalState } from "../cases/task-input.mjs";
import { assertRetainedRunDefinition } from "../cases/definition-identity.mjs";
import { contained } from "../contained-path.mjs";
import { runtimeEngineIdentity, materializeEngineArtifact, inheritedForkEngine } from "../execution/engine-snapshot.mjs";
import { installRuntimeShim } from "../execution/runtime-shim.mjs";
import { assertManagedContract } from "../execution/managed-contract.mjs";
import { evalRuntimeEnv, runtimeBin, runtimeEnv } from "../execution/runtime-environment.mjs";
import { materializeExecutionContract } from "../execution-contract.mjs";
import { assertProfileCapacity } from "../execution/profile-capacity.mjs";
import { executionBudget } from "../execution/execution-scheduling.mjs";
import { loadCase } from "../cases/load-case.mjs";
import { interactionFixtureManifest, assertInteractionJudgePreflight } from "../hitl/interaction-fixtures.mjs";
import { readJson } from "../json-file.mjs";
import { materializeOperationalDecision } from "../operational-decision.mjs";
import { executionSnapshotBinding } from "./snapshot-observation.mjs";
import { isStageRunSnapshot } from "./snapshot-version.mjs";
import { withFrozenRuntimeDatabase } from "./frozen-evidence-io.mjs";

const fail = (message, code = "validation") => { throw Object.assign(new Error(message), { code }); };
const sha256 = value => createHash("sha256").update(value).digest("hex");
const now = () => new Date().toISOString();
async function exists(file) { try { await stat(file); return true; } catch { return false; } }

/** Prepare (and optionally dispatch) a derived EVAL from a sealed dd-flow
 * stage boundary. The source EVAL is never opened for writing. */
export async function runnerFork({ evalRoot, executionId = "e2e", from, output, engineVersion, integrityChecksum = null, requestId, start = false }) {
  const sourceRoot = path.resolve(evalRoot), root = path.resolve(output);
  if (typeof from !== "string" || !/^[a-z][a-z0-9-]*-[a-f0-9]{64}$/.test(from) || !path.isAbsolute(output)) fail("fork checkpoint or output is invalid", "fork_input_invalid");
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(requestId ?? "")) fail("fork requires a stable request ID", "fork_input_invalid");
  if (typeof engineVersion !== "string" || !/^[A-Za-z0-9][A-Za-z0-9._+.-]{0,127}$/.test(engineVersion) || (integrityChecksum !== null && !/^[a-f0-9]{64}$/.test(integrityChecksum))) fail("fork engine selection is invalid", "fork_input_invalid");
  if (root === sourceRoot || root.startsWith(`${sourceRoot}${path.sep}`) || sourceRoot.startsWith(`${root}${path.sep}`)) fail("fork output must not overlap source EVAL", "fork_path_conflict");
  const snapshot = path.resolve(sourceRoot, "executions", executionId, "boundaries", from);
  const intentFile = path.join(root, ".fork-intent.json"), receiptFile = path.join(root, "fork.json");
  const retainedReceipt = async freshIntent => {
    if (!(await exists(receiptFile))) return null;
    const receipt = await readJson(receiptFile), retained = receipt?.intent;
    const sameRequest = retained?.request_id === requestId && retained?.source_eval === sourceRoot
      && retained?.source_execution === executionId && retained?.snapshot === snapshot
      && retained?.engine_version === engineVersion && (retained?.integrity_checksum ?? null) === integrityChecksum;
    if (!sameRequest || freshIntent && hashJson(retained) !== hashJson(freshIntent)) fail("fork output belongs to another request", "fork_request_conflict");
    return receipt;
  };
  // A completed fork is authoritative. Its source checkpoint may already have
  // been archived, so replay must not reopen source manifest/snapshot bytes.
  const replay = await retainedReceipt(null);
  if (replay) return start ? await startForkedExecution({ root, receipt: replay }) : replay;
  const source = await readJson(path.join(sourceRoot, "manifest.json"));
  const execution = source.executions?.find(item => item.id === executionId);
  if (!execution) fail(`source EVAL has no execution: ${executionId}`, "execution_unknown");
  const snapshotBytes = await readFile(path.join(snapshot, "snapshot.json"));
  const snapshotManifest = JSON.parse(snapshotBytes);
  if (!isStageRunSnapshot(snapshotManifest) || snapshotManifest.purpose !== "stage_entry" || typeof snapshotManifest.stage_entry !== "string") fail("fork requires a supported stage-entry checkpoint", "fork_checkpoint_invalid");
  if (snapshotManifest.assessment_only === true || snapshotManifest.pack_evidence) fail("Assessment-only pack snapshots cannot be forked", "pack_history_fork_unavailable");
  // Historical contours are not evidence of a pack RUN's accepted visits.
  if (await exists(path.join(snapshot, "runtime", "db.sqlite"))) {
    await withFrozenRuntimeDatabase(snapshot, db => {
      if (typeof snapshotManifest.run_id !== "string") fail("Snapshot RUN identity is missing", "fork_checkpoint_invalid");
      const rows = db.prepare("SELECT index_json FROM runs WHERE id=?").all(snapshotManifest.run_id);
      if (rows.length !== 1) fail("Snapshot RUN authority is missing or ambiguous", "fork_checkpoint_invalid");
      if (JSON.parse(rows[0].index_json).pack_state) fail("Pack fork needs verified visit history and an admitted K04 snapshot", "pack_history_fork_unavailable");
    });
  }
  const registryFile = homesFile(), resourceHome = process.env.DD_FLOW_RESOURCE_HOME ?? source.runtime_resource_home;
  if (typeof resourceHome !== 'string' || !path.isAbsolute(resourceHome)) fail('Fork requires an absolute resource home', 'runtime_scope_identity_missing');
  const intent = { schema_id: "dd-eval/runner-fork-intent@1", request_id: requestId, source_eval: sourceRoot, source_execution: executionId, snapshot, snapshot_sha256: sha256(snapshotBytes), engine_version: engineVersion, integrity_checksum: integrityChecksum, target_stage: snapshotManifest.stage_entry, eval_registry_file: registryFile, runtime_resource_home: resourceHome };
  const loaded = await loadCase(source.case_id);
  assertCheckpointLaunchable(loaded.inputCheckpoint);
  await assertRetainedRunDefinition(source, loaded);
  const inheritedStages = inheritedFlowStages(snapshotManifest.stage_entry, loaded.value.flow.contour);
  const derivedExecution = { ...execution, id: executionId, stage: snapshotManifest.stage_entry };
  const contour = loaded.value.flow.contour;
  if (contour.indexOf(derivedExecution.stage) < 0 || contour.indexOf(derivedExecution.stage) > contour.indexOf(derivedExecution.terminal_stage)) fail("Fork checkpoint is beyond the retained execution target", "fork_checkpoint_invalid");
  if (execution.completion_scope) derivedExecution.completion_scope = { ...execution.completion_scope,
    entry_stage: derivedExecution.stage, case_contour: [...contour], requested_full_case: derivedExecution.stage === contour[0]
      && derivedExecution.terminal_stage === loaded.value.flow.terminal_stage };
  const interactionFixtures = await interactionFixtureManifest(loaded.root, [derivedExecution], source, loaded.value.flow.contour);
  await assertInteractionJudgePreflight({ caseRoot: loaded.root, executions: [derivedExecution], runProfile: { value: source.profile }, flowContour: loaded.value.flow.contour });
  assertProfileCapacity(source.subject_profile, [derivedExecution], source.execution_contract);
  const sourceEvents = await readEvents(path.join(sourceRoot, "events.jsonl"));
  const baselineAdmission = sourceEvents.findLast(event => event.executionid === executionId && event.type === "dev.dd.eval.execution.context_prepared" && event.data?.baseline_admission)?.data.baseline_admission;
  const baselineEvidence = await verifyBaselineAdmission({ reference: baselineAdmission, definition: loaded.value.baseline_admission, checkpoint: loaded.inputCheckpoint, caseRoot: loaded.root, checkResources: source.check_resources });
  const inheritedEngine = await inheritedForkEngine({ sourceRoot, executionId, engineVersion, integrityChecksum });
  // All read-only preparation precedes even the lifecycle lock's directory.
  await mkdir(path.dirname(root), { recursive: true });
  const receipt = await withRunnerLock(`${root}.lifecycle`, async () => {
    const retained = await retainedReceipt(intent);
    if (retained) return retained;
    if (await exists(root) && (await readdir(root)).length) {
      const recorded = await readJson(intentFile).catch(() => null);
      if (!recorded || hashJson(recorded.intent) !== hashJson(intent)) fail("fork output must be empty", "fork_output_not_empty");
      const allowed = new Set([".fork-intent.json", "fork-tools", "control-runtime", "executions", "manifest.json", "events.jsonl"]);
      const unknown = (await readdir(root)).filter(name => !allowed.has(name));
      if (unknown.length) fail("fork retry requires inspection because output has unowned data", "fork_retry_inspect_required");
      await Promise.all(["fork-tools", "control-runtime", "executions", "manifest.json", "events.jsonl"].map(name => rm(path.join(root, name), { recursive: true, force: true })));
    }
    // Register only after every caller-controlled input and retained source
    // artifact has been accepted.  Invalid fork arguments must not leak a
    // ghost EVAL home into the shared registry.
    await registerRunHome(root, registryEnvironment({ eval_registry_file: registryFile }));
    await mkdir(root, { recursive: true });
    await writeJsonAtomic(intentFile, { schema_id: "dd-eval/runner-fork-intent@1", intent });
    const toolsRoot = path.join(root, "fork-tools"); const managedRoot = path.join(root, "executions", executionId);
    const runId = `EVAL-${new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14)}-${randomUUID().slice(0, 8)}`;
    await mkdir(toolsRoot, { recursive: true });
    // `dd-flow run fork` installs the bytes of its own executable into the
    // restored private home before binding the RUN.  Pick that executable by
    // immutable artifact identity; never substitute the ambient router.
    // Do not route the fork through the operator's global CLI.  Apart from
    // potentially selecting different bytes, an older router may not even
    // implement `run fork`.  The verified retained engine is the only
    // executable authorized to restore this checkpoint.
    const engine = inheritedEngine.manifest;
    await installRuntimeShim(toolsRoot, engine, { resourceHome, registryFile });
    const operational = source.profile.operational_decision ? await materializeOperationalDecision({ declaration: source.profile.operational_decision, projectRoot: path.join(managedRoot, "project"), runtimeRoot: toolsRoot, evalId: runId, executionId, sourceRoot: path.join(snapshot, "project"), output: path.join(toolsRoot, "operational-decision.json") }) : null;
    const fork = await commandJson(path.join(inheritedEngine.root, engine.entrypoint), ["run", "fork", "--from", snapshot, "--output", managedRoot, "--engine-version", engineVersion, "--request-id", requestId, ...(integrityChecksum ? ["--integrity-checksum", integrityChecksum] : []), ...(operational ? ["--operational-decision-file", operational.file] : [])], { cwd: root, env: runtimeEnv(toolsRoot, { DD_FLOW_RESOURCE_HOME: resourceHome, DD_EVAL_REGISTRY_FILE: registryFile, DD_FLOW_RECOVERY_HOME: path.join(root, "recovery") }) });
    if (fork.status !== "ready" || fork.fork?.target_stage !== snapshotManifest.stage_entry) fail("dd-flow fork did not produce the requested ready stage", "fork_prepare_failed");
    await ignoreEvalLocalState(fork.fork.project_root);
    // The restored home now binds the selected artifact, but it still lacks a
    // runtime shim.  Install that shim directly from the exact artifact.
    const boundRoot = fork.fork.engine?.snapshot_root;
    if (typeof boundRoot !== "string" || !path.isAbsolute(boundRoot)) fail("Fork did not publish its bound engine artifact", "fork_engine_mismatch");
    const managedEngine = await readJson(path.join(boundRoot, "engine.json"));
    if (hashJson(runtimeEngineIdentity(managedEngine)) !== hashJson(runtimeEngineIdentity(engine))) fail("Fork bound an engine other than the selected artifact", "fork_engine_mismatch");
    await installRuntimeShim(fork.fork.dd_flow_home, managedEngine, { resourceHome, registryFile });
    if (hashJson(runtimeEngineIdentity(managedEngine)) !== hashJson(runtimeEngineIdentity(fork.fork.engine)) || managedEngine.package_version !== engineVersion || (integrityChecksum && runtimeEngineIdentity(managedEngine).integrity_checksum !== integrityChecksum)) fail("fork runtime differs from its requested or bound engine", "fork_engine_mismatch");
    await verifyEngineArtifact(managedEngine);
    if (source.execution_contract) {
      await materializeExecutionContract(fork.fork.dd_flow_home, source.execution_contract);
      await assertManagedContract({ runtimeRoot: fork.fork.dd_flow_home, projectRoot: fork.fork.project_root, runId: fork.fork.run_id, contract: source.execution_contract });
    }
    for (const workspace of new Set([fork.fork.project_root, fork.fork.workspace_root].filter(Boolean))) await qualifyWorkspaceHooks(source.subject_profile, workspace, fork.fork.dd_flow_home, { install: true, execution: source.profile.subject.execution });
    await writeJsonAtomic(path.join(managedRoot, "managed-runtime.json"), { schema_id: "dd-eval/managed-runtime@1", run_id: fork.fork.run_id, run_home: fork.fork.run_home, project_root: fork.fork.project_root, runtime_root: fork.fork.dd_flow_home, runtime_budget: executionBudget(runId, source.profile) });
    const baselineRoot = path.join(managedRoot, "baseline-admission");
    await mkdir(baselineRoot, { recursive: true });
    const retainedBaseline = { ...baselineAdmission, file: path.join(baselineRoot, "receipt.json") };
    await cp(baselineAdmission.file, retainedBaseline.file);
    for (const check of baselineEvidence.checks.filter(check => check.log)) {
      const file = contained(path.dirname(baselineAdmission.file), check.log, "baseline log");
      if (sha256(await readFile(file)) !== check.log_sha256) fail("Inherited baseline log changed", "baseline_admission_evidence_mismatch");
      const destination = contained(baselineRoot, check.log, "baseline log");
      await mkdir(path.dirname(destination), { recursive: true }); await cp(file, destination);
    }
    await verifyBaselineAdmission({ reference: retainedBaseline, definition: loaded.value.baseline_admission, checkpoint: loaded.inputCheckpoint, caseRoot: loaded.root, checkResources: source.check_resources });
    const controlRoot = path.join(root, "control-runtime");
    await mkdir(controlRoot, { recursive: true });
    const controlEngine = await materializeEngineArtifact({ source: managedEngine, sourceRoot: managedEngine.snapshot_root, runtimeRoot: controlRoot });
    await installRuntimeShim(controlRoot, controlEngine, { resourceHome, registryFile });
    const manifest = { ...source, kind: "derived", run_id: runId, eval_registry_file: registryFile, runtime_resource_home: resourceHome, runtime_control_bin: runtimeBin(controlRoot), runtime_recovery_home: path.join(root, "recovery"), evidence_contract: "dd-eval/evaluator-evidence@2", interaction_fixtures: interactionFixtures, created_at: now(), executions: [derivedExecution], derived_from: { source_eval: sourceRoot, source_execution: executionId, checkpoint: snapshot, checkpoint_sha256: intent.snapshot_sha256, inherited_stages: inheritedStages, engine: runtimeEngineIdentity(managedEngine), baseline_admission: retainedBaseline } };
    await writeJsonAtomic(path.join(root, "manifest.json"), manifest);
    await appendEvent(path.join(root, "events.jsonl"), { source: "dd-eval://runner", runId, executionId, type: "dev.dd.eval.fork.ready", data: { intent, fork, engine: runtimeEngineIdentity(engine) } });
    const receipt = { ok: true, schema_id: "dd-eval/runner-fork@1", status: "ready", intent, root, run_id: runId, execution: executionId, fork, next_command: `dd-eval runner fork --eval ${JSON.stringify(sourceRoot)} --execution ${executionId} --from ${from} --output ${JSON.stringify(root)} --engine-version ${engineVersion} --request-id ${requestId}${integrityChecksum ? ` --integrity-checksum ${integrityChecksum}` : ""} --start true` };
    await writeJsonAtomic(receiptFile, receipt);
    return receipt;
  });
  return start ? await startForkedExecution({ root, receipt }) : receipt;
}

/** Dispatch a prepared fork through the ordinary detached continuation owner. */
async function startForkedExecution({ root, receipt }) {
  // Fork preparation owns a different lock. Release it before the ordinary
  // detached continuation owner acquires lifecycle admission.
  const { requestRunnerContinuation } = await import("../eval-resume-worker.mjs");
  const continuation = await requestRunnerContinuation({ evalRoot: root, kind: "run", requestId: `fork:${receipt.run_id}` });
  const updated = { ...receipt, status: "accepted", continuation };
  await writeJsonAtomic(path.join(root, "fork.json"), updated);
  return updated;
}

/** Verify a retained fork and prepare its runtime for execution. */
export async function preparedForkRun({ root, manifest, execution, loaded }) {
  const receipt = await readJson(path.join(root, "fork.json"));
  const fork = receipt.fork?.fork;
  const attempt = path.join(root, "executions", execution.id);
  const projectRoot = path.join(attempt, "project"), runtimeRoot = path.join(attempt, "dd-flow-home");
  if (receipt.run_id !== manifest.run_id || receipt.execution !== execution.id || receipt.fork?.status !== "ready" || fork?.target_stage !== execution.stage || fork?.project_root !== projectRoot || fork?.dd_flow_home !== runtimeRoot || receipt.intent?.snapshot_sha256 !== manifest.derived_from?.checkpoint_sha256) fail("Prepared fork does not match its EVAL manifest", "fork_prepare_failed");
  const { binding: managed } = await executionSnapshotBinding(root, execution.id, { run_id: fork.run_id });
  if (hashJson(managed.runtime_budget) !== hashJson(executionBudget(manifest.run_id, manifest.profile))) fail("Prepared fork runtime scope changed", "execution_scope_invalid");
  const resolved = await commandJson(runtimeBin(runtimeRoot), ["engine", "resolve", "--project-root", projectRoot], { cwd: projectRoot, env: evalRuntimeEnv(runtimeRoot, manifest) });
  const engine = resolved.selection?.selected;
  await assertExecutionEngine(manifest, loaded.inputCheckpoint, engine);
  // A stage-entry restore preserves historical runtime bytes. Refresh the
  // mutable harness routing in the new execution home before dispatch so
  // adapter calls cannot point back into the source EVAL.
  await prepareRuntimeHarnessConfig(runtimeRoot);
  if (manifest.execution_contract) await materializeExecutionContract(runtimeRoot, manifest.execution_contract);
  await assertManagedContract({ runtimeRoot, projectRoot, runId: fork.run_id, contract: manifest.execution_contract });
  for (const workspace of new Set([projectRoot, fork.workspace_root].filter(Boolean))) await qualifyWorkspaceHooks(manifest.subject_profile, workspace, runtimeRoot, { execution: manifest.profile.subject.execution });
  let baseline = manifest.derived_from.baseline_admission;
  const retained = await verifyBaselineAdmission({ reference: baseline, definition: loaded.value.baseline_admission, checkpoint: loaded.inputCheckpoint, caseRoot: loaded.root, checkResources: manifest.check_resources });
  if (retained.schema_id === 'dd-eval/baseline-admission@3') {
    const outputRoot = path.join(attempt, 'fork-world-readiness');
    const file = path.join(outputRoot, 'receipt.json');
    if (await exists(file)) baseline = { file, sha256: sha256(await readFile(file)), project_root: projectRoot };
    else baseline = await runBaselineAdmission({ caseRoot: loaded.root, definition: loaded.value.baseline_admission, projectRoot, outputRoot, checkpoint: loaded.inputCheckpoint, inheritedBaseline: baseline,
      runtimeScope: { bin: runtimeBin(runtimeRoot), home: runtimeRoot, resourceHome: manifest.runtime_resource_home, budget: executionBudget(manifest.run_id, manifest.profile), operationId: `${manifest.run_id}:${execution.id}:fork-readiness` }, checkResources: manifest.check_resources });
    await verifyBaselineAdmission({ reference: baseline, definition: loaded.value.baseline_admission, checkpoint: loaded.inputCheckpoint, caseRoot: loaded.root, checkResources: manifest.check_resources, projectRoot });
  }
  return { run_id: fork.run_id, run_home: fork.run_home, workspace_root: fork.workspace_root, engine, baseline_admission: baseline };
}

