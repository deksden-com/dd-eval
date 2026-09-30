import { randomUUID, createHash } from "node:crypto";
import { readFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { errorRecord, terminalCodexOverload } from "./operation-errors.mjs";
import { writeJsonAtomic, hashJson } from "./runner-events.mjs";
import { withRunnerLock } from "./runner-lock.mjs";

const backoffs = [5_000, 15_000];

export function retryAfterMs(providerError, clock = Date.now) {
  const header = Object.entries(providerError?.headers ?? {}).find(([key]) => key.toLowerCase() === "retry-after")?.[1];
  const raw = header ?? providerError?.retryAfter ?? providerError?.retry_after;
  const value = typeof raw === "string" ? raw.trim() : raw;
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

// Same-Session continuation, never a replay. Owners supply their boundary;
// a durable chain uses the existing driver operation ledger for crash recovery.
export async function promptJudgeWithCapacity(input) {
  if (!input.stateFile) return runCapacity(input);
  await mkdir(path.dirname(input.stateFile), { recursive: true });
  return withRunnerLock(input.stateFile, () => runCapacity(input));
}

async function runCapacity({ codex, sessionId, packetFiles = [], originalPrompt, continuationPrompt = `Continue the previous Judge task. Read the same packet files ${JSON.stringify(packetFiles)} and return only the required JSON object.`, dispatch, inspect, admit = async () => {}, recover, stateFile, validateInspection, onBackoff = async () => {}, requireSettlement = false, deadline = null, clock = Date.now, wait = delay, pauses = backoffs }) {
  const identity = hashJson({ sessionId, originalPrompt, continuationPrompt, pauses, requireSettlement });
  let chain;
  if (stateFile) {
    try { chain = JSON.parse(await readFile(stateFile, "utf8")); }
    catch (error) { if (error.code !== "ENOENT") throw error; }
  }
  if (chain && (chain.schema_id !== "dd-eval/capacity-chain@1" || chain.identity !== identity || !Array.isArray(chain.turns))) throw Object.assign(new Error("Capacity chain belongs to another packet or Session"), { code: "capacity_chain_conflict" });
  chain ??= { schema_id: "dd-eval/capacity-chain@1", identity, session_id: sessionId, root_operation_id: randomUUID(), deadline, turns: [] };
  if (chain.deadline !== undefined && chain.deadline !== null) {
    if (!Number.isFinite(chain.deadline)) throw Object.assign(new Error("Retained capacity deadline is invalid"), { code: "capacity_chain_conflict" });
    deadline = deadline === null ? chain.deadline : Math.min(deadline, chain.deadline);
  }
  const rootOperationId = chain.root_operation_id;
  if (typeof rootOperationId !== "string" || !rootOperationId || chain.session_id !== sessionId || chain.turns.length > pauses.length + 1
    || chain.turns.some((turn, ordinal) => !turn || typeof turn !== "object" || turn.ordinal !== ordinal || turn.operation_id !== (ordinal ? `${rootOperationId}:capacity:${ordinal}` : rootOperationId)
      || turn.prompt_sha256 !== createHash("sha256").update(ordinal ? continuationPrompt : originalPrompt).digest("hex")
      || !Number.isFinite(turn.not_before) || !["prepared", "dispatched", "completed", "failed"].includes(turn.state)
      || ordinal < chain.turns.length - 1 && turn.state !== "failed"
      || turn.state === "failed" && typeof turn.error?.message !== "string"
      || ordinal && turn.predecessor_turn_id !== terminalCodexOverload(chain.turns[ordinal - 1].error, sessionId)?.turn_id)) throw Object.assign(new Error("Retained capacity chain is malformed or exceeds its bound"), { code: "capacity_chain_conflict" });
  const save = async () => { if (stateFile) await writeJsonAtomic(stateFile, chain); };
  const errors = chain.turns.filter(turn => turn.state === "failed").map(turn => Object.assign(new Error(turn.error.message), turn.error));
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
  if (chain.turns.at(-1)?.state === "completed") { await admitted(); return chain.turns.at(-1).result; }
  const settled = async (failure, operationId) => {
    await admitted();
    const observed = await inspect();
    const overload = terminalCodexOverload(failure, sessionId);
    const valid = overload && (!overload.operation_id || overload.operation_id === operationId)
      && (validateInspection ? await validateInspection(observed, { overload, operationId })
        : (observed.provider_session_id ?? observed.session_id) === sessionId && observed.settled === true
          && observed.settlement?.state !== "pending"
          && (!requireSettlement || observed.settlement?.state === "settled" && observed.settlement.operation_ids?.includes(operationId))
          && (observed.settlement?.state !== "settled" || observed.settlement.operation_ids?.includes(operationId)));
    if (!valid) throw stop(failure, "judge_capacity_settlement_unproven", { capacity_continuation: { attempts: errors.length, overloads: errors.map(errorRecord), stop_reason: "settlement_unproven" } });
    // Native inspection may wait while the owner is cancelled or its packet changes.
    await admitted();
  };
  for (let ordinal = Math.max(0, chain.turns.length - 1); ordinal <= pauses.length; ordinal += 1) {
    const text = ordinal === 0 ? originalPrompt : continuationPrompt;
    let turn = chain.turns[ordinal];
    if (!turn) {
      turn = { ordinal, operation_id: ordinal === 0 ? rootOperationId : `${rootOperationId}:capacity:${ordinal}`, prompt_sha256: createHash("sha256").update(text).digest("hex"), state: "prepared", not_before: clock() };
      chain.turns.push(turn); await save();
    }
    if (turn.ordinal !== ordinal || turn.prompt_sha256 !== createHash("sha256").update(text).digest("hex")) throw Object.assign(new Error("Capacity intent changed"), { code: "capacity_chain_conflict" });
    const operationId = turn.operation_id;
    try { await admitted(); } catch (error) { throw retainHistory(error); }
    if (turn.state === "completed") return turn.result;
    try {
      if (turn.state === "failed") throw Object.assign(new Error(turn.error.message), turn.error);
      while (turn.state === "prepared" && clock() < turn.not_before) { await admitted(); await wait(Math.min(250, turn.not_before - clock())); }
      const beforeDispatch = async () => {
        await admitted();
        if (ordinal) await settled(Object.assign(new Error(chain.turns[ordinal - 1].error.message), chain.turns[ordinal - 1].error), chain.turns[ordinal - 1].operation_id);
      };
      let result;
      if (turn.state === "dispatched") {
        if (!recover) throw Object.assign(new Error("Capacity dispatch has an unknown outcome; observe the retained operation"), { code: "operation_observation_lost" });
        result = await recover(operationId);
      } else {
        await beforeDispatch();
        const authorizeDispatch = async () => {
          if (turn.state !== "prepared") throw Object.assign(new Error("Capacity intent was already dispatched"), { code: "capacity_dispatch_duplicate" });
          await beforeDispatch(); turn.state = "dispatched"; await save();
        };
        result = await dispatch(text, { root_operation_id: rootOperationId, ordinal, operation_id: operationId, predecessor_turn_id: turn.predecessor_turn_id ?? null, not_before: turn.not_before }, authorizeDispatch);
        if (turn.state !== "dispatched") throw Object.assign(new Error("Capacity dispatch did not retain its intent"), { code: "capacity_dispatch_unadmitted" });
      }
      turn.state = "completed"; turn.result = result; await save();
      return result;
    } catch (error) {
      const overload = codex ? terminalCodexOverload(error, sessionId) : null;
      if (!overload) {
        if (error.code === "turn_interrupted" && error.details?.provider_session_id === sessionId && error.details?.terminal_status === "failed") { turn.state = "failed"; turn.error = errorRecord(error); await save(); }
        if (errors.length) error.details = { ...error.details, capacity_continuation: { attempts: errors.length + 1, overloads: errors.map(errorRecord), last_error: errorRecord(error) } };
        throw error;
      }
      if (turn.state !== "failed") { turn.state = "failed"; turn.error = errorRecord(error); await save(); errors.push(error); }
      if (ordinal === pauses.length) {
        error.details = { ...error.details, capacity_continuation: { attempts: errors.length, overloads: errors.map(errorRecord), stop_reason: "attempts_exhausted" } };
        throw error;
      }
      try {
        await settled(error, operationId);
        const waitMs = Math.max(pauses[ordinal], retryAfterMs(overload.provider_error, clock));
        const remaining = chain.turns[ordinal + 1] ? Math.max(0, chain.turns[ordinal + 1].not_before - clock()) : waitMs;
        if (waitMs > 30_000 || deadline !== null && remaining >= deadline - clock()) {
          const retryAt = new Date(clock() + waitMs);
          throw stop(error, "retry_after_exceeds_budget", { capacity_continuation: { attempts: errors.length, overloads: errors.map(errorRecord), stop_reason: "retry_after_exceeds_budget", retry_after_at: Number.isFinite(retryAt.getTime()) ? retryAt.toISOString() : null } });
        }
        const nextTextHash = createHash("sha256").update(continuationPrompt).digest("hex");
        const next = chain.turns[ordinal + 1] ?? { ordinal: ordinal + 1, operation_id: `${rootOperationId}:capacity:${ordinal + 1}`, prompt_sha256: nextTextHash, predecessor_turn_id: overload.turn_id, state: "prepared", not_before: clock() + waitMs };
        if (next.predecessor_turn_id !== overload.turn_id || next.prompt_sha256 !== nextTextHash) throw Object.assign(new Error("Capacity predecessor changed"), { code: "capacity_chain_conflict" });
        if (!chain.turns[ordinal + 1]) { chain.turns.push(next); await save(); }
        await onBackoff({ session_id: sessionId, root_operation_id: rootOperationId, predecessor_turn_id: overload.turn_id, continuation: ordinal + 1, limit: pauses.length, wait_ms: waitMs });
        while (clock() < next.not_before) {
          await admitted();
          await wait(Math.min(250, next.not_before - clock()));
        }
        await admitted();
      } catch (continuationError) { throw retainHistory(continuationError); }
    }
  }
}
