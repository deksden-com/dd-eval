import { randomUUID } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import { errorRecord, terminalCodexOverload } from "./operation-errors.mjs";

const backoffs = [5_000, 15_000];

function retryAfterMs(providerError, clock) {
  const value = providerError?.retryAfter ?? providerError?.retry_after ?? providerError?.headers?.["retry-after"];
  if (typeof value === "number" && Number.isFinite(value) && value >= 0) return value * 1_000;
  if (typeof value !== "string") return 0;
  if (/^\d+(?:\.\d+)?$/.test(value)) {
    const seconds = Number(value);
    return Number.isFinite(seconds) ? seconds * 1_000 : 0;
  }
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? Math.max(0, timestamp - clock()) : 0;
}

function stop(error, code, details) {
  const stopped = new Error(error.message);
  stopped.code = code;
  stopped.details = { ...error.details, ...details };
  return stopped;
}

// Judge owns the only safe Codex retry: no Subject work or HITL answer has
// been dispatched yet. The caller supplies admission and permit fencing.
export async function promptJudgeWithCapacity({ codex, sessionId, packetFiles, originalPrompt, dispatch, inspect, admit, onBackoff = async () => {}, requireSettlement = false, deadline = null, clock = Date.now, wait = delay, pauses = backoffs }) {
  const rootOperationId = randomUUID();
  const errors = [];
  const retainHistory = (error) => {
    if (errors.length && !error.details?.capacity_continuation) error.details = { ...error.details, capacity_continuation: { attempts: errors.length, overloads: errors.map(errorRecord), stop_reason: error.code ?? "continuation_failed" } };
    return error;
  };
  const admitted = async () => {
    await admit();
    if (deadline !== null && clock() >= deadline) {
      const error = new Error("Judge operation deadline expired");
      error.code = "definition_qualification_timeout";
      throw error;
    }
  };
  for (let ordinal = 0; ordinal <= pauses.length; ordinal += 1) {
    const operationId = ordinal === 0 ? rootOperationId : randomUUID();
    try { await admitted(); } catch (error) { throw retainHistory(error); }
    try {
      return await dispatch(ordinal === 0 ? originalPrompt : `Continue the previous Judge task. Read the same packet files ${JSON.stringify(packetFiles)} and return only the required JSON object.`, {
        root_operation_id: rootOperationId, ordinal, operation_id: operationId
      });
    } catch (error) {
      const overload = codex ? terminalCodexOverload(error, sessionId) : null;
      if (!overload) {
        if (errors.length) error.details = { ...error.details, capacity_continuation: { attempts: errors.length + 1, overloads: errors.map(errorRecord), last_error: errorRecord(error) } };
        throw error;
      }
      errors.push(error);
      if (ordinal === pauses.length) {
        error.details = { ...error.details, capacity_continuation: { attempts: errors.length, overloads: errors.map(errorRecord), stop_reason: "attempts_exhausted" } };
        throw error;
      }
      try {
        await admitted();
        const observed = await inspect();
        if ((observed.provider_session_id ?? observed.session_id) !== sessionId || observed.settled !== true || observed.settlement?.state === "pending" ||
            overload.operation_id && overload.operation_id !== operationId ||
            requireSettlement && (observed.settlement?.state !== "settled" || !observed.settlement.operation_ids?.includes(operationId)) ||
            observed.settlement?.state === "settled" && !observed.settlement.operation_ids?.includes(operationId)) {
          throw stop(error, "judge_capacity_settlement_unproven", { capacity_continuation: { attempts: errors.length, overloads: errors.map(errorRecord), stop_reason: "settlement_unproven" } });
        }
        const waitMs = Math.max(pauses[ordinal], retryAfterMs(overload.provider_error, clock));
        if (waitMs > 30_000 || deadline !== null && waitMs >= deadline - clock()) {
          const retryAt = new Date(clock() + waitMs);
          throw stop(error, "retry_after_exceeds_budget", { capacity_continuation: { attempts: errors.length, overloads: errors.map(errorRecord), stop_reason: "retry_after_exceeds_budget", retry_after_at: Number.isFinite(retryAt.getTime()) ? retryAt.toISOString() : null } });
        }
        await onBackoff({ session_id: sessionId, root_operation_id: rootOperationId, predecessor_turn_id: overload.turn_id, continuation: ordinal + 1, limit: pauses.length, wait_ms: waitMs });
        const until = clock() + waitMs;
        while (clock() < until) {
          await admitted();
          await wait(Math.min(250, until - clock()));
        }
        await admitted();
      } catch (continuationError) { throw retainHistory(continuationError); }
    }
  }
}
