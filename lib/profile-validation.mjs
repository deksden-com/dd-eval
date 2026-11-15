import { installedSelectionKeys, installedProfileSelection as memoryProfileSelection } from "./installed-flows.mjs";
import { validateMemoryNativeSelection, validateMemoryParallelLimit } from "./managed-flow-client.mjs";
import { validateMemorySetup, validateMemoryUpgradeSetup } from "./memory-runtime-setup.mjs";
import { hitlMatchContract, hitlCoverageContract } from "./hitl-contract.mjs";
import { validateSemanticConfig } from "./semantic-decisions.mjs";

const fail = (message, code = "validation") => { const error = new Error(message); error.code = code; throw error; };
const isObject = value => Boolean(value) && typeof value === "object" && !Array.isArray(value);
const onlyKeys = (value, keys, label) => { if (!isObject(value) || Object.keys(value).some((key) => !keys.includes(key))) fail(`${label} has unsupported fields`); return value; };

export function validateHarnessProfile(value, file = "retained subject_profile") {
  if (!isObject(value) || typeof value.id !== "string" || typeof value.harness !== "string" || typeof value.model !== "string" || typeof value.reasoning !== "string") fail(`invalid harness profile: ${file}`);
  if (value.subagent_capacity !== undefined && (!Number.isInteger(value.subagent_capacity) || value.subagent_capacity < 1)) fail(`invalid subagent_capacity in harness profile: ${file}`);
  return value;
}

export function nativeOnlyRunProfile(runProfile) {
  return { ...runProfile, coveragePolicy: null, value: { ...runProfile.value,
    ...(runProfile.value.semantic_decisions === undefined ? {} : { semantic_decisions: { enabled: false } }) } };
}

