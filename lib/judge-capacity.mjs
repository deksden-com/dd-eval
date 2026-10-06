import { randomUUID, createHash } from "node:crypto";
import { mkdir } from "node:fs/promises";
import { readRegularFile } from "./regular-file.mjs";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { errorRecord, providerLimitMetadata } from "./operation-errors.mjs";
import { writeJsonAtomic, hashJson } from "./runner-events.mjs";
import { withRunnerLock } from "./runner-lock.mjs";

function stop(error, code, details) {
  const stopped = new Error(error.message);
  stopped.code = code;
  stopped.details = { ...error.details, ...details };
  return stopped;
}

// Same-Session continuation, never a replay. Owners supply their boundary;
// a durable chain uses the existing driver operation ledger for crash recovery.
export function assertJudgePromptBinding(chain, { sessionId, originalPrompt, continuationPrompt }) {
  continuationPrompt ??= `Continue the previous Judge task. Read the same packet files [] and return only the required JSON object.`;
  const root = chain?.root_operation_id;
  if (chain?.schema_id !== "dd-eval/capacity-chain@2" || chain.session_id !== sessionId || typeof sessionId !== "string" || !sessionId
    || typeof root !== "string" || !root || !Array.isArray(chain.turns) || !chain.turns.length
    || chain.turns.some((turn, ordinal) => !turn || typeof turn !== "object" || turn.ordinal !== ordinal
      || turn.operation_id !== (ordinal ? `${root}:capacity:${ordinal}:session.prompt` : root)
      || turn.prompt_sha256 !== createHash("sha256").update(ordinal ? continuationPrompt : originalPrompt).digest("hex")
      || !Number.isFinite(turn.not_before) || !["prepared", "dispatched", "completed", "failed"].includes(turn.state)
      || ordinal < chain.turns.length - 1 && turn.state !== "failed"
      || turn.state === "failed" && typeof turn.error?.message !== "string"))
    throw Object.assign(new Error("Retained capacity chain has no exact Session/prompt binding"), { code: "capacity_chain_conflict" });
  return chain;
}
export async function promptJudgeWithCapacity(input) {
  if (!input.stateFile) return runCapacity(input);
  await mkdir(path.dirname(input.stateFile), { recursive: true });
  return withRunnerLock(input.stateFile, () => runCapacity(input));
}

