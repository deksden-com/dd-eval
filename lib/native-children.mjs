import { readFile, readdir } from "node:fs/promises";
import path from "node:path";

const fail = (message, code = "validation") => { const error = new Error(message); error.code = code; throw error; };

function childId(value) {
  for (const key of ["provider_session_id", "session_id", "sessionId", "childSessionId", "conversation_id", "conversationId", "id", "subagentId"]) {
    if (typeof value?.[key] === "string" && value[key]) return value[key];
  }
  return null;
}

function childParentId(value) {
  for (const key of ["parent_provider_session_id", "parent_session_id", "parentSessionId", "parentID", "parentId"]) {
    if (typeof value?.[key] === "string" && value[key]) return value[key];
  }
  return null;
}

function normalizedChildStatus(value, fallback = "unknown") {
  const raw = String(value?.status ?? value?.state ?? fallback).toLowerCase();
  if (["completed", "complete", "done", "success", "succeeded"].includes(raw)) return "completed";
  if (raw === "settled_by_root") return "settled_by_root";
  if (["failed", "error"].includes(raw)) return "failed";
  if (["cancelled", "canceled"].includes(raw)) return "cancelled";
  if (["running", "active", "pending"].includes(raw)) return "running";
  return fallback;
}

/** Normalize only provider-observed direct children.  Textual model claims are never input. */
export function directNativeChildren(receipt, rootSessionId, contracts = null) {
  if (contracts) return contracts.normalizeNativeChildren(receipt, rootSessionId);
  // Legacy raw evidence only. Productive owners supply their verified contract.
  const candidates = [];
  const add = (value, source, scopedParent = null, fallback = "unknown") => {
    const sessionId = childId(value); const parentSessionId = childParentId(value) ?? scopedParent;
    if (!sessionId || !parentSessionId) return;
    candidates.push({ session_id: sessionId, parent_session_id: parentSessionId, status: normalizedChildStatus(value, fallback), source, ...(parentSessionId !== rootSessionId ? { provenance: "parent_mismatch" } : {}) });
  };
  for (const value of receipt?.descendants ?? []) add(value, "adapter.descendants");
  for (const value of receipt?.children ?? []) add(value, "opencode.session.children");
  const zcode = receipt?.evidence?.subagents ?? receipt?.subagents;
  for (const value of zcode?.running ?? []) add(value, "zcode/session/subagents", rootSessionId, "running");
  for (const value of zcode?.completed ?? []) add(value, "zcode/session/subagents", rootSessionId, "completed");
  for (const value of zcode?.ended?.items ?? []) add(value, "zcode/session/subagents", rootSessionId);
  const unique = new Map();
  for (const child of candidates) {
    const previous = unique.get(child.session_id);
    if (previous && previous.parent_session_id !== child.parent_session_id) fail("Native child parent observations conflict", "native_child_parent_mismatch");
    if (previous && previous.status !== child.status) fail("Native child observations have no qualified freshness order", "native_child_outcome_conflict");
    if (!previous) unique.set(child.session_id, child);
  }
  for (const observation of receipt?.tree_observations ?? []) {
    const child = unique.get(observation?.provider_session_id);
    if (child && observation.settled === false && !["running", "unknown"].includes(child.status)) fail("Native child terminal conflicts with an unsettled tree observation", "native_child_outcome_conflict");
  }
  return [...unique.values()].sort((left, right) => left.session_id.localeCompare(right.session_id));
}

export async function capacityCodexChildren(codexHome, rootSessionId, contracts = null) {
  const files = [];
  const collect = async (directory) => {
    for (const entry of await readdir(directory, { withFileTypes: true }).catch(() => [])) {
      const file = path.join(directory, entry.name);
      if (entry.isDirectory()) await collect(file);
      else if (entry.isFile() && entry.name.endsWith(".jsonl")) files.push(file);
    }
  };
  await collect(path.join(codexHome, "sessions"));
  const facts = [];
  for (const file of files) {
    const records = (await readFile(file, "utf8")).split("\n").flatMap((line) => { try { return line ? [JSON.parse(line)] : []; } catch { return []; } });
    const sessionId = records.find(record => record.type === "session_meta")?.payload?.id;
    // The leaf's last native lifecycle event is the completion authority.
    const lastLifecycle = records.filter(record => record.type === "event_msg" && ["task_started", "task_complete", "turn_aborted"].includes(record.payload?.type)).at(-1);
    for (const record of records) {
      const meta = record?.type === "session_meta" ? record.payload : null;
      if (typeof meta?.parent_thread_id === "string" && meta.parent_thread_id && typeof meta.id === "string") facts.push({ session_id: meta.id, parent_session_id: meta.parent_thread_id,
        status: lastLifecycle?.payload.type === "task_complete" ? "completed" : lastLifecycle?.payload.type === "turn_aborted" ? "cancelled" : lastLifecycle?.payload.type === "task_started" ? "running" : "unknown",
        terminal_turn_id: lastLifecycle?.payload?.turn_id ?? null, terminal_observed_at: lastLifecycle?.timestamp ?? null, source: file });
    }
  }
  const latest = new Map();
  for (const fact of facts) {
    const prior = latest.get(fact.session_id);
    if (!prior) { latest.set(fact.session_id, fact); continue; }
    if (prior.parent_session_id !== fact.parent_session_id) fail("Codex rollout parent identities conflict", "native_child_outcome_conflict");
    const priorAt = Date.parse(prior.terminal_observed_at), nextAt = Date.parse(fact.terminal_observed_at);
    if (!Number.isFinite(priorAt) || !Number.isFinite(nextAt) || priorAt === nextAt) {
      if (prior.status !== fact.status || prior.terminal_turn_id !== fact.terminal_turn_id) fail("Duplicate Codex rollout files have conflicting native lifecycle evidence", "native_child_outcome_conflict");
    } else if (nextAt > priorAt) latest.set(fact.session_id, fact);
  }
  return directNativeChildren({ descendants: [...latest.values()] }, rootSessionId, contracts);
}
