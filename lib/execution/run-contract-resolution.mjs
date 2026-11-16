import path from "node:path";
import { mkdir, mkdtemp } from "node:fs/promises";
import { loadProfile } from "../cases/profile-loading.mjs";
import { materializePinnedMemoryGit } from "../cases/materialize-input.mjs";
import { assertCheckpointEngine } from "../engine-admission.mjs";
import { resolveExecutionContract, resolveGenericExecutionContract } from "../execution-contract.mjs";
import { initialFlowBoundary } from "../flow-boundaries.mjs";
import { installedProfileSelection as memoryProfileSelection, isDeliveryFlow } from "../installed-flows.mjs";
import { setupMemoryFlowRuntime, resolveMemoryExecutionExpectation } from "../memory-runtime-setup.mjs";
import { commandJson } from "../process-json.mjs";
import { hashJson } from "../runner-events.mjs";
import { evalHome, runtimeBin, runtimeEnv } from "./runtime-environment.mjs";
import { provisionRuntimeEngine } from "./runtime-provision.mjs";

const fail = (message, code = "validation") => { throw Object.assign(new Error(message), { code }); };

/** Resolve the operator profile configuration home. */
export const profileConfigHome = () => process.env.DD_FLOW_CONFIG_HOME ?? process.env.DD_FLOW_HOME ?? path.join(process.env.HOME ?? ".", ".dd-flow");
/** Resolve a frozen run contract from the selected flow and admitted inputs. */
export async function resolveRunContract(runProfile, reachable, loaded) {
  if (memoryProfileSelection(runProfile.value.subject) !== undefined) {
    const flow=runProfile.value.subject.delivery!==undefined || runProfile.value.subject.diagnostic!==undefined ? loaded && initialFlowBoundary(loaded).flow : runProfile.value.subject.interactive!==undefined ? 'interactive' : runProfile.value.subject.distillation!==undefined ? 'mb-distill' : runProfile.value.subject.memory_upgrade!==undefined ? 'mb-upgrade':'mb-init';
    if(runProfile.value.subject.delivery!==undefined && !isDeliveryFlow(flow)) fail('Delivery executor requires its delivery case','execution_contract_invalid');
    if(runProfile.value.subject.diagnostic!==undefined && !isDiagnosticFlow(flow)) fail('Diagnostic executor requires its diagnostic case','execution_contract_invalid');
    if (!loaded || initialFlowBoundary(loaded).flow !== flow) fail("Memory expected execution requires its admitted case", "execution_contract_invalid");
    const parent = path.join(evalHome(), "conformance", "memory-expectations"); await mkdir(parent, { recursive: true });
    const root = await mkdtemp(path.join(parent, "selection-"));
    const projectRoot = path.join(root, "project"), runtimeRoot = path.join(root, "dd-flow-home");
    if (flow === 'interactive' || isDeliveryFlow(flow)) await materializePinnedMemoryGit(projectRoot, loaded.inputCheckpoint.value.source.repository,
      loaded.inputCheckpoint.value.source, loaded.value.flow.git_policy?.integration_branch ?? 'main', flow);
    else await mkdir(projectRoot);
    await provisionRuntimeEngine(projectRoot, runtimeRoot, { controlOnly: true });
    const installed = await setupMemoryFlowRuntime(flow,{ bin: runtimeBin(runtimeRoot), env: runtimeEnv(runtimeRoot), projectRoot, runtimeRoot,
      declaration: runProfile.value.subject.memory_setup, checkpoint: loaded.inputCheckpoint.value, requestId: "expected-selection" });
    const resolved = await commandJson(runtimeBin(runtimeRoot), ["engine", "resolve", "--project-root", projectRoot], { cwd: projectRoot, env: runtimeEnv(runtimeRoot) });
    const engine = resolved.selection?.selected;
    await assertCheckpointEngine(loaded.inputCheckpoint, engine, loaded.value.case_acceptance);
    const expectation = await resolveMemoryExecutionExpectation({ runtimeRoot, configHome: profileConfigHome(), installation: installed.installation, engine,
      flow,selection: memoryProfileSelection(runProfile.value.subject), scope: { requestId: "expected-selection", projectRoot, workspace: projectRoot } });
    if (hashJson(expectation.contour) !== hashJson(loaded.value.flow.contour)) fail("Memory case contour differs from installed descriptor", "execution_contract_invalid");
    return resolveGenericExecutionContract({ runProfile: runProfile.value, expectation, loadProfile, configHome: profileConfigHome(), stages: reachable });
  }
  return resolveExecutionContract({ runProfile: runProfile.value, loadProfile, configHome: profileConfigHome(), stages: reachable });
}
