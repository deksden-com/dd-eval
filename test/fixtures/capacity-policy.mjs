import { mkdir, writeFile, symlink } from "node:fs/promises";
import path from "node:path";
import { engineArtifactDigest } from "../../lib/engine-admission.mjs";
// Native-success doubles need a capability-bearing engine, not retry logic.
// Capacity regressions exercise the real selected FLOW module instead.
export const successfulPolicyFixture = `
export const CAPACITY_POLICY = 'provider-overload-episode@1';
export const MAX_OVERLOAD_RETRIES = 2;
export const MAX_RETRY_AFTER_MS = 30000;
export const terminalProviderOverload = () => false;
export const normalizeProviderFailure = () => null;
export const nativeItemsSettled = () => false;
export const capacityBackoff = () => { throw Error('fixture never retries'); };
export const refusalObservation = () => { throw Error('fixture has no refusal'); };
export const overloadExhausted = () => null;
`;
export const successfulPolicy = await import(`data:text/javascript,${encodeURIComponent(successfulPolicyFixture)}`);
// Scheduler/lifecycle double only; installed-asset tests exercise the real
// pinned validator. No provider or native process is started by this fixture.
export const successfulNativeFixture = `
export const NATIVE_CHILD_CONTRACT_VERSION='native-children@2';
export const NATIVE_TREE_SETTLEMENT_CONTRACT='native-tree-settlement@2';
export const normalizeNativeChildren=()=>[];
export const nativeTreeReadiness=()=> 'unproven';
export const nativeShutdownConfirmed=(s,b={})=>s?.schema_id==='dd-flow/daemon-shutdown@2'
 && s.daemon_id===b.daemonId && Number.isSafeInteger(s.generation)
 && (b.generation===undefined || b.generation===s.generation)
 && ['execution','owned_resources','provider','daemon_resource'].every(p=>s.required_phases?.includes(p))
 && s.required_phases.every(p=>s.phases?.[p]===true)
 && ['stopped','clean','physical_stopped','settled','native_settled'].every(k=>s.result?.[k]===true)
 && s.result.native_settlement?.confirmed!==false;
`;
// Settlement double for scheduler-only tests. The contract regressions use the
// real pinned native module and explicit tree observations.
export const settledTreeContracts = { native_tree_settlement_contract: "native-tree-settlement@2", nativeTreeReadiness(receipt, { sessionId }) {
  return (receipt.provider_session_id ?? receipt.session_id) === sessionId && receipt.settled === true && receipt.settlement?.state !== "pending" ? "ready" : "unproven";
} };
export const selectedPolicy = process.env.DD_FLOW_SOURCE_ROOT
  ? await import(new URL(`file://${process.env.DD_FLOW_SOURCE_ROOT}/src/harness-runtime/lib/provider-overload-policy.mjs`))
  : { ...successfulPolicy, capacityBackoff(error, ordinal) {
    // Scheduler double only. Real policy arithmetic/classification is checked
    // by the selected-engine gate; these tests exercise durable HTTP ownership.
    const requested = error.details.provider_error.retryAfter * 1000;
    if (requested > 30_000) throw Object.assign(new Error("Fixture delay exceeds budget"), { code: "provider_unavailable" });
    return Math.max([0, 5000, 15000][ordinal], requested);
  } };
export async function installSuccessfulPolicy(root) {
  const engine = path.join(root, "engines/test"), lib = path.join(engine, "dist/harness-runtime/lib");
  await mkdir(lib, { recursive: true });
  await writeFile(path.join(lib, "provider-overload-policy.mjs"), successfulPolicyFixture);
  await writeFile(path.join(lib, "native-children.mjs"), successfulNativeFixture);
  await writeFile(path.join(lib, "operation-errors.mjs"), "export const OPERATION_ERROR_CONTRACT_VERSION='operation-errors@1';export const isObservationLoss=()=>false;");
  await writeFile(path.join(lib, "dd-agy.mjs"), "export const agyTerminalFailure=()=>null;");
  await writeFile(path.join(engine, "engine.json"), JSON.stringify({ integrity: { checksum: await engineArtifactDigest(engine) } }));
  await symlink("engines/test/dist/harness-runtime", path.join(root, "harness-runtime"));
  return root;
}
