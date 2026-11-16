import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, realpath } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { childEnvironment } from "../process-json.mjs";
import { hashJson } from "../runner-events.mjs";
import { executeBaselineCommand as execute, redactBaselineOutput as redact } from "./command-execution.mjs";

const hash = bytes => createHash("sha256").update(bytes).digest("hex");
const fail = (message, code, details) => { throw Object.assign(new Error(message), { code, ...(details ? { details } : {}) }); };

/** Failure capability, not a second model qualification. Producer runs only in
 * its own output tree; the installed consumer rebuilds repair authority. */
export async function verifyRunnerEvidenceCompatibility({ projectRoot, outputRoot, api, binding, runtimeScope = null, required = true,
  requirement = { path: "scripts/check-evidence-probe.mjs", contract: "dd-tasks/check-evidence-probe@1" } }) {
  if (!required) return null;
  // Diagnosis is an agent task. New engines need no synthetic exception corpus
  // before an ordinary EVAL; actual baseline commands still establish readiness.
  if (api.checkDiagnosisPolicy === "settled-failure@1") return {
    schema_id: "dd-eval/runner-diagnosis-policy@1", status: "not_required",
    reason: "settled_failures_use_agent_diagnosis", model_calls: 0,
  };
  const failed = (reason, details = {}) => fail("Runner producer and installed engine failure contracts are incompatible", "runner_evidence_incompatible", { reason, ...details, product_repair_allowed: false });
  if (!requirement || typeof requirement.path !== "string" || path.isAbsolute(requirement.path) || requirement.path.includes("\\")
    || requirement.path.split("/").some(part => !part || part === "." || part === "..") || !["dd-tasks/check-evidence-probe@1", "dd-tasks/check-evidence-probe@2"].includes(requirement.contract)) failed("invalid_probe_requirement");
  projectRoot = await realpath(projectRoot);
  outputRoot = await realpath(outputRoot);
  const root = path.join(outputRoot, `runner-contract-${randomUUID()}`);
  await mkdir(root, { recursive: true });
  const entry = path.join(projectRoot, requirement.path);
  try {
    if (await realpath(entry) !== entry) failed("unsafe_producer_path");
  } catch (error) { if (error.code === "ENOENT") failed("missing_failure_probe", { expected: requirement.contract }); throw error; }
  const result = await execute({ id: "runner-contract-probe", command: process.execPath,
    args: [entry, "--output", root, "--binding-json", JSON.stringify(binding), ...(requirement.contract === "dd-tasks/check-evidence-probe@2" ? ["--contract", requirement.contract] : [])], inactivity_timeout_ms: 120000 }, projectRoot, runtimeScope, true);
  if (result.code !== 0 || result.timed_out) failed("producer_probe_failed", { exit_code: result.code, timed_out: result.timed_out, output: redact(result.output).slice(-4096) });
  const manifestFile = path.join(root, "probe.json");
  let manifest;
  try { manifest = JSON.parse(await readFile(manifestFile, "utf8")); }
  catch { failed("missing_or_invalid_probe_manifest"); }
  const requiredCases = ["browser-window", "runtime-error", "runtime-typeerror", "compiler", "composite"];
  if (requirement.contract === "dd-tasks/check-evidence-probe@2") requiredCases.push("library-query");
  if (!manifest || typeof manifest !== "object" || manifest.schema_id !== requirement.contract || !Array.isArray(manifest.cases)
    || manifest.cases.some(item => !item || typeof item !== "object") || manifest.cases.length !== requiredCases.length
    || new Set(manifest.cases.map(item => item.id)).size !== requiredCases.length || requiredCases.some(id => !manifest.cases.some(item => item.id === id))) failed("probe_cases_missing");
  const inside = async relative => {
    if (typeof relative !== "string" || path.isAbsolute(relative) || relative.split(/[\\/]/).some(part => part === ".." || !part)) failed("unsafe_probe_path");
    const file = path.join(root, relative);
    if (await realpath(file) !== file) failed("unsafe_probe_path");
    return file;
  };
  const cases = [];
  for (const item of manifest.cases) {
    const reportRoot = await inside(item.root), candidateRoot = await inside(item.candidate_root ?? manifest.candidate_root);
    if (item.expected !== "source_repair" || !item.binding || item.binding.input_hash !== binding.input_hash || item.binding.verification_epoch !== binding.verification_epoch
      || !api.runnerContractsValid({ "@check/probe": item.contract })) failed("invalid_probe_binding", { case_id: item.id });
    const read = api.readRunnerEvidenceDetailed ? api.readRunnerEvidenceDetailed(reportRoot, item.contract, item.binding)
      : { evidence: api.readRunnerEvidence(reportRoot, item.contract, item.binding), diagnostics: [] };
    const disposition = api.checkRepairDisposition({ status: "failed", exit_code: 1, runner_evidence: read.evidence, runner_evidence_required: item.contract, candidate_root: candidateRoot });
    if (disposition !== item.expected) failed("failure_capability_rejected", { case_id: item.id, expected: item.expected, observed: disposition, diagnostics: read.diagnostics });
    // Foreign invocation must never acquire authority merely because the
    // producer and consumer agree on a schema version.
    if (api.readRunnerEvidence(reportRoot, item.contract, { ...item.binding, invocation_id: `foreign:${item.binding.invocation_id}` })) failed("foreign_binding_accepted", { case_id: item.id });
    cases.push({ id: item.id, disposition });
  }
  return { schema_id: manifest.schema_id, status: "passed", producer_sha256: hash(await readFile(entry)), manifest: manifestFile, manifest_sha256: hash(await readFile(manifestFile)), cases };
}

