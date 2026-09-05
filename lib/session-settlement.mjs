/** Cancellation is a request. Completion requires a fresh observation of the
 * native tree and the daemon's pending operation, not an immediate snapshot. */
export async function waitForSettlement({ observe, cancel, timeoutMs = 5_000 }) {
  const deadline = performance.now() + timeoutMs;
  const cancelled = new Set();
  for (;;) {
    const state = await observe();
    if (!state.active && state.sessions.length === 0) return state;
    if (!cancel || performance.now() >= deadline) throw Object.assign(new Error("daemon still owns an unsettled Session tree"), { code: "tree_not_settled", details: state });
    for (const id of state.sessions) if (!cancelled.has(id)) { await cancel(id); cancelled.add(id); }
    await new Promise(resolve => setTimeout(resolve, 50));
  }
}
