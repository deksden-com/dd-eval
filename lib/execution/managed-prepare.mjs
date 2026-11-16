import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { commandJson } from "../process-json.mjs";
import { isSourceSnapshotFlow, isDeliveryFlow } from "../installed-flows.mjs";

const hash = value => createHash("sha256").update(value).digest("hex");
const fail = (message, code, details) => { throw Object.assign(new Error(message), { code, details }); };

/** Read-only capability probe against the exact engine used for the action. */
export async function requireSnapshotPolicyCapability({bin,env,projectRoot,command}) {
  let help;
  try {help=await commandJson(bin,[...command,"--help"],{cwd:projectRoot,env});}
  catch (cause) {fail("Pinned engine cannot prove required snapshot policy support","snapshot_policy_unsupported",{effect:"no_effect",cause_code:cause.code ?? null});}
  const options=Array.isArray(help?.options)?help.options:[];
  const matches=options.filter(option=>option?.name==="snapshot-policy" && option.kind==="value" && Array.isArray(option.choices) && option.choices.includes("required"));
  if (help?.schema_id!=="dd-flow/cli-help@1" || help.command!==command.join(" ") || matches.length!==1)
    fail("Pinned engine cannot prove required snapshot policy support","snapshot_policy_unsupported",{effect:"no_effect"});
}

/** Validate the explicitly requested Memory parallelism before preparing a RUN. */
export function validateMemoryParallelLimit(limit) {
  if (limit !== undefined && (!Number.isInteger(limit) || limit < 1 || limit > 256))
    fail('Memory maxParallel must be an integer from 1 through 256', 'managed_flow_input_invalid', { effect: 'no_effect' });
}

/** Reject malformed Memory native-delegation options without dispatching work. */
export function validateMemoryNativeSelection(selection) {
  if (selection.delegation !== undefined && !['external', 'native'].includes(selection.delegation)
    || selection.allowLiveProbe !== undefined && typeof selection.allowLiveProbe !== 'boolean'
    || selection.nativeConfigHome !== undefined && (typeof selection.nativeConfigHome !== 'string' || !selection.nativeConfigHome))
    fail('Invalid Memory native CLI options', 'managed_flow_input_invalid', { effect: 'no_effect' });
}

