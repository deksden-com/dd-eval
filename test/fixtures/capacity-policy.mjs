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
// Settlement double for scheduler-only tests. The contract regressions use the
// real pinned native module and explicit tree observations.
export const settledTreeContracts = { native_tree_settlement_contract: "native-tree-settlement@1", nativeTreeReadiness(receipt, { sessionId }) {
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
  await writeFile(path.join(engine, "engine.json"), JSON.stringify({ integrity: { checksum: await engineArtifactDigest(engine) } }));
  await symlink("engines/test/dist/harness-runtime", path.join(root, "harness-runtime"));
  return root;
}
