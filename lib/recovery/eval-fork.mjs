import { createHash, randomUUID } from "node:crypto";
import { cp, mkdir, readFile, readdir, realpath, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { homesFile, registerRunHome, registryEnvironment } from "../homes.mjs";
import { verifyBaselineAdmission, runBaselineAdmission } from "../baseline-admission.mjs";
import { assertCheckpointLaunchable, assertExecutionEngine, verifyEngineArtifact } from "../engine-admission.mjs";
import { appendEvent, hashJson, readEvents, writeJsonAtomic } from "../runner-events.mjs";
import { commandJson } from "../process-json.mjs";
import { acceptedPackVisit, inheritedFlowStages } from "../flow-boundaries.mjs";
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
import { materializeExecutionContract, extendAdmittedStages, executionContextHash } from "../execution-contract.mjs";
import { assertProfileCapacity } from "../execution/profile-capacity.mjs";
import { executionBudget } from "../execution/execution-scheduling.mjs";
import { loadCase } from "../cases/load-case.mjs";
import { interactionFixtureManifest, assertInteractionJudgePreflight, executionStages } from "../hitl/interaction-fixtures.mjs";
import { acceptedManagedExecution } from "../completion-scope.mjs";
import { executionState } from "../execution/execution-state.mjs";
import { assertFinalJudgeScope } from "../judge/final-judge-contract.mjs";
import { validateCaseBlueprint } from "../flow-boundaries.mjs";
import { readJson } from "../json-file.mjs";
import { readRegularFile } from "../regular-file.mjs";
import { materializeOperationalDecision } from "../operational-decision.mjs";
import { executionSnapshotBinding } from "./snapshot-observation.mjs";
import { isStageRunSnapshot } from "./snapshot-version.mjs";
import { frozenFile, readFrozenFile, withFrozenRuntimeDatabase } from "./frozen-evidence-io.mjs";
import { inspectPackStagePublication } from "./pack-stage-publication.mjs";

const fail = (message, code = "validation") => { throw Object.assign(new Error(message), { code }); };
const sha256 = value => createHash("sha256").update(value).digest("hex");
const now = () => new Date().toISOString();
async function exists(file) { try { await stat(file); return true; } catch { return false; } }

/** Verify the public CLI's retained import, lineage and untouched target cursor. */
export async function verifyBoundedForkAuthority({ managedRoot, fork, intent, projectId, status, snapshot = null }) {
  const invalid = message => fail(message, "fork_authority_invalid");
  const root = await realpath(managedRoot);
  if (root !== path.resolve(managedRoot)) invalid("Fork target path traverses a symlink");
  const target = fork?.fork, home = path.join(root, "dd-flow-home"), project = path.join(root, "project");
  const inside = (owner, file) => typeof file === "string" && path.resolve(file) === file && file.startsWith(`${owner}${path.sep}`);
  if (typeof projectId !== "string" || !projectId || typeof intent.source_run_id !== "string" || !intent.source_run_id
    || !/^[a-f0-9]{64}$/.test(intent.snapshot_sha256 ?? "") || fork?.schema_id !== "dd-flow/run-fork@1" || fork.ok !== true || fork.status !== "ready" || target?.project_root !== project
    || target.dd_flow_home !== home || target.run_id !== intent.source_run_id || target.target_stage !== intent.target_stage
    || !inside(home, target.run_home) || !inside(target.run_home, target.lineage_file) || !inside(root, target.workspace_root)
    || await realpath(home) !== home || await realpath(project) !== project || await realpath(target.run_home) !== target.run_home
    || await realpath(target.workspace_root) !== target.workspace_root) invalid("Fork target escaped its owned paths or differs from source");
  const receipt = await frozenFile(root, path.join(root, "fork.json"));
  if (hashJson(JSON.parse(receipt.text)) !== hashJson(fork) || fork.intent?.request_id !== intent.request_id
    || fork.intent.snapshot !== intent.snapshot || fork.intent.snapshot_sha256 !== intent.snapshot_sha256
    || fork.intent.target_stage !== intent.target_stage || fork.intent.engine_version !== intent.engine_version
    || (fork.intent.integrity_checksum ?? null) !== intent.integrity_checksum || (fork.intent.publication_sha256 ?? null) !== (intent.publication_sha256 ?? null)) invalid("Public fork receipt differs from its request");
  const lineage = await frozenFile(root, target.lineage_file), value = JSON.parse(lineage.text);
  if (value.schema_id !== "dd-flow/run-fork-lineage@1" || value.request_id !== intent.request_id
    || value.source_snapshot !== intent.snapshot || value.source_snapshot_sha256 !== intent.snapshot_sha256
    || value.source_run_id !== intent.source_run_id || value.target_stage !== intent.target_stage) invalid("Fork lineage differs from its source boundary");
  const guard = await frozenFile(root, path.join(root, ".dd-flow-home.dd-flow-import.json")), imported = JSON.parse(guard.text);
  if (imported.schema_id !== "dd-flow/import-guard@1" || !/^[0-9a-f-]{36}$/.test(imported.import_id ?? "") || imported.status !== "completed"
    || imported.operation !== undefined || imported.source_manifest_sha256 !== intent.snapshot_sha256 || imported.runtime_home !== home
    || imported.project_root !== project || imported.workspace_root !== target.workspace_root) invalid("Fork import is not completed for this target");
  if (status?.run?.id !== intent.source_run_id || status.run.project_id !== projectId || status.run.project_root !== project
    || status.run.run_root !== target.run_home || status.index?.run_id !== intent.source_run_id)
    invalid("Fork target RUN is not the unstarted selected boundary");
  let pack = null;
  if (intent.pack_authority) {
    const authority=intent.pack_authority, state=status.index.pack_state, visit=acceptedPackVisit(status,authority.stage);
    const accepted=state?.visits?.filter(item=>item.status==='done').map(item=>Object.fromEntries(['stage','visit','attempt','outcome','result'].map(key=>[key,item[key]])));
    if (!visit || ['stage','visit','attempt','outcome','result'].some(key=>visit[key]!==authority[key])
      || !accepted || sha256(JSON.stringify(accepted))!==authority.accepted_visits_sha256
      || state.pack.flow_id!=='mb-sdlc' || state.pack.sha256!==authority.pack_sha256 || state.cursor?.stage!==intent.target_stage || state.cursor.visit!==authority.successor_visit
      || target.engine?.engine_version!==authority.engine_version || (target.engine?.integrity_checksum ?? target.engine?.integrity?.checksum)!==authority.engine_checksum
      || value.inherited_engine?.schema_id!=='dd-flow/run-engine-binding@1' || value.inherited_engine?.run_id!==intent.source_run_id
      || value.inherited_engine?.engine?.engine_version!==authority.engine_version || value.inherited_engine?.engine?.integrity_checksum!==authority.engine_checksum) invalid("Fork target pack, visit or engine differs from its source");
    const retained=path.join(home,'stage-sources',imported.import_id), copy=await frozenFile(root,path.join(retained,'snapshot.json'));
    const publication=await frozenFile(root,path.join(retained,'stage-publication.json')), engine=await frozenFile(root,path.join(retained,'stage-engine-manifest.json'));
    if (copy.sha256!==intent.snapshot_sha256 || publication.sha256!==intent.publication_sha256 || engine.sha256!==authority.engine_manifest_sha256) invalid("Fork retained source bytes differ");
    const retainedManifest=JSON.parse(copy.text);
    if (value.inherited_engine.project_root!==retainedManifest.project_root) invalid('Fork inherited engine belongs to another source project');
    const checked=inspectPackStagePublication({publication:JSON.parse(publication.text),publicationSha256:intent.publication_sha256,manifest:retainedManifest,snapshot:intent.snapshot,snapshotSha256:intent.snapshot_sha256,engineVersion:authority.engine_version,engineChecksum:authority.engine_checksum});
    if (hashJson(checked.authority)!==hashJson(authority)) invalid("Fork retained Stage authority differs");
    pack={publication_sha256:publication.sha256,engine_manifest_sha256:engine.sha256,pack_sha256:authority.pack_sha256,visit:authority.visit,attempt:authority.attempt,boundary_sha256:authority.boundary_sha256};
  } else if (status.index.pack_state || !Array.isArray(status.index.stage_runs) || status.index.stage_runs.some(stage => stage.stage === intent.target_stage || !["done", "skipped"].includes(stage.status))) invalid("Fork target RUN is not the unstarted selected boundary");
  if (snapshot !== null && (await frozenFile(snapshot, path.join(snapshot, "snapshot.json"))).sha256 !== intent.snapshot_sha256) invalid("Fork source snapshot changed during import");
  return { schema_id: "dd-eval/public-stage-fork-authority@1", source_run_id: intent.source_run_id, project_id: projectId,
    source_manifest_sha256: intent.snapshot_sha256, target_stage: intent.target_stage, receipt_sha256: receipt.sha256,
    lineage_sha256: lineage.sha256, import_guard_sha256: guard.sha256, ...(pack ? {pack, target_pack_state_sha256:hashJson(status.index.pack_state)} : {target_stage_runs_sha256: hashJson(status.index.stage_runs)}) };
}

/** Extend a stopped execution only from its own published accepted boundary. */
export function boundedForkSelection({ source, execution, snapshotManifest, snapshot, snapshotSha256, sourceEvents, through, contour }) {
  const stop = execution.completion_scope?.requested_stop_after;
  const result = executionState(sourceEvents, source.run_id, execution).result;
  const boundary = result.boundaries?.filter(item => item.stage === stop && item.manifest_sha256 === snapshotSha256 && path.resolve(item.manifest ?? "") === path.join(snapshot, "snapshot.json")) ?? [];
  const capture = snapshotManifest.boundary_capture;
  const packVisit=snapshotManifest.schema_id==='dd-flow/eval-run-snapshot@19' ? snapshotManifest.pack_stage_authority : null;
  const laterStarted = (result.lifecycle?.status?.index?.stage_runs ?? []).some(item => contour.indexOf(item.stage) > contour.indexOf(stop) && ["running", "active", "done", "completed", "failed", "skipped"].includes(item.status));
  if (source.profile?.schema_id !== "dd-eval/run-profile@2" || !source.execution_contract || source.profile.selection?.stop_after !== stop
    || !stop || execution.terminal_stage !== stop || contour.indexOf(snapshotManifest.stage_entry) !== contour.indexOf(stop) + 1
    || contour.indexOf(through) < contour.indexOf(snapshotManifest.stage_entry) || contour.indexOf(through) < 0
    || result.stage !== stop || (result.stage_outcome ?? result.lifecycle?.stage_status) !== "done"
    || snapshotManifest.run_id !== result.run_id || snapshotManifest.consistency !== "controller_boundary_writer_barrier@1" || !capture
    || capture.controller_id !== result.driver?.controller?.controller_id || typeof capture.operation_id !== "string" || !capture.operation_id
    || !/^[a-f0-9]{64}$/.test(capture.boundary_key ?? "") || capture.observation?.settled !== true
    || capture.observation.operation_id !== capture.operation_id || boundary.length !== 1
    || boundary[0].operation_id !== capture.operation_id || boundary[0].boundary_key !== capture.boundary_key
    || packVisit && ['stage','visit','attempt','outcome','result'].some(key=>result.lifecycle?.stage_visit?.[key]!==packVisit[key])
    || laterStarted || result.driver?.controller?.status !== "stop_target_reached" || !acceptedManagedExecution(result))
    fail("Fork continuation requires the accepted stopped boundary and an explicit later target", "fork_stopped_boundary_unconfirmed");
  const profile = { ...source.profile, selection: { ...source.profile.selection, stop_after: through } };
  const derivedExecution = { ...execution, stage: snapshotManifest.stage_entry, terminal_stage: through };
  const executionContract = extendAdmittedStages(source.execution_contract, executionStages([derivedExecution], contour));
  return { profile, derivedExecution, executionContract };
}

/** Prepare (and optionally dispatch) a derived EVAL from a sealed dd-flow
 * stage boundary. The source EVAL is never opened for writing. */
export async function runnerFork({ evalRoot, executionId = "e2e", from, output, engineVersion, integrityChecksum = null, publicationFile = null, publicationSha256 = null, requestId, through = null, start = false }) {
  const sourceRoot = path.resolve(evalRoot), root = path.resolve(output);
  if (typeof from !== "string" || !/^[a-z][a-z0-9-]*-[a-f0-9]{64}$/.test(from) || !path.isAbsolute(output)) fail("fork checkpoint or output is invalid", "fork_input_invalid");
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(requestId ?? "")) fail("fork requires a stable request ID", "fork_input_invalid");
  if (typeof engineVersion !== "string" || !/^[A-Za-z0-9][A-Za-z0-9._+.-]{0,127}$/.test(engineVersion) || (integrityChecksum !== null && !/^[a-f0-9]{64}$/.test(integrityChecksum))) fail("fork engine selection is invalid", "fork_input_invalid");
  if (through !== null && (typeof through !== "string" || !/^[a-z][a-z0-9-]{0,63}$/.test(through))) fail("fork continuation stage is invalid", "fork_input_invalid");
  if (Boolean(publicationFile)!==Boolean(publicationSha256) || publicationFile!==null && (typeof publicationFile!=='string' || !path.isAbsolute(publicationFile) || !/^[a-f0-9]{64}$/.test(publicationSha256))) fail('Fork publication requires an absolute file and its SHA-256','fork_input_invalid');
  if (root === sourceRoot || root.startsWith(`${sourceRoot}${path.sep}`) || sourceRoot.startsWith(`${root}${path.sep}`)) fail("fork output must not overlap source EVAL", "fork_path_conflict");
  const snapshot = path.resolve(sourceRoot, "executions", executionId, "boundaries", from);
  const intentFile = path.join(root, ".fork-intent.json"), receiptFile = path.join(root, "fork.json");
  const retainedReceipt = async freshIntent => {
    if (!(await exists(receiptFile))) return null;
    const receipt = await readJson(receiptFile), retained = receipt?.intent;
    const sameRequest = retained?.request_id === requestId && retained?.source_eval === sourceRoot
      && retained?.source_execution === executionId && retained?.snapshot === snapshot
      && retained?.engine_version === engineVersion && (retained?.integrity_checksum ?? null) === integrityChecksum && (retained?.through ?? null) === through
      && (publicationSha256 === null || retained?.publication_sha256 === publicationSha256);
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
  const snapshotBytes = through === null ? await readFile(path.join(snapshot, "snapshot.json")) : (await readFrozenFile(snapshot, path.join(snapshot, "snapshot.json"))).bytes;
  const snapshotManifest = JSON.parse(snapshotBytes);
  if (!isStageRunSnapshot(snapshotManifest) || snapshotManifest.purpose !== "stage_entry" || typeof snapshotManifest.stage_entry !== "string") fail("fork requires a supported stage-entry checkpoint", "fork_checkpoint_invalid");
  const packStage=snapshotManifest.schema_id==='dd-flow/eval-run-snapshot@19';
  if (publicationFile && !packStage) fail('Publication is supported only for a pack Stage fork','fork_input_invalid');
  if (snapshotManifest.assessment_only === true || snapshotManifest.pack_evidence && !packStage) fail("Assessment-only pack snapshots cannot be forked", "pack_history_fork_unavailable");
  if (packStage && (through===null || !integrityChecksum || snapshotManifest.stage_engine.engine_version!==engineVersion || snapshotManifest.stage_engine.engine_checksum!==integrityChecksum)) fail("Pack Stage fork requires an explicit continuation and the exact pinned engine checksum", "fork_engine_mismatch");
  if (through !== null && !(await exists(path.join(snapshot, "runtime", "db.sqlite")))) fail("Bounded fork has no retained runtime authority", "fork_checkpoint_invalid");
  // Historical contours are not evidence of a pack RUN's accepted visits.
  if (await exists(path.join(snapshot, "runtime", "db.sqlite"))) {
    await withFrozenRuntimeDatabase(snapshot, db => {
      if (typeof snapshotManifest.run_id !== "string") fail("Snapshot RUN identity is missing", "fork_checkpoint_invalid");
      const rows = db.prepare("SELECT index_json FROM runs WHERE id=?").all(snapshotManifest.run_id);
      if (rows.length !== 1) fail("Snapshot RUN authority is missing or ambiguous", "fork_checkpoint_invalid");
      const state=JSON.parse(rows[0].index_json).pack_state;
      if (state && !packStage || packStage && (!state || state.run_id!==snapshotManifest.run_id || state.project_id!==snapshotManifest.project_id || state.pack?.flow_id!=='mb-sdlc' || state.pack?.sha256!==snapshotManifest.stage_engine.pack_sha256)) fail("Pack fork needs a matching Stage source", "pack_history_fork_unavailable");
    });
  }
  const registryFile = homesFile(), resourceHome = process.env.DD_FLOW_RESOURCE_HOME ?? source.runtime_resource_home;
  if (typeof resourceHome !== 'string' || !path.isAbsolute(resourceHome)) fail('Fork requires an absolute resource home', 'runtime_scope_identity_missing');
  let intent = { schema_id: "dd-eval/runner-fork-intent@1", request_id: requestId, source_eval: sourceRoot, source_execution: executionId, snapshot, snapshot_sha256: sha256(snapshotBytes), engine_version: engineVersion, integrity_checksum: integrityChecksum, target_stage: snapshotManifest.stage_entry, eval_registry_file: registryFile, runtime_resource_home: resourceHome, ...(through === null ? {} : { through }) };
  const loaded = await loadCase(source.case_id);
  assertCheckpointLaunchable(loaded.inputCheckpoint);
  await assertRetainedRunDefinition(source, loaded);
  let inheritedStages = inheritedFlowStages(snapshotManifest.stage_entry, loaded.value.flow.contour), inheritedVisits = null;
  const contour = loaded.value.flow.contour;
  const sourceEvents = await readEvents(path.join(sourceRoot, "events.jsonl"));
  let profile = source.profile, executionContract = source.execution_contract;
  let derivedExecution = { ...execution, id: executionId, stage: snapshotManifest.stage_entry };
  if (through !== null) {
    ({ profile, derivedExecution, executionContract } = boundedForkSelection({ source, execution, snapshotManifest, snapshot, snapshotSha256: intent.snapshot_sha256, sourceEvents, through, contour }));
  }
  if (contour.indexOf(derivedExecution.stage) < 0 || contour.indexOf(derivedExecution.stage) > contour.indexOf(derivedExecution.terminal_stage)) fail("Fork checkpoint is beyond the retained execution target", "fork_checkpoint_invalid");
  if (execution.completion_scope) derivedExecution.completion_scope = { ...execution.completion_scope,
    entry_stage: derivedExecution.stage, effective_terminal_stage: derivedExecution.terminal_stage, requested_stop_after: profile.selection.stop_after ?? null, case_contour: [...contour], requested_full_case: derivedExecution.stage === contour[0]
      && derivedExecution.terminal_stage === loaded.value.flow.terminal_stage };
  const interactionFixtures = await interactionFixtureManifest(loaded.root, [derivedExecution], through === null ? source : null, contour);
  if (through !== null) for (const [stage, pin] of Object.entries(interactionFixtures)) if (source.interaction_fixtures?.[stage] && hashJson(source.interaction_fixtures[stage]) !== hashJson(pin)) fail("Inherited interaction fixture changed", "interaction_fixture_checksum_mismatch");
  await assertInteractionJudgePreflight({ caseRoot: loaded.root, executions: [derivedExecution], runProfile: { value: profile }, flowContour: contour });
  if (through !== null) assertFinalJudgeScope({ profile, executions: [derivedExecution], assessment: loaded.assessment });
  assertProfileCapacity(source.subject_profile, [derivedExecution], executionContract);
  const stageContextHash = through === null ? source.stage_context_sha256 : executionContextHash(validateCaseBlueprint(await readJson(path.join(loaded.root, "entry-pack-source", "stage-context.json")), loaded), executionStages([derivedExecution], contour));
  const baselineAdmission = sourceEvents.findLast(event => event.executionid === executionId && event.type === "dev.dd.eval.execution.context_prepared" && event.data?.baseline_admission)?.data.baseline_admission;
  const baselineEvidence = await verifyBaselineAdmission({ reference: baselineAdmission, definition: loaded.value.baseline_admission, checkpoint: loaded.inputCheckpoint, caseRoot: loaded.root, checkResources: source.check_resources });
  const inheritedEngine = await inheritedForkEngine({ sourceRoot, executionId, engineVersion, integrityChecksum });
  let stagePublication=null;
  if (packStage) {
    let exported;
    if (publicationFile) {
      const bytes=await readRegularFile(publicationFile); let publication;
      try { publication=JSON.parse(bytes.toString('utf8')); } catch { fail('Stage publication is malformed','fork_publication_invalid'); }
      if (sha256(bytes)!==publicationSha256 || !bytes.equals(Buffer.from(JSON.stringify(publication)))) fail('Stage publication bytes differ from the retained digest','fork_publication_invalid');
      exported={publication,sha256:publicationSha256};
    } else {
      const binding=await executionSnapshotBinding(sourceRoot,executionId,{run_id:snapshotManifest.run_id});
      exported=await commandJson(path.join(inheritedEngine.root,inheritedEngine.manifest.entrypoint), ['run','snapshot','publication',snapshotManifest.run_id,'--project-root',binding.binding.project_root,'--snapshot-id',snapshotManifest.boundary_capture.operation_id], {cwd:binding.binding.project_root,env:evalRuntimeEnv(binding.binding.runtime_root,source)});
      if (exported?.ok!==true || exported.dispatch_authorized!==false) fail('Stage publication export is unavailable','fork_publication_invalid');
    }
    stagePublication=inspectPackStagePublication({publication:exported.publication,publicationSha256:exported.sha256,manifest:snapshotManifest,snapshot,snapshotSha256:intent.snapshot_sha256,engineVersion,engineChecksum:integrityChecksum});
    if ((await frozenFile(snapshot,path.join(snapshot,'stage-engine-manifest.json'))).sha256!==stagePublication.authority.engine_manifest_sha256) fail('Stage engine manifest changed','fork_engine_mismatch');
    inheritedVisits=JSON.parse(exported.publication.operation.input_json).pack_boundary.accepted;
    inheritedStages=inheritedVisits.map(visit=>visit.stage);
    intent={...intent,publication_sha256:exported.sha256,pack_authority:stagePublication.authority};
  }
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
      if (through !== null && (await readdir(root)).some(name => name !== ".fork-intent.json")) fail("Bounded fork target is unconfirmed; inspect its original import before retry", "fork_retry_inspect_required");
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
    const publicationFile=stagePublication ? path.join(toolsRoot,'stage-publication.json') : null;
    if (publicationFile) await writeFile(publicationFile,stagePublication.bytes,{flag:'wx',mode:0o600});
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
    const fork = await commandJson(path.join(inheritedEngine.root, engine.entrypoint), ["run", "fork", "--from", snapshot, "--output", managedRoot, "--engine-version", engineVersion, "--request-id", requestId, ...(integrityChecksum ? ["--integrity-checksum", integrityChecksum] : []), ...(publicationFile ? ['--publication-file',publicationFile,'--publication-sha256',intent.publication_sha256] : []), ...(operational ? ["--operational-decision-file", operational.file] : [])], { cwd: root, env: runtimeEnv(toolsRoot, { DD_FLOW_RESOURCE_HOME: resourceHome, DD_EVAL_REGISTRY_FILE: registryFile, DD_FLOW_RECOVERY_HOME: path.join(root, "recovery") }) });
    if (fork.status !== "ready" || fork.fork?.target_stage !== snapshotManifest.stage_entry) fail("dd-flow fork did not produce the requested ready stage", "fork_prepare_failed");
    // The restored home now binds the selected artifact, but it still lacks a
    // runtime shim.  Install that shim directly from the exact artifact.
    const boundRoot = fork.fork.engine?.snapshot_root;
    if (typeof boundRoot !== "string" || !path.isAbsolute(boundRoot)) fail("Fork did not publish its bound engine artifact", "fork_engine_mismatch");
    const managedEngine = await readJson(path.join(boundRoot, "engine.json"));
    if (hashJson(runtimeEngineIdentity(managedEngine)) !== hashJson(runtimeEngineIdentity(engine))) fail("Fork bound an engine other than the selected artifact", "fork_engine_mismatch");
    await installRuntimeShim(fork.fork.dd_flow_home, managedEngine, { resourceHome, registryFile });
    if (hashJson(runtimeEngineIdentity(managedEngine)) !== hashJson(runtimeEngineIdentity(fork.fork.engine)) || managedEngine.package_version !== engineVersion || (integrityChecksum && runtimeEngineIdentity(managedEngine).integrity_checksum !== integrityChecksum)) fail("fork runtime differs from its requested or bound engine", "fork_engine_mismatch");
    await verifyEngineArtifact(managedEngine);
    let publicForkAuthority = null;
    if (through !== null) {
      const publicIntent = { ...intent, source_run_id: snapshotManifest.run_id };
      const status = await commandJson(runtimeBin(fork.fork.dd_flow_home), ["run", "status", fork.fork.run_id, "--project-root", fork.fork.project_root], { cwd: fork.fork.project_root, env: runtimeEnv(fork.fork.dd_flow_home) });
      const authority = await verifyBoundedForkAuthority({ managedRoot, fork, intent: publicIntent, projectId: snapshotManifest.project_id, status, snapshot });
      const file = path.join(managedRoot, "public-fork-authority.json");
      await writeJsonAtomic(file, { intent: publicIntent, authority });
      publicForkAuthority = { file, sha256: sha256(await readFile(file)) };
    }
    await ignoreEvalLocalState(fork.fork.project_root);
    if (executionContract) {
      await materializeExecutionContract(fork.fork.dd_flow_home, executionContract);
      await assertManagedContract({ runtimeRoot: fork.fork.dd_flow_home, projectRoot: fork.fork.project_root, runId: fork.fork.run_id, contract: executionContract });
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
    const manifest = { ...source, kind: "derived", run_id: runId, eval_registry_file: registryFile, runtime_resource_home: resourceHome, runtime_control_bin: runtimeBin(controlRoot), runtime_recovery_home: path.join(root, "recovery"), evidence_contract: "dd-eval/evaluator-evidence@2", profile, execution_contract: executionContract, stage_context_sha256: stageContextHash, interaction_fixtures: interactionFixtures, created_at: now(), executions: [derivedExecution], derived_from: { source_eval: sourceRoot, source_execution: executionId, checkpoint: snapshot, checkpoint_sha256: intent.snapshot_sha256, inherited_stages: inheritedStages, ...(inheritedVisits ? {inherited_visits:inheritedVisits} : {}), engine: runtimeEngineIdentity(managedEngine), baseline_admission: retainedBaseline, ...(through === null ? {} : { source_profile_sha256: hashJson(source.profile), source_contract_sha256: source.execution_contract.integrity_sha256, through, public_fork_authority: publicForkAuthority }) } };
    await writeJsonAtomic(path.join(root, "manifest.json"), manifest);
    await appendEvent(path.join(root, "events.jsonl"), { source: "dd-eval://runner", runId, executionId, type: "dev.dd.eval.fork.ready", data: { intent, fork, engine: runtimeEngineIdentity(engine) } });
    const receipt = { ok: true, schema_id: "dd-eval/runner-fork@1", status: "ready", intent, root, run_id: runId, execution: executionId, fork, ...(through === null ? {} : { derived_binding: forkManifestBinding(manifest, derivedExecution) }), next_command: `dd-eval runner fork --eval ${JSON.stringify(sourceRoot)} --execution ${executionId} --from ${from} --output ${JSON.stringify(root)} --engine-version ${engineVersion} --request-id ${requestId}${integrityChecksum ? ` --integrity-checksum ${integrityChecksum}` : ""}${through ? ` --through ${through}` : ""} --start true` };
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

function forkManifestBinding(manifest, execution) {
  return hashJson({ profile: manifest.profile, execution_contract: manifest.execution_contract, interaction_fixtures: manifest.interaction_fixtures,
    stage_context_sha256: manifest.stage_context_sha256, execution, derived_from: manifest.derived_from });
}

/** Verify a retained fork and prepare its runtime for execution. */
export async function preparedForkRun({ root, manifest, execution, loaded }) {
  const receipt = await readJson(path.join(root, "fork.json"));
  const fork = receipt.fork?.fork;
  const attempt = path.join(root, "executions", execution.id);
  const projectRoot = path.join(attempt, "project"), runtimeRoot = path.join(attempt, "dd-flow-home");
  if (receipt.run_id !== manifest.run_id || receipt.execution !== execution.id || receipt.fork?.status !== "ready" || fork?.target_stage !== execution.stage || fork?.project_root !== projectRoot || fork?.dd_flow_home !== runtimeRoot || receipt.intent?.snapshot_sha256 !== manifest.derived_from?.checkpoint_sha256) fail("Prepared fork does not match its EVAL manifest", "fork_prepare_failed");
  if (receipt.intent?.through && (receipt.intent.through !== manifest.derived_from?.through || execution.terminal_stage !== receipt.intent.through
    || manifest.profile?.selection?.stop_after !== receipt.intent.through || receipt.derived_binding !== forkManifestBinding(manifest, execution))) fail("Prepared fork continuation binding changed", "fork_prepare_failed");
  const { binding: managed } = await executionSnapshotBinding(root, execution.id, { run_id: fork.run_id });
  if (hashJson(managed.runtime_budget) !== hashJson(executionBudget(manifest.run_id, manifest.profile))) fail("Prepared fork runtime scope changed", "execution_scope_invalid");
  const resolved = await commandJson(runtimeBin(runtimeRoot), ["engine", "resolve", "--project-root", projectRoot], { cwd: projectRoot, env: evalRuntimeEnv(runtimeRoot, manifest) });
  const engine = resolved.selection?.selected;
  await assertExecutionEngine(manifest, loaded.inputCheckpoint, engine);
  if (receipt.intent?.through) {
    const reference = manifest.derived_from?.public_fork_authority;
    if (reference?.file !== path.join(attempt, "public-fork-authority.json")) fail("Bounded fork authority is missing", "fork_authority_invalid");
    const saved = await frozenFile(attempt, reference.file), value = JSON.parse(saved.text);
    if (saved.sha256 !== reference.sha256 || hashJson(value.intent) !== hashJson({ ...receipt.intent, source_run_id: fork.run_id })) fail("Bounded fork authority changed", "fork_authority_invalid");
    const status = await commandJson(runtimeBin(runtimeRoot), ["run", "status", fork.run_id, "--project-root", projectRoot], { cwd: projectRoot, env: evalRuntimeEnv(runtimeRoot, manifest) });
    const authority = await verifyBoundedForkAuthority({ managedRoot: attempt, fork: receipt.fork, intent: value.intent, projectId: value.authority?.project_id, status });
    if (hashJson(authority) !== hashJson(value.authority)) fail("Bounded fork target changed before dispatch", "fork_authority_invalid");
  }
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

