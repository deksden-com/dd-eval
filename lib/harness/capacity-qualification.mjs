import { setTimeout as delay } from "node:timers/promises";
import { promptJudgeWithCapacity } from "../judge/capacity.mjs";

const fail = (message, code) => { throw Object.assign(new Error(message), { code }); };

/**
 * A bounded technical qualification. It intentionally creates no RUN, Stage
 * or Work: the only measured fact is an accepted native direct-child ID.
 */
export async function boundedCapacityContinuation({ policy, nativeContracts, observationClock, ownerIdentity = null, originalPrompt, continuationPrompt, sessionId, attempt, inspect, children, pause = delay, clock = Date.now, random = Math.random, stateFile, recover, deadline = null, admit = async () => {} }) {
  if (typeof originalPrompt !== "string" || !originalPrompt || typeof continuationPrompt !== "string" || !continuationPrompt) fail("Capacity probe must retain its actual prompts", "capacity_chain_conflict");
  let lastFailure;
  return promptJudgeWithCapacity({ policy, nativeContracts, observationClock, ownerIdentity, sessionId, originalPrompt, continuationPrompt,
    inspect, wait: pause, clock, random, stateFile, recover, deadline, admit,
    validateInspection: async observed => {
      // Qualification owns no Flow budget, but accepted children must remain
      // absent immediately before dispatch, not just before the backoff.
      if ((observed.provider_session_id ?? observed.session_id) !== sessionId || observed.settled !== true || observed.settlement?.state === "pending" || (await children(observed)).length) throw lastFailure ?? Object.assign(new Error("Capacity native tree changed"), { code: "capacity_tree_changed" });
      return true;
    },
    dispatch: async (text, capacity, beforeDispatch) => {
      try { return await attempt(capacity.ordinal, capacity, beforeDispatch, text); }
      catch (error) { lastFailure = error; throw error; }
    } });
}

/** Accept only settled capacity evidence belonging to the measured root session. */
export function qualifiedCapacityProbe(receipt) {
  return receipt?.schema_id === "dd-eval/subagent-capacity@1" && !receipt.failure && receipt.cleanup?.stopped === true
    && (!receipt.cleanup.scope_retirement || receipt.cleanup.scope_retirement.physical_stopped === true && receipt.cleanup.scope_retirement.native_settled === true)
    && Number.isInteger(receipt.requested) && receipt.requested >= 1 && receipt.requested <= 15
    && Number.isInteger(receipt.capacity) && receipt.capacity >= 1 && receipt.capacity <= receipt.requested
    && typeof receipt.root_session_id === "string" && receipt.root_session_id.length > 0
    && Array.isArray(receipt.children) && receipt.children.length === receipt.capacity
    && new Set(receipt.children.map(child => child?.session_id)).size === receipt.capacity
    && receipt.children.every(child => typeof child?.session_id === "string" && child.session_id.length > 0
      && child.session_id !== receipt.root_session_id && child.parent_session_id === receipt.root_session_id
      && child.provenance !== "parent_mismatch");
}