/** Freeze routing through the same CLI boundary in preflight and execution. */
export async function prepareManagedRun({ bin, env, projectRoot, slug, executionRoutingFile, flow = "sdlc", memoryInit, memoryUpgrade, diagnostic, distillation, memoryFix, interactive, delivery }) {
  const diagnosticFlow = isSourceSnapshotFlow(flow);
  const deliveryFlow = isDeliveryFlow(flow);
  const repair = flow === 'mb-fix';
  const userLed = flow === 'interactive';
  if (delivery !== undefined && !deliveryFlow) fail('Delivery inputs belong to a different flow', 'managed_flow_input_invalid');
  if (interactive !== undefined && !userLed) fail('Interactive inputs belong to a different flow', 'managed_flow_input_invalid');
  if (memoryFix !== undefined && !repair) fail('Repair inputs belong to a different flow', 'managed_flow_input_invalid');
  if (diagnostic !== undefined && (!diagnosticFlow || flow === 'mb-distill') || distillation !== undefined && flow !== 'mb-distill') fail("Source workflow inputs belong to a different flow", "managed_flow_input_invalid");
  const memory = deliveryFlow ? delivery : userLed ? interactive : repair ? memoryFix : diagnosticFlow ? flow === 'mb-distill' ? distillation : diagnostic : flow === 'mb-upgrade' ? memoryUpgrade : memoryInit;
  let args;
  if (diagnosticFlow || repair || userLed || deliveryFlow) {
    const fields = { requestId: 'request-id', intakeFile: 'intake-file', profile: 'profile', profileFile: 'profile-file',
      ...(repair || userLed || deliveryFlow ? { workspaceRoot: repair ? 'workspace-root' : 'workspace' } : {}),
      ...(repair || userLed ? { gitRoute: 'git-route', integrationBranch: 'integration-branch' } : {}),
      ...(repair ? { sourceRunId: 'source-run' } : {}) };
    if (!memory || typeof memory !== 'object' || Array.isArray(memory) || memoryInit !== undefined || memoryUpgrade !== undefined || executionRoutingFile !== undefined
      || Object.keys(memory).some(key => !Object.hasOwn(fields, key) && !['stageProfiles', 'workProfiles', 'maxParallel', 'intakeSha256', ...(repair ? ['findingIds'] : [])].includes(key))
      || ['requestId', 'intakeFile'].some(key => typeof memory[key] !== 'string' || !memory[key])
      || Boolean(memory.profile) === Boolean(memory.profileFile)
      || typeof memory.intakeSha256 !== 'string' || !/^[a-f0-9]{64}$/.test(memory.intakeSha256)) fail('Installed workflow requires exact intake and one explicit executor profile', 'managed_flow_input_invalid');
    if (repair && (['sourceRunId','gitRoute','integrationBranch'].some(key => typeof memory[key] !== 'string' || !memory[key])
      || !/^RUN-[0-9]+(?:-[a-z0-9][a-z0-9-]*)?$/.test(memory.sourceRunId)
      || !['feature_worktree','integration_branch_direct'].includes(memory.gitRoute)
      || !Array.isArray(memory.findingIds) || !memory.findingIds.length || memory.findingIds.length > 4096
      || memory.findingIds.some(id => typeof id !== 'string' || !id.trim() || id.length > 256 || /[\r\n\0]/.test(id))
      || new Set(memory.findingIds).size !== memory.findingIds.length)) fail('Repair requires an exact diagnostic RUN, selected findings and Git policy', 'managed_flow_input_invalid');
    if (userLed && (!['feature_worktree','integration_branch_direct'].includes(memory.gitRoute)
      || typeof memory.integrationBranch !== 'string' || !memory.integrationBranch)) fail('Interactive preparation requires explicit Git policy', 'managed_flow_input_invalid');
    if (memory.maxParallel !== undefined && (!Number.isInteger(memory.maxParallel) || memory.maxParallel < 1 || memory.maxParallel > 64)) fail('Installed workflow maxParallel must be from 1 through 64', 'managed_flow_input_invalid');
    args = ['flow', flow, '--project-root', projectRoot, '--prepare-only', '--non-interactive'];
    if (userLed) args.push('--execution', 'managed');
    for (const [key, option] of Object.entries(fields)) if (memory[key] !== undefined) {
      if (typeof memory[key] !== 'string' || !memory[key]) fail('Invalid diagnostic selector', 'managed_flow_input_invalid');
      args.push(`--${option}`, memory[key]);
    }
    if (repair) for (const id of memory.findingIds) args.push('--finding',id);
    for (const [key, option] of [['stageProfiles', 'stage-profile'], ['workProfiles', 'work-profile']]) if (memory[key] !== undefined) {
      if (!Array.isArray(memory[key]) || memory[key].some(value => typeof value !== 'string' || !value)) fail('Invalid diagnostic profile assignments', 'managed_flow_input_invalid');
      for (const value of memory[key]) args.push(`--${option}`, value);
    }
    if (memory.maxParallel !== undefined) args.push('--max-parallel', String(memory.maxParallel));
    if (hash(await readFile(memory.intakeFile)) !== memory.intakeSha256) fail('Diagnostic intake differs from its pinned input', 'managed_flow_input_invalid');
  } else if (flow === "sdlc") {
    if (memoryInit !== undefined || memoryUpgrade !== undefined) fail("SDLC preparation cannot consume Memory inputs", "managed_flow_input_invalid");
    // Probe the exact pinned engine before allocating a RUN; do not pass a
    // new option to an older engine or silently weaken an EVAL boundary.
    await requireSnapshotPolicyCapability({bin,env,projectRoot,command:["run","prepare-vnext-specify"]});
    args = ["run", "prepare-vnext-specify", "--project-root", projectRoot, "--slug", slug, "--execution-routing-file", executionRoutingFile,"--snapshot-policy","required"];
  } else if (flow === "mb-init" || flow === "mb-upgrade") {
    if (flow === 'mb-init' && memoryUpgrade !== undefined || flow === 'mb-upgrade' && memoryInit !== undefined)
      fail("Memory inputs belong to a different flow", "managed_flow_input_invalid");
    if (!memory || typeof memory !== "object" || Array.isArray(memory)) fail("Memory preparation requires explicit inputs", "managed_flow_input_invalid");
    validateMemoryNativeSelection(memory);
    const fields = { workspaceRoot: "workspace-root", requestId: "request-id", intakeFile: "intake-file", intakeSha256: "intake-sha256", gitRoute: "git-route", integrationBranch: "integration-branch", profile: "profile", profileFile: "profile-file", delegation: 'delegation', nativeConfigHome: 'native-config-home' };
    if (Object.keys(memory).some(key => !Object.hasOwn(fields, key) && !["stageProfiles", "workProfiles", "maxParallel", "allowLiveProbe"].includes(key))
      || ["workspaceRoot", "requestId", "intakeFile", "intakeSha256", "gitRoute", "integrationBranch"].some(key => typeof memory[key] !== "string" || !memory[key])) fail("Memory preparation requires exact scope, original intake and Git policy", "managed_flow_input_invalid");
    args = [flow === 'mb-init' ? "init" : "upgrade", "--project-root", projectRoot, "--prepare-only", "--non-interactive"];
    if (memory.allowLiveProbe === true) args.push('--allow-live-probe');
    validateMemoryParallelLimit(memory.maxParallel);
    if (memory.maxParallel !== undefined) args.push('--max-parallel', String(memory.maxParallel));
    for (const [key, option] of Object.entries(fields)) if (memory[key] !== undefined) {
      if (typeof memory[key] !== "string" || !memory[key]) fail("Invalid Memory preparation selector", "managed_flow_input_invalid");
      args.push(`--${option}`, memory[key]);
    }
    for (const [key, option] of [["stageProfiles", "stage-profile"], ["workProfiles", "work-profile"]]) if (memory[key] !== undefined) {
      if (!Array.isArray(memory[key]) || memory[key].some(value => typeof value !== "string" || !value)) fail("Invalid Memory preparation profile assignments", "managed_flow_input_invalid");
      for (const value of memory[key]) args.push(`--${option}`, value);
    }
  } else fail(`Unsupported managed flow: ${flow}`, "managed_flow_input_invalid");
  let result, allocatedRun = null;
  try { result = await commandJson(bin, args, { cwd: projectRoot, env }); }
  catch (error) {
    const partial = error.details;
    // The exited CLI explicitly retained this allocation. Reconcile that
    // request once, never retry an unknown outcome or create a replacement RUN.
    if (flow === "sdlc" || error.code !== "run_start_incomplete" || error.cleanup_error
      || partial?.authority_truncated || partial?.effect !== "partial"
      || partial.request_id !== memory.requestId || typeof partial.run_id !== "string" || !partial.run_id
      || !["reconcile_exact_request", "observe_or_reconcile_exact_request"].includes(partial.next_action)) throw error;
    allocatedRun = partial.run_id;
    result = await commandJson(bin, args, { cwd: projectRoot, env });
  }
  if (typeof result.run_id !== "string" || !result.run_id) fail("Managed preparation omitted its logical RUN", "controller_receipt_invalid");
  if (flow === "sdlc" && result.snapshot_policy!=="required") fail("Prepared RUN did not confirm required snapshot policy", "snapshot_policy_unconfirmed", {effect:"partial",run_id:result.run_id,next_action:"inspect_retained_run"});
  if (allocatedRun !== null && result.run_id !== allocatedRun) fail("Memory reconciliation returned a replacement RUN", "controller_receipt_invalid");
  if (flow !== "sdlc" && (result.flow_id !== flow || result.action !== `flow_${flow.replaceAll('-', '_')}_prepared` || result.request_id !== memory.requestId || result.controller !== undefined)) fail("Managed preparation returned a foreign or launched receipt", "controller_receipt_invalid");
  return result;
}
