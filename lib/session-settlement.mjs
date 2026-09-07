import { errorRecord } from "./operation-errors.mjs";

/** Diagnostic failure never prevents cancellation of already owned Sessions.
 * Only a fresh successful observation can establish settlement. */
export async function waitForSettlement({ observe, cancel, knownSessions = () => [], timeoutMs = 5_000 }) {
  const deadline = performance.now() + timeoutMs;
  const cancelled = new Set(), errors = [];
  if (cancel) for (const id of knownSessions()) {
    cancelled.add(id);
    try { await cancel(id); } catch (error) { errors.push({ phase: "cancel", session_id: id, ...errorRecord(error) }); }
  }
  for (;;) {
    let state;
    try { state = await observe(); }
    catch (error) {
      if (!cancel) throw error;
      errors.push({ phase: "observe", ...errorRecord(error) });
      state = { sessions: knownSessions(), active: true, observation_error: errorRecord(error) };
    }
    if (!state.active && state.sessions.length === 0) return { ...state, cleanup_errors: errors };
    if (!cancel || performance.now() >= deadline) throw Object.assign(new Error("daemon still owns an unsettled Session tree"), { code: "tree_not_settled", details: { ...state, cleanup_errors: errors } });
    for (const id of state.sessions) if (!cancelled.has(id)) {
      cancelled.add(id);
      try { await cancel(id); } catch (error) { errors.push({ phase: "cancel", session_id: id, ...errorRecord(error) }); }
    }
    await new Promise(resolve => setTimeout(resolve, 50));
  }
}
