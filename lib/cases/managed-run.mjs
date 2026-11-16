import path from "node:path";
import { contained } from "../contained-path.mjs";
import { initialFlowBoundary } from "../flow-boundaries.mjs";
import { isSourceSnapshotFlow, isDeliveryFlow, installedSelectionKeys, installedProfileSelection as memoryProfileSelection } from "../installed-flows.mjs";
import { prepareManagedRun, validateMemoryParallelLimit, validateMemoryNativeSelection } from "../managed-flow-client.mjs";
import { setupMemoryFlowRuntime } from "../memory-runtime-setup.mjs";
import { commandJson } from "../process-json.mjs";
import { sha256 } from "../runner-events.mjs";
import { prepareTaskInput } from "./task-input.mjs";

const isObject = value => Boolean(value) && typeof value === "object" && !Array.isArray(value);
const fail = (message, code = "validation") => { throw Object.assign(new Error(message), { code }); };
const onlyKeys = (value, keys, label) => { if (!isObject(value) || Object.keys(value).some(key => !keys.includes(key))) fail(label + " has unsupported fields"); return value; };

/** Initial Memory intake is definition-owned, not a generated agent objective.
 * The CLI retains these exact bytes and owns all bootstrap and RUN effects. */
export async function prepareCaseManagedRun({ loaded, blueprint, runProfile, scopeId, ...input }) {
  const initial = initialFlowBoundary(loaded);
  if (initial.flow === "sdlc") {
    if (memoryProfileSelection(runProfile.value.subject) !== undefined || runProfile.value.subject.memory_setup !== undefined) fail("SDLC case cannot select Memory bootstrap profiles/setup", "managed_flow_input_invalid");
    return prepareManagedRun(input);
  }
  const diagnostic = isSourceSnapshotFlow(initial.flow);
  const policy = loaded.value.flow.git_policy;
  if (!diagnostic && (!isObject(policy) || Object.keys(policy).some(key => !["route", "integration_branch"].includes(key)) || !["integration_branch_direct", "feature_worktree"].includes(policy.route) || typeof policy.integration_branch !== "string" || !policy.integration_branch))
    fail("Memory case requires its explicit Git initialization policy", "managed_flow_input_invalid");
  const raw = blueprint.stages?.[initial.stage]?.task_input?.filter(item => item.role === "initial_user_request");
  if (raw?.length !== 1) fail("Memory initial boundary requires exactly one original user intake", "managed_flow_input_invalid");
  const key=isDeliveryFlow(initial.flow)?'delivery':initial.flow==='interactive'?'interactive':initial.flow==='mb-distill'?'distillation':diagnostic?'diagnostic':initial.flow==='mb-upgrade'?'memory_upgrade':'memory_init';
  if(installedSelectionKeys.some(other=>other!==key && runProfile.value.subject[other]!==undefined)) fail('Built-in selection belongs to another flow','managed_flow_input_invalid');
  const selection = runProfile.value.subject[key];
  if (!isObject(selection) || runProfile.value.subject.execution !== undefined || typeof scopeId !== "string" || !scopeId) fail("Memory preparation requires explicit profiles and stable execution scope", "managed_flow_input_invalid");
  validateMemoryParallelLimit(selection.maxParallel);
  validateMemoryNativeSelection(selection);
  if(diagnostic || initial.flow === 'interactive' || isDeliveryFlow(initial.flow)) {
    onlyKeys(selection,['profile','profileFile','stageProfiles','workProfiles','maxParallel'],'diagnostic executor selection');
    if(selection.maxParallel!==undefined && selection.maxParallel>64) fail('Diagnostic parallel limit exceeds CLI capacity','managed_flow_input_invalid');
  }
  await prepareTaskInput(loaded.root, blueprint, initial.stage, input.projectRoot);
  await setupMemoryFlowRuntime(initial.flow,{ bin: input.bin, env: input.env, projectRoot: input.projectRoot, runtimeRoot: input.env?.DD_FLOW_HOME,
    declaration: runProfile.value.subject.memory_setup, checkpoint: loaded.inputCheckpoint?.value, requestId: `setup-${sha256(scopeId)}` });
  // Existing-project entries consume a prepared store; setup installs resources,
  // while the public project command owns registration/storage initialization.
  if (initial.flow === 'interactive' || isDeliveryFlow(initial.flow)) await commandJson(input.bin, ['project', 'register', '--root', input.projectRoot], { cwd: input.projectRoot, env: input.env });
  if (isDeliveryFlow(initial.flow)) return prepareManagedRun({ ...input, executionRoutingFile: undefined, flow: initial.flow, delivery: {
    ...selection, workspaceRoot: input.projectRoot, requestId: `delivery-${sha256(scopeId)}`,
    intakeFile: contained(path.join(loaded.root, 'entry-pack-source'), raw[0].source, 'initial delivery intake'), intakeSha256: raw[0].sha256
  } });
  if (initial.flow === 'interactive') return prepareManagedRun({ ...input, executionRoutingFile: undefined, flow: initial.flow, interactive: {
    ...selection, workspaceRoot: input.projectRoot, requestId: `interactive-${sha256(scopeId)}`,
    intakeFile: contained(path.join(loaded.root, 'entry-pack-source'), raw[0].source, 'initial interactive intake'),
    intakeSha256: raw[0].sha256, gitRoute: policy.route, integrationBranch: policy.integration_branch
  } });
  if(diagnostic) return prepareManagedRun({...input, executionRoutingFile:undefined, flow:initial.flow, [key]:{
    ...selection,requestId:`diagnostic-${sha256(scopeId)}`,
    intakeFile:contained(path.join(loaded.root,'entry-pack-source'),raw[0].source,'initial diagnostic intake'),intakeSha256:raw[0].sha256
  }});
  return prepareManagedRun({ ...input, flow: initial.flow, [initial.flow==='mb-upgrade'?'memoryUpgrade':'memoryInit']: {
    ...selection, workspaceRoot: input.projectRoot, requestId: `memory-${sha256(scopeId)}`,
    intakeFile: contained(path.join(loaded.root, "entry-pack-source"), raw[0].source, "initial Memory intake"),
    intakeSha256: raw[0].sha256, gitRoute: policy.route, integrationBranch: policy.integration_branch
  } });
}