export function validateRunProfile(value) {
  const modern = value?.schema_id === "dd-eval/run-profile@2";
  onlyKeys(value, ["schema_id", "id", "case_id", "subject", "selection", "judge", "interaction_judge", "concurrency", "failure_policy", "operational_decision", ...(modern ? ["semantic_decisions"] : [])], "run profile");
  if (!["dd-eval/run-profile@1", "dd-eval/run-profile@2"].includes(value.schema_id)) fail("run profile must use dd-eval/run-profile@1 or @2");
  if (modern) {
    validateSemanticConfig(value.semantic_decisions);
    if (value.semantic_decisions !== undefined && value.interaction_judge?.coverage_policy !== undefined) fail("semantic_decisions and legacy coverage_policy cannot be combined", "run_profile_invalid");
  }
  onlyKeys(value.subject, ["profile_id", "execution", "memory_setup", ...installedSelectionKeys], "run profile subject"); if (typeof value.id !== "string" || typeof value.case_id !== "string" || typeof value.subject.profile_id !== "string") fail("run profile requires id, case_id and subject.profile_id");
  if(installedSelectionKeys.filter(key=>value.subject[key]!==undefined).length>1) fail('Built-in workflow selections cannot be combined','run_profile_invalid');
  const memorySelection=memoryProfileSelection(value.subject);
  if (value.subject.memory_setup !== undefined) (value.subject.memory_upgrade!==undefined?validateMemoryUpgradeSetup:validateMemorySetup)(value.subject.memory_setup);
  if ((memorySelection !== undefined) !== (value.subject.memory_setup !== undefined)) fail("Memory profiles and setup must be declared together");
  if (memorySelection !== undefined && value.operational_decision !== undefined) fail("Memory bootstrap cannot consume SDLC operational project materialization", "run_profile_invalid");
  if (value.subject.execution !== undefined && !isObject(value.subject.execution)) fail("subject.execution must reference a complete CLI execution routing policy");
  if (memorySelection !== undefined) {
    if (value.subject.execution !== undefined) fail("Memory initialization selection is exclusive with SDLC execution routing");
    const sourceSnapshot = value.subject.diagnostic!==undefined || value.subject.distillation!==undefined || value.subject.interactive!==undefined || value.subject.delivery!==undefined;
    const selection = onlyKeys(memorySelection, ["profile", "profileFile", "stageProfiles", "workProfiles", "maxParallel", ...(!sourceSnapshot ? ["delegation", "allowLiveProbe", "nativeConfigHome"] : [])], "Built-in workflow profile selection");
    validateMemoryNativeSelection(selection);
    validateMemoryParallelLimit(selection.maxParallel);
    if(sourceSnapshot && selection.maxParallel!==undefined && selection.maxParallel>64) fail('Source workflow parallel limit exceeds CLI capacity','run_profile_invalid');
    for (const key of ["profile", "profileFile"]) if (selection[key] !== undefined && (typeof selection[key] !== "string" || !selection[key])) fail("Memory initialization profile selectors must be non-empty strings");
    if (Boolean(selection.profile) === Boolean(selection.profileFile)) fail("Memory initialization requires exactly one explicit profile or profileFile");
    for (const key of ["stageProfiles", "workProfiles"]) if (selection[key] !== undefined && (!Array.isArray(selection[key]) || selection[key].some(item => typeof item !== "string" || !item))) fail("Memory initialization profile assignments must be string arrays");
  }
  if (value.operational_decision !== undefined) {
    onlyKeys(value.operational_decision, ["schema_id", "id", "settings", "policy", "acceptance", "exception"], "declared operational decision");
    if (value.operational_decision.schema_id !== "run-operational-decision@1" || !isObject(value.operational_decision.acceptance)) fail("operational decision requires a declared contract and acceptance source", "operational_decision_invalid");
  }
  onlyKeys(value.selection, ["focused_stages", "segment", "e2e", "repetitions", ...(modern ? ["stop_after"] : [])], "run profile selection");
  if (value.selection.stop_after !== undefined && (typeof value.selection.stop_after !== "string" || !/^[a-z][a-z0-9-]{0,63}$/.test(value.selection.stop_after))) fail("stop_after must name a stage in the selected case contour", "run_profile_invalid");
  if (!Array.isArray(value.selection.focused_stages) || value.selection.focused_stages.some((stage) => typeof stage !== "string") || typeof value.selection.e2e !== "boolean" || !Number.isInteger(value.selection.repetitions) || value.selection.repetitions < 1 || !(value.selection.segment === null || (isObject(value.selection.segment) && typeof value.selection.segment.from === "string" && typeof value.selection.segment.to === "string"))) fail("run profile selection is invalid");
  onlyKeys(value.judge, ["enabled", "profile_id"], "run profile judge"); if (typeof value.judge.enabled !== "boolean" || (value.judge.enabled && typeof value.judge.profile_id !== "string")) fail("run profile judge is invalid");
  if (value.interaction_judge !== undefined) {
    onlyKeys(value.interaction_judge, ["profile_id", "verdict_contract", "coverage_policy"], "run profile interaction_judge");
    if (typeof value.interaction_judge.profile_id !== "string" || value.interaction_judge.verdict_contract !== undefined && ![hitlMatchContract, hitlCoverageContract].includes(value.interaction_judge.verdict_contract)
      || value.interaction_judge.coverage_policy !== undefined && (typeof value.interaction_judge.coverage_policy !== "string" || value.interaction_judge.verdict_contract !== hitlCoverageContract)) fail("run profile interaction_judge is invalid");
  }
  onlyKeys(value.concurrency, ["global", "per_harness"], "run profile concurrency"); if (!Number.isInteger(value.concurrency.global) || value.concurrency.global < 1 || (value.concurrency.per_harness !== undefined && (!isObject(value.concurrency.per_harness) || Object.values(value.concurrency.per_harness).some((limit) => !Number.isInteger(limit) || limit < 1)))) fail("run profile concurrency is invalid");
  onlyKeys(value.failure_policy, ["stop_run_on_infrastructure_error", "stop_execution_on_unexpected_hitl", "stop_execution_on_unmatched_hitl"], "run profile failure_policy"); if (Object.values(value.failure_policy).some((setting) => typeof setting !== "boolean")) fail("run profile failure_policy is invalid");
  for (const key of ["stop_execution_on_unexpected_hitl", "stop_execution_on_unmatched_hitl"]) if (value.failure_policy[key] !== true) fail(`${key}=false is unsupported because the runner has no authorized continuation`, "run_profile_invalid");
  return value;
}