/** Bind a baseline command to its installed runner evidence contract. */
export async function baselineRunnerContract(item, { projectRoot, outputRoot, engineRuntime, checkpoint, before, definition, checkResources }) {
  let profile;
  try { profile = JSON.parse(await readFile(path.join(projectRoot, ".memory-bank/spec/engineering/code-check-profile.json"), "utf8")); }
  catch (error) { if (error.code === "ENOENT") return null; throw error; }
  if (profile.schema_id !== "dd-flow/code-check-profile@7" || !profile.runner_evidence_by_alias || !Object.keys(profile.runner_evidence_by_alias).length) return null;
  if (!path.isAbsolute(engineRuntime?.bin ?? "") || !path.isAbsolute(engineRuntime?.home ?? "")) fail("Structured baseline requires its installed engine ABI", "baseline_runner_abi_missing");
  let engineDist;
  try { engineDist = path.dirname(await realpath(path.join(engineRuntime.home, "harness-runtime"))); }
  catch (error) { if (error.code !== "ENOENT") throw error; engineDist = path.dirname(await realpath(engineRuntime.bin)); }
  const api = await import(pathToFileURL(path.join(engineDist, "services/check-runner-evidence.js")).href);
  if (!api.runnerContractsValid(profile.runner_evidence_by_alias) || typeof api.runnerContractForArgv !== "function" || typeof api.readRunnerProgress !== "function" || typeof api.runnerObservationDurations !== "function") fail("Installed engine has no compatible baseline runner ABI", "baseline_runner_abi_missing");
  const selected = api.runnerContractForArgv(profile, item.command, item.args);
  if (!selected) return null;
  const root = path.join(outputRoot, `${item.id}-runner-${randomUUID()}`);
  await mkdir(path.dirname(path.join(root, selected.contract.path)), { recursive: true });
  const invocation = `BASELINE-${randomUUID()}`;
  const binding = { invocation_id: invocation, check_id: item.id, command: profile.aliases[selected.alias], input_hash: hashJson({ checkpoint: checkpoint.sha256, materialized_commit: before, policy: definition.sha256, profile, ...(checkResources === undefined ? {} : { check_resources: checkResources }) }), verification_epoch: hashJson({ checkpoint: checkpoint.sha256, materialized_commit: before }) };
  const progress = path.join(root, "runner-progress.jsonl");
  return { api, root, contract: selected.contract, binding, progress, durations: api.runnerObservationDurations(childEnvironment()), env: { DD_FLOW_EVIDENCE_DIR: root, DD_FLOW_CHECK_RUNNER_EVIDENCE_PATH: path.join(root, selected.contract.path), DD_FLOW_CHECK_RUNNER_PROGRESS_PATH: progress, DD_FLOW_CHECK_COMMAND: binding.command, DD_FLOW_CHECK_INVOCATION_ID: invocation, DD_FLOW_CHECK_ID: item.id, DD_FLOW_CHECK_INPUT_HASH: binding.input_hash, DD_FLOW_CHECK_VERIFICATION_EPOCH: binding.verification_epoch } };
}
