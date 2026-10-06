// Native-success doubles need a capability-bearing engine, not retry logic.
// Capacity regressions exercise the real selected FLOW module instead.
export const successfulPolicyFixture = `
export const CAPACITY_POLICY = 'codex-overload-burst@1';
export const terminalCodexOverload = () => false;
export const normalizeCodexFailure = () => null;
export const nativeItemsSettled = () => false;
export const capacityBackoff = () => { throw Error('fixture never retries'); };
export const refusalObservation = () => { throw Error('fixture has no refusal'); };
export const overloadBurst = () => null;
`;