async function runCapacity({ codex, policy, ownerIdentity = null, sessionId, packetFiles = [], originalPrompt, continuationPrompt = `Continue the previous Judge task. Read the same packet files ${JSON.stringify(packetFiles)} and return only the required JSON object.`, dispatch, inspect, admit = async () => {}, recover, stateFile, validateInspection, onBackoff = async () => {}, requireSettlement = false, deadline = null, recoverOnly = false, clock = Date.now, monotonic = clock === Date.now ? () => performance.now() : clock, wait = delay }) {
  if (codex && policy?.CAPACITY_POLICY !== "codex-overload-burst@1") throw Object.assign(new Error("Codex continuation requires its pinned engine policy"), { code: "capacity_contract_unsupported" });
  const overloadOf = error => policy?.terminalCodexOverload(error, sessionId) ? policy.normalizeCodexFailure(error, sessionId) : null;
  const identity = hashJson({ sessionId, originalPrompt, continuationPrompt, requireSettlement, ownerIdentity, policy: policy?.CAPACITY_POLICY ?? null, engine: policy?.engine_artifact_sha256 ?? null });
  let chain;
  if (stateFile) {
    try { chain = JSON.parse(await readRegularFile(stateFile)); }
    catch (error) { if (error.code !== "ENOENT") throw error; }
  }
  if (chain?.schema_id === "dd-eval/capacity-chain@1") throw Object.assign(new Error("Legacy capacity chain has no burst-policy authority; reconcile its retained operations"), { code: "capacity_chain_legacy" });
  if (recoverOnly && !chain) throw Object.assign(new Error("No retained Judge operation to reconcile"), { code: "judge_outcome_unknown" });
  if (chain && (chain.schema_id !== "dd-eval/capacity-chain@2" || chain.identity !== identity || chain.policy !== (policy?.CAPACITY_POLICY ?? null) || !Array.isArray(chain.turns))) throw Object.assign(new Error("Capacity chain belongs to another packet, engine or Session"), { code: "capacity_chain_conflict" });
  chain ??= { schema_id: "dd-eval/capacity-chain@2", policy: policy?.CAPACITY_POLICY ?? null, identity, session_id: sessionId, root_operation_id: randomUUID(), deadline, turns: [] };
  if (chain.deadline !== undefined && chain.deadline !== null) {
    if (!Number.isFinite(chain.deadline)) throw Object.assign(new Error("Retained capacity deadline is invalid"), { code: "capacity_chain_conflict" });
    deadline = deadline === null ? chain.deadline : Math.min(deadline, chain.deadline);
  }
  const rootOperationId = chain.root_operation_id;
  if (chain.turns.length) assertJudgePromptBinding(chain, { sessionId, originalPrompt, continuationPrompt });
  if (typeof rootOperationId !== "string" || !rootOperationId || chain.session_id !== sessionId
    || chain.turns.some((turn, ordinal) => ordinal && turn.predecessor_turn_id !== overloadOf(chain.turns[ordinal - 1].error)?.turn_id
      || turn.refusal && (turn.state !== "failed" || !overloadOf(turn.error) || turn.refusal.policy !== policy?.CAPACITY_POLICY || turn.refusal.ordinal !== ordinal || turn.refusal.session_id !== sessionId || turn.refusal.turn_id !== overloadOf(turn.error)?.turn_id || typeof turn.refusal.first_observed_at !== "string" || !Number.isFinite(Date.parse(turn.refusal.first_observed_at)))
      || turn.state === "failed" && overloadOf(turn.error) && !turn.refusal)) throw Object.assign(new Error("Retained capacity chain is malformed"), { code: "capacity_chain_conflict" });
  const refusals = chain.turns.filter(turn => turn.refusal);
  for (const [index, turn] of refusals.entries()) {
    const refusal = turn.refusal, previous = refusals[index - 1]?.refusal;
    let expected;
    try { expected = policy.refusalObservation(turn.error, turn.ordinal, refusal.first_observed_at); }
    catch (cause) { throw Object.assign(new Error("Retained native refusal cannot be reconciled", { cause }), { code: "capacity_chain_conflict" }); }
    if (refusals.slice(0, index).some(item => item.refusal.turn_id === refusal.turn_id)
      || hashJson(refusal) !== hashJson(expected)
      || previous && Date.parse(refusal.first_observed_at) < Date.parse(previous.first_observed_at)
      || (refusal.native_terminal_at !== undefined || refusal.native_terminal_basis !== undefined)
        && (typeof refusal.native_terminal_at !== "string" || !Number.isFinite(Date.parse(refusal.native_terminal_at)) || typeof refusal.native_terminal_basis !== "string" || !refusal.native_terminal_basis
          || previous?.native_terminal_basis === refusal.native_terminal_basis && Date.parse(refusal.native_terminal_at) < Date.parse(previous.native_terminal_at)))
      throw Object.assign(new Error("Retained native refusal identity or time is invalid"), { code: "capacity_chain_conflict" });
  }
  const save = async () => { if (stateFile) await writeJsonAtomic(stateFile, chain); };
  const errors = chain.turns.filter(turn => turn.state === "failed").map(turn => Object.assign(new Error(turn.error.message), turn.error));
  const retainHistory = (error) => {
    if (errors.length && !error.details?.capacity_continuation) error.details = { ...error.details, capacity_continuation: { attempts: errors.length, overloads: errors.map(errorRecord), stop_reason: error.code ?? "continuation_failed" } };
    return error;
  };
  const admitted = async () => {
    await admit();
    const observed = chain.turns.filter(turn => turn.refusal).at(-1)?.refusal;
    if (!Number.isFinite(clock()) || observed && clock() < Date.parse(observed.first_observed_at)) throw Object.assign(new Error("Capacity observation clock reversed or is invalid"), { code: "capacity_chain_conflict" });
    if (deadline !== null && clock() >= deadline) {
      const error = new Error("Judge operation deadline expired");
      error.code = "definition_qualification_timeout";
      throw error;
    }
  };
  const waitUntil = async notBefore => {
    const until = monotonic() + Math.max(0, notBefore - clock());
    while (monotonic() < until) { await admitted(); await wait(Math.min(250, until - monotonic())); }
    await admitted();
  };
  // Publication recovery only observes the original paid Turn. Expired retry
  // deadlines do not invalidate a confirmed result; no inspection/continuation
  // or fresh dispatch is authorized by this path.
  if (recoverOnly) {
    await admit();
    const turn = chain.turns.at(-1);
    if (turn?.state === "completed") return turn.result;
    if (turn?.state !== "dispatched" || !recover) throw Object.assign(new Error("Retained Judge has no completed or dispatched outcome"), { code: "judge_outcome_unknown" });
    const result = await recover(turn.operation_id);
    await admit();
    turn.state = "completed"; turn.result = result; await save();
    return result;
  }
  if (chain.turns.at(-1)?.state === "completed") { await admitted(); return chain.turns.at(-1).result; }
  const settled = async (failure, operationId) => {
    await admitted();
    const overload = overloadOf(failure);
    const observed = await inspect(overload?.turn_id);
    const exactTurn = observed.terminal_turn_id === overload?.turn_id && observed.terminal_status === "failed";
    // Compact inspection may omit the Turn. Its immutable failed receipt can
    // still prove native items; an exact fresh snapshot always overrides it.
    const nativeItems = exactTurn ? observed.native_turn_items : overload?.native_turn_items;
    const nativeOperation = overload?.primary_error?.details?.operation_id;
    const valid = overload && (observed.terminal_turn_id === undefined || exactTurn)
      && (!nativeOperation || nativeOperation === operationId) && policy.nativeItemsSettled(nativeItems)
      && (validateInspection ? await validateInspection(observed, { overload, operationId })
        : (observed.provider_session_id ?? observed.session_id) === sessionId && observed.settled === true
          && observed.settlement?.state !== "pending"
          && (!requireSettlement || observed.settlement?.state === "settled" && observed.settlement.operation_ids?.includes(operationId))
          && (observed.settlement?.state !== "settled" || observed.settlement.operation_ids?.includes(operationId)));
    if (!valid) throw stop(failure, "judge_capacity_settlement_unproven", { capacity_continuation: { attempts: errors.length, overloads: errors.map(errorRecord), stop_reason: "settlement_unproven" } });
    // Native inspection may wait while the owner is cancelled or its packet changes.
    await admitted();
  };
  for (let ordinal = Math.max(0, chain.turns.length - 1); ; ordinal += 1) {
    if (!Number.isSafeInteger(ordinal)) throw Object.assign(new Error("Capacity ordinal is not safe"), { code: "capacity_chain_conflict" });
    const text = ordinal === 0 ? originalPrompt : continuationPrompt;
    let turn = chain.turns[ordinal];
    if (!turn) {
      turn = { ordinal, operation_id: ordinal === 0 ? rootOperationId : `${rootOperationId}:capacity:${ordinal}:session.prompt`, prompt_sha256: createHash("sha256").update(text).digest("hex"), state: "prepared", not_before: clock() };
      chain.turns.push(turn); await save();
    }
    if (turn.ordinal !== ordinal || turn.prompt_sha256 !== createHash("sha256").update(text).digest("hex")) throw Object.assign(new Error("Capacity intent changed"), { code: "capacity_chain_conflict" });
    const operationId = turn.operation_id;
    try { await admitted(); } catch (error) { throw retainHistory(error); }
    if (turn.state === "completed") return turn.result;
    const recovering = turn.state === "dispatched";
    try {
      if (turn.state === "failed") throw Object.assign(new Error(turn.error.message), turn.error);
      if (turn.state === "prepared") await waitUntil(turn.not_before);
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
      await admitted();
      turn.state = "completed"; turn.result = result; await save();
      return result;
    } catch (error) {
      // A pre-send tree/admission rejection is not a new native refusal, even
      // when the owner reports the predecessor error as its primary evidence.
      if (turn.state === "prepared") throw retainHistory(error);
      const normalized = codex ? policy.normalizeCodexFailure(error, sessionId) : null;
      if (normalized) error.details = { ...error.details, capacity_normalization: {
        policy: policy.CAPACITY_POLICY, engine_artifact_sha256: policy.engine_artifact_sha256 ?? null,
        session_id: normalized.session_id, turn_id: normalized.turn_id, provider_limit: providerLimitMetadata(error, policy)
      } };
      const overload = codex ? overloadOf(error) : null;
      if (!overload) {
        if (error.code === "turn_interrupted" && error.details?.provider_session_id === sessionId && error.details?.terminal_status === "failed") { turn.state = "failed"; turn.error = errorRecord(error); await save(); }
        if (errors.length) error.details = { ...error.details, capacity_continuation: { attempts: errors.length + 1, overloads: errors.map(errorRecord), last_error: errorRecord(error) } };
        throw error;
      }
      if (turn.state !== "failed") {
        if (chain.turns.some(item => item.refusal?.turn_id === overload.turn_id)) throw Object.assign(new Error("A duplicate native refusal cannot authorize another continuation"), { code: "capacity_chain_conflict" });
        const observedAt = overload.observed_at;
        if (observedAt !== null && (typeof observedAt !== "string" || !Number.isFinite(Date.parse(observedAt))) || recovering && observedAt === null)
          throw Object.assign(new Error("Recovered native refusal has no immutable valid timestamp"), { code: "capacity_chain_conflict" });
        const refusal = policy.refusalObservation(error, ordinal, observedAt ?? new Date(clock()).toISOString());
        const previous = chain.turns.filter(item => item.refusal).at(-1)?.refusal;
        if (previous && Date.parse(refusal.first_observed_at) < Date.parse(previous.first_observed_at))
          throw Object.assign(new Error("Native refusal observation clock reversed"), { code: "capacity_chain_conflict" });
        turn.refusal = refusal;
        turn.state = "failed"; turn.error = errorRecord(error); await save(); errors.push(error);
      }
      try {
        await admitted();
        const burst = policy.overloadBurst(chain.turns.filter(item => item.refusal).map(item => item.refusal));
        if (burst) throw stop(error, "provider_overload_burst", { capacity_continuation: { attempts: errors.length, stop_reason: "provider_overload_burst", ...burst } });
        await settled(error, operationId);
        const waitMs = policy.capacityBackoff(error, ordinal + 1, clock());
        const remaining = chain.turns[ordinal + 1] ? Math.max(0, chain.turns[ordinal + 1].not_before - clock()) : waitMs;
        if (deadline !== null && remaining >= deadline - clock()) {
          const retryAt = new Date(clock() + waitMs);
          throw stop(error, "retry_after_exceeds_budget", { capacity_continuation: { attempts: errors.length, overloads: errors.map(errorRecord), stop_reason: "retry_after_exceeds_budget", retry_after_at: Number.isFinite(retryAt.getTime()) ? retryAt.toISOString() : null } });
        }
        const nextTextHash = createHash("sha256").update(continuationPrompt).digest("hex");
        const next = chain.turns[ordinal + 1] ?? { ordinal: ordinal + 1, operation_id: `${rootOperationId}:capacity:${ordinal + 1}:session.prompt`, prompt_sha256: nextTextHash, predecessor_turn_id: overload.turn_id, state: "prepared", not_before: clock() + waitMs };
        if (next.predecessor_turn_id !== overload.turn_id || next.prompt_sha256 !== nextTextHash) throw Object.assign(new Error("Capacity predecessor changed"), { code: "capacity_chain_conflict" });
        if (!chain.turns[ordinal + 1]) { chain.turns.push(next); await save(); }
        await onBackoff({ session_id: sessionId, root_operation_id: rootOperationId, predecessor_turn_id: overload.turn_id, continuation: ordinal + 1, policy: policy.CAPACITY_POLICY, wait_ms: remaining });
        await waitUntil(next.not_before);
      } catch (continuationError) { throw retainHistory(continuationError); }
    }
  }
}
