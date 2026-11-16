import { createHash } from "node:crypto";
import { cp, mkdir, realpath, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { homesFile, registryEnvironment } from "../homes.mjs";
import { finalizeRunProjection } from "../evidence/finalization.mjs";
import { verifyEngineArtifact } from "../engine-admission.mjs";
import { completeOperation, hashJson, readEvents, recordOperation, recordOperationError, reduceEvents, writeJsonAtomic } from "../runner-events.mjs";
import { commandJson } from "../process-json.mjs";
import { isObservationLoss } from "../operation-errors.mjs";
import { finalJudge, performFinalJudge } from "./final-assessment.mjs";
import { assertJudgeVerdict, observeJudgeCleanup } from "./cleanup.mjs";
import { prepareSupplementalJudge, assertSupplementalEvidence, validateJudgeSupplement, supplementalEngineIdentity } from "./supplement.mjs";
import { assertJudgeProfileBinding } from "./judge-receipt.mjs";
import { judgeHarnessRoots, frozenJudgeProfile } from "./runtime-binding.mjs";
import { withRunnerLock } from "../runner-lock.mjs";
import { subjectHistoryEvents } from "../evidence/run-candidate.mjs";
import { snapshotTreeHash } from "../recovery/snapshot-tree.mjs";
import { profileConfigHome } from "../execution/run-contract-resolution.mjs";
import { engineTarget, materializeEngineArtifact, retainedEngineArtifacts } from "../execution/engine-snapshot.mjs";
import { installRuntimeShim } from "../execution/runtime-shim.mjs";
import { runtimeBin, runtimeEnv } from "../execution/runtime-environment.mjs";
import { storedExecutionResults } from "../execution/result-projection.mjs";
import { resolveExecutionContract, contractProfile, profileSemanticHash } from "../execution-contract.mjs";
import { loadCase } from "../cases/load-case.mjs";
import { loadProfile } from "../cases/profile-loading.mjs";
import { readRegularFile } from "../regular-file.mjs";
import { readJson } from "../json-file.mjs";

const fail = (message, code = "validation") => { throw Object.assign(new Error(message), { code }); };
const sha256 = value => createHash("sha256").update(value).digest("hex");
const now = () => new Date().toISOString();
async function exists(file) { try { await stat(file); return true; } catch { return false; } }

/** Run an independent assessment against retained supplemental evidence. */
async function supplementalJudge({ evalRoot, profileId, supplementFile, outputRoot }) {
  const originalRoot = await realpath(evalRoot), originalManifest = await readJson(path.join(originalRoot, "manifest.json"));
  const selectedDeclaration = await loadProfile(profileId ?? originalManifest.profile?.judge?.profile_id ?? "");
  const selectedId = selectedDeclaration.value.id;
  const supplement = validateJudgeSupplement(await readJson(supplementFile));
  const sourceRoots = await judgeHarnessRoots(originalRoot, [{ attempt: path.join(originalRoot, "executions", supplement.boundary.execution_id) }]);
  const selectedContract = await resolveExecutionContract({ runProfile: { subject: { profile_id: selectedId } }, loadProfile: async id => id === selectedId ? selectedDeclaration : loadProfile(id), configHome: profileConfigHome() });
  const selectedProfile = contractProfile(selectedContract, selectedId);
  const boundEngine = await supplementalEngineIdentity(originalRoot, supplement);
  const allEngines = (await retainedEngineArtifacts(path.join(sourceRoots.runtimeRoot, "engines"), { engineVersion: boundEngine.engine_version, integrityChecksum: boundEngine.integrity_checksum }))
    .filter(item => item.manifest.package_name === boundEngine.package_name && item.manifest.package_version === boundEngine.package_version);
  if (allEngines.length !== 1) fail("Supplemental Judge requires one retained exact engine artifact", "judge_runtime_missing");
  const sourceEngine = allEngines[0]; await verifyEngineArtifact(sourceEngine.manifest, sourceEngine.root);
  const harnessConfig = await readRegularFile(path.join(sourceRoots.runtimeRoot, "harnesses.json"));
  const runtimeBinding = { engine_sha256: sourceEngine.manifest.integrity.checksum, harness_config_sha256: sha256(harnessConfig), adapter_tree_sha256: snapshotTreeHash(path.join(sourceRoots.runtimeRoot, "harness-runtime")) };
  const boundProfile = Object.fromEntries(["id", "harness", "provider", "model", "reasoning", "mode", "permission"].map(key => [key, selectedProfile[key]]));
  const prepared = await prepareSupplementalJudge({ evalRoot: originalRoot, supplementFile, outputRoot, profile: { ...boundProfile, execution_profile_sha256: profileSemanticHash(selectedProfile), runtime_binding: runtimeBinding } });
  if (hashJson(await supplementalEngineIdentity(originalRoot, supplement)) !== hashJson(boundEngine)) fail("Frozen RUN engine changed during preparation", "judge_packet_changed");
  const root = prepared.root, runId = `ASSESSMENT-${prepared.key}`, runtimeRoot = path.join(root, "runtime");
  return withRunnerLock(path.join(root, "judge-owner"), async () => {
    await assertSupplementalEvidence(prepared);
    const manifestFile = path.join(root, 'manifest.json');
    const retainedOwner = await exists(manifestFile) ? await readJson(manifestFile) : null;
    const assessmentResourceHome = retainedOwner?.runtime_resource_home ?? process.env.DD_FLOW_RESOURCE_HOME ?? path.join(root, 'resources');
    const assessmentRegistryFile = retainedOwner ? homesFile(registryEnvironment(retainedOwner)) : homesFile();
    const eventsFile = path.join(root, "events.jsonl"), operationId = `${runId}:judge`;
    const existing = reduceEvents(await readEvents(eventsFile)).operations[operationId];
    const publishReport = async receipt => {
      await assertSupplementalEvidence(prepared);
      const cleanup = await observeJudgeCleanup(root, receipt);
      await writeJsonAtomic(path.join(root, "report.json"), { schema_id: "dd-eval/supplemental-judge-report@1", assessment_key: prepared.key, original_eval_id: originalManifest.run_id,
        original: prepared.originalReceipt, supplemental: receipt, cleanup: cleanup.status === 'settled' ? "settled" : "unconfirmed", judge_status: "completed", judge_cleanup: cleanup, historical_evidence: "unchanged", created_at: now() });
    };
    if (existing?.terminal === "completed") { await publishReport(existing.result); return { root, assessment_key: prepared.key, reused: true, receipt: existing.result }; }
    if (existing?.terminal) fail("Supplemental assessment is terminal; its failed attempt is not replayed", "operation_terminal");
    const projectRoot = path.join(root, "judge-workspace"); await mkdir(projectRoot, { recursive: true });
    const privateEngineFile = path.join(engineTarget(runtimeRoot, sourceEngine.manifest), "engine.json");
    const engine = await exists(privateEngineFile) ? await readJson(privateEngineFile) : await materializeEngineArtifact({ source: sourceEngine.manifest, sourceRoot: sourceEngine.root, runtimeRoot });
    const engineDirectory = await realpath(path.dirname(privateEngineFile));
    if (engine.integrity?.checksum !== runtimeBinding.engine_sha256 || ["package_name", "package_version", "engine_version", "entrypoint"].some(key => engine[key] !== sourceEngine.manifest[key])
      || !engineDirectory.startsWith(await realpath(runtimeRoot) + path.sep) || await realpath(engine.snapshot_root) !== engineDirectory) fail("Supplemental engine escaped its exact owned artifact", "judge_runtime_missing");
    await verifyEngineArtifact(engine);
    await installRuntimeShim(runtimeRoot, engine, { resourceHome: assessmentResourceHome, registryFile: assessmentRegistryFile });
    if (!await exists(path.join(runtimeRoot, "harness-runtime"))) {
      await cp(path.join(sourceRoots.runtimeRoot, "harness-runtime"), path.join(runtimeRoot, "harness-runtime"), { recursive: true, verbatimSymlinks: true, errorOnExist: true, force: false });
    }
    if (!await exists(path.join(runtimeRoot, "harnesses.json"))) {
      await writeFile(path.join(runtimeRoot, "harnesses.json"), harnessConfig, { flag: "wx", mode: 0o600 });
    }
    prepared.assertRuntime = async () => {
      if (hashJson(await readJson(privateEngineFile)) !== hashJson(engine)) fail("Supplemental engine manifest changed", "judge_packet_changed");
      await verifyEngineArtifact(engine);
      if (sha256(await readRegularFile(path.join(runtimeRoot, "harnesses.json"))) !== runtimeBinding.harness_config_sha256
        || snapshotTreeHash(path.join(runtimeRoot, "harness-runtime")) !== runtimeBinding.adapter_tree_sha256) fail("Supplemental native tooling changed", "judge_packet_changed");
    };
    await prepared.assertRuntime();
    await commandJson(runtimeBin(runtimeRoot), ["project", "register", "--root", projectRoot], { cwd: projectRoot, env: runtimeEnv(runtimeRoot) });
    const manifest = { ...originalManifest, eval_registry_file: assessmentRegistryFile, run_id: runId, executions: [], subject_disabled: true, original_eval_id: originalManifest.run_id,
      runtime_resource_home: assessmentResourceHome, runtime_recovery_home: path.join(root, "recovery"), runtime_control_bin: runtimeBin(runtimeRoot) };
    if (retainedOwner && !Object.hasOwn(retainedOwner, 'eval_registry_file')) delete manifest.eval_registry_file;
    if (await exists(manifestFile) && hashJson(await readJson(manifestFile)) !== hashJson(manifest)) fail("Supplemental owner manifest changed", "judge_output_conflict");
    if (!await exists(manifestFile)) await writeJsonAtomic(manifestFile, manifest);
    const args = { root, runId, manifest, loaded: { assessment: prepared.assessment }, profileId: selectedProfile.id, candidate: prepared.candidate,
      supplemental: prepared, frozenProfile: selectedProfile, runtimeRoots: { projectRoot, runtimeRoot } };
    const record = { eventsFile, source: "dd-eval://supplemental-judge", runId, traceId: runId, operationId, operation: "supplemental_judge" };
    let receipt;
    if (existing?.started) {
      // The output lock established that no prior observer owns this attempt.
      // Native session.create and capacity-chain recover their original IDs.
      try { receipt = await performFinalJudge(args); await completeOperation({ ...record, result: receipt }); }
      catch (error) { if (!isObservationLoss(error)) await recordOperationError({ ...record, error }); throw error; }
    } else receipt = (await recordOperation({ ...record, action: () => performFinalJudge(args) })).result;
    await publishReport(receipt);
    return { root, assessment_key: prepared.key, receipt };
  });
}

/** Reuse or run the final Judge for a retained candidate. */
export async function evalJudge({ evalRoot, profileId = null, supplementFile = null, outputRoot = null }) {
  if (Boolean(supplementFile) !== Boolean(outputRoot)) fail("--supplement and --output must be supplied together", "usage");
  if (supplementFile) return supplementalJudge({ evalRoot, profileId, supplementFile, outputRoot });
  const root = path.resolve(evalRoot); const manifest = await readJson(path.join(root, "manifest.json")); const loaded = await loadCase(manifest.case_id); const selected = profileId ?? manifest.profile?.judge?.profile_id;
  const results = storedExecutionResults(await readEvents(path.join(root, "events.jsonl")), manifest);
  const finalized = await finalizeRunProjection({ root, manifest, loaded, results });
  if (!finalized.candidate) return { root, status: "awaiting_provider", reason: "subject execution is still active or unknown" };
  const resultFile = finalized.candidate.file === path.join(root, "candidate.json")
    ? path.join(root, "judge", "result.json")
    : path.join(root, "judge", "revisions", finalized.candidate.immutable_hash, "result.json");
  const receipt = await (await exists(resultFile)
    ? readJson(resultFile)
    : finalJudge({ root, runId: manifest.run_id, manifest, loaded, profileId: selected, candidate: finalized.candidate, results: finalized.results, historyEvents: subjectHistoryEvents(await readEvents(path.join(root, "events.jsonl")), manifest) }));
  if (receipt.candidate_sha256 !== finalized.candidate.immutable_hash) fail("Retained Judge differs from this candidate", "judge_evidence_mismatch");
  if (manifest.execution_contract) assertJudgeProfileBinding(receipt, await frozenJudgeProfile(manifest.execution_contract, selected));
  else if (profileId && profileId !== manifest.profile?.judge?.profile_id) fail("Legacy verdict cannot be reused under different requested settings", "judge_profile_contract_missing");
  await assertJudgeVerdict(path.dirname(resultFile), receipt);
  await finalizeRunProjection({ root, manifest, loaded, results });
  return { root, receipt };
}

