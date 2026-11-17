import path from "node:path";
import { judgeRootForCandidate } from "./verdict-path.mjs";
import { callDriver } from "../harness/driver-call.mjs";
import { finishJudgeCleanup } from "./cleanup.mjs";
import { stat, realpath } from "node:fs/promises";
import { readJson } from "../json-file.mjs";
import { hashJson, sha256 } from "../runner-events.mjs";
import { contractProfile } from "../execution-contract.mjs";
import { driverFor } from "../harness/driver-bindings.mjs";
import { runtimeBin } from "../execution/runtime-environment.mjs";
import { runtimeEngineIdentity, retainedEngineArtifacts } from "../execution/engine-snapshot.mjs";
import { verifyEngineArtifact } from "../engine-admission.mjs";
import { snapshotTreeHash } from "../recovery/snapshot-tree.mjs";
import { loadNativeContracts } from "../capacity-policy.mjs";
import { candidateMatches } from "../evidence/run-candidate.mjs";

const fail = (message, code) => { throw Object.assign(new Error(message), { code }); };
async function exists(file) { try { await stat(file); return true; } catch { return false; } }

/** Locate a Judge cleanup target only when retained evidence proves ownership. */
export async function retainedFinalJudgeCleanup(root, manifest, results) {
  // Interaction, qualification and supplemental attempts retain separate owners;
  // ordinary EVAL cleanup never discovers or starts their runtimes.
  const reportFile = path.join(root, "reports", "report.json");
  if (!manifest.profile?.judge?.enabled || !await exists(reportFile)) return null;
  const report = await readJson(reportFile), candidate = report.candidate;
  if (!candidate) return null;
  const { file, immutable_hash, ...content } = candidate;
  if (report.run_id !== manifest.run_id || hashJson(content) !== immutable_hash || !candidateMatches(candidate, manifest, results)
    || ![path.join(root, "candidate.json"), path.join(root, "candidate-revisions", `${immutable_hash}.json`)].includes(file)) fail("Judge cleanup candidate is not owned by this EVAL", "judge_evidence_mismatch");
  const judgeRoot = judgeRootForCandidate(root, { file, immutable_hash });
  if (!await exists(path.join(judgeRoot, "result.json"))) return null;
  const verdict = await readJson(path.join(judgeRoot, "result.json"));
  // Cleanup is ownership recovery, not admission for a new model call.
  let profile = verdict.profile_snapshot ?? (manifest.execution_contract ? contractProfile(manifest.execution_contract, manifest.profile.judge.profile_id) : null);
  if (!profile) {
    const state = await readJson(path.join(judgeRoot, "daemon", "daemon.json"));
    const adapter = path.basename(state.config?.runtime_owner?.adapter_executable ?? "");
    const harness = { "dd-codex.mjs": "codex-desktop", "dd-zcode.mjs": "zcode-acp", "dd-grok.mjs": "grok-acp", "dd-agy.mjs": "antigravity-cli", "dd-opencode.mjs": "opencode-server", "dd-droid.mjs": "droid-cli" }[adapter];
    if (!harness) fail("Legacy Judge cleanup has no retained adapter identity", "judge_cleanup_ownership_unknown");
    profile = { id: verdict.profile_id, harness };
  }
  if (verdict.profile_id !== profile.id || verdict.candidate_sha256 !== immutable_hash) fail("Judge cleanup verdict differs from its retained candidate/profile", "judge_evidence_mismatch");
  return { root: judgeRoot, verdict, profile };
}

/** Verify retained runtime identity and load contracts before any cleanup call. */
export async function verifiedJudgeCleanupRuntime({ target, root, manifest, results }) {
  const stateDir = path.join(target.root, "daemon"), state = await readJson(path.join(stateDir, "daemon.json"));
  const owner = state.config?.runtime_owner;
  const execution = results.find(result => owner?.dd_flow_home === path.join(root, "executions", result.execution, "dd-flow-home"));
  const adapter = typeof owner?.dd_flow_home === "string" ? path.join(owner.dd_flow_home, "harness-runtime", "bin", driverFor(target.profile)) : null;
  if (!execution || owner?.schema_id !== "dd-flow/runtime-owner@1" || owner.role !== "judge" || owner.owner_id !== `judge:${sha256(stateDir)}`
    || owner.state_dir !== stateDir || owner.dd_flow_bin !== runtimeBin(owner.dd_flow_home) || owner.adapter_executable !== adapter
    || owner.resource_home !== manifest.runtime_resource_home || owner.budget?.scope_id !== manifest.run_id || state.config?.cwd !== target.root
    || state.config.ddFlowHome && state.config.ddFlowHome !== owner.dd_flow_home || state.config.ddFlowBin && state.config.ddFlowBin !== owner.dd_flow_bin) fail("Retained Judge has no matching runtime ownership", "judge_cleanup_ownership_unknown");
  const canonicalRoot = await realpath(root);
  for (const file of [target.root, stateDir, path.join(stateDir, "daemon.json"), path.join(target.root, "result.json"), owner.dd_flow_home, adapter]) {
    if (await realpath(file) !== path.resolve(canonicalRoot, path.relative(root, file))) fail("Judge cleanup path escaped its retained EVAL owner", "judge_cleanup_ownership_unknown");
  }
  const pin = execution.runtime_engine;
  if (!pin?.package_version || !/^[a-f0-9]{64}$/.test(pin.integrity_checksum ?? "")) fail("Judge cleanup has no retained engine identity", "judge_cleanup_ownership_unknown");
  const engines = (await retainedEngineArtifacts(path.join(owner.dd_flow_home, "engines"), { engineVersion: pin.package_version, integrityChecksum: pin.integrity_checksum }))
    .filter(engine => hashJson(runtimeEngineIdentity(engine.manifest)) === hashJson(pin));
  if (engines.length !== 1) fail("Judge cleanup cannot resolve its exact retained engine", "judge_cleanup_ownership_unknown");
  await verifyEngineArtifact(engines[0].manifest, engines[0].root);
  if (snapshotTreeHash(path.join(owner.dd_flow_home, "harness-runtime")) !== snapshotTreeHash(path.join(engines[0].root, "dist", "harness-runtime"))) fail("Judge cleanup adapter differs from its retained engine", "judge_cleanup_ownership_unknown");
  const nativeContracts = await loadNativeContracts(owner.dd_flow_home, { engineRoot: engines[0].root, requireTreeSettlement: true });
  return { stateDir, owner, nativeContracts };
}

/** Retry cleanup only after verifying the retained Judge owner and engine. */
export async function retryFinalJudgeCleanup({ target, root, manifest, results }) {
  const { stateDir, owner, nativeContracts } = await verifiedJudgeCleanupRuntime({ target, root, manifest, results });
  return finishJudgeCleanup({ root: target.root, profileId: target.profile.id, nativeContracts, stop: operationId => callDriver(target.profile,
    ["daemon", "stop", "--state-dir", stateDir, "--cancel-tree"], { cwd: target.root, operationId, timeoutMs: 60_000,
      env: { DD_FLOW_CONFIG_HOME: owner.dd_flow_home, DD_FLOW_RESOURCE_HOME: owner.resource_home, DD_FLOW_RUNTIME_OWNER: JSON.stringify(owner), CODEX_HOME: path.join(target.root, "codex-home") } }) });
}
