import { readFile } from "node:fs/promises";
import { readModelObservations, modelAttribution } from "./model-observations.mjs";

// Read-only presentation of actual provider signals, never lease/poll activity
// or authority to classify a quiet child as alive/dead.
function nativeActivity(event, parents) {
  const observed_at = event.observed_at;
  if (!Number.isFinite(Date.parse(observed_at))) return null;
  const tool = event.schema_id === "dd-flow/tool-observation@1" ? event.event : null;
  if (tool?.session?.session_id) return { observed_at, session_id: tool.session.session_id,
    parent_session_id: tool.parent_session?.session_id ?? null, kind: "tool", ...(tool.name ? { tool: tool.name } : {}), ...(tool.status ? { status: tool.status } : {}) };
  const params = event.kind === "inbound" ? event.payload?.params : null;
  const update = event.payload?.method === "session/update" ? params?.update : null;
  if (update && ["agent_thought_chunk", "agent_message_chunk", "tool_call", "tool_call_update"].includes(update.sessionUpdate)) {
    if (update.sessionUpdate.endsWith("_chunk") && !update.content?.text) return null;
    const child = update._meta?.zcodeRuntime?.childSessionId;
    return { observed_at, session_id: child ?? params.sessionId, parent_session_id: child ? params.sessionId : null,
      kind: update.sessionUpdate, ...(update.status ? { status: update.status } : {}) };
  }
  if (params?.threadId && (["item/agentMessage/delta", "item/reasoning/textDelta", "item/reasoning/summaryTextDelta", "item/commandExecution/outputDelta"].includes(event.payload?.method)
    || ["item/started", "item/completed"].includes(event.payload?.method) && ["commandExecution", "dynamicToolCall", "mcpToolCall", "fileChange"].includes(params.item?.type)))
    return { observed_at, session_id: params.threadId, parent_session_id: parents.get(params.threadId) ?? null,
      kind: event.payload.method, ...(params.item?.status ? { status: params.item.status } : {}) };
  const step = event.kind === "provider_event" ? event.event?.step_update : null;
  if (step?.conversation_id && ["agent_response", "tool", "subagent"].includes(step.step_type))
    return { observed_at, session_id: step.conversation_id, parent_session_id: parents.get(step.conversation_id) ?? null,
      kind: step.step_type, status: step.state };
  return null;
}

export async function observationSummary(journal) {
  const models = modelAttribution(await readModelObservations(journal));
  let source;
  try { source = await readFile(journal, "utf8"); }
  catch (error) { if (error.code === "ENOENT") return { source: journal, model_attribution: models, observation_gaps: null, confirmed_sleep_intervals: null, timing_note: "Observation evidence is unavailable; missing data is not zero." }; throw error; }
  const gaps = [], failures = [], parents = new Map(), childActivity = new Map();
  let lastActivity = null;
  for (const line of source.split("\n").filter(Boolean)) {
    const event = JSON.parse(line);
    const thread = event.payload?.params?.thread ?? event.payload?.result?.thread;
    if (thread?.id && thread.parentThreadId) parents.set(thread.id, thread.parentThreadId);
    const step = event.event?.step_update;
    for (const child of step?.subagent_info?.subagents ?? []) if (child.conversation_id && step.conversation_id) parents.set(child.conversation_id, step.conversation_id);
    const activity = nativeActivity(event, parents);
    if (activity) {
      if (!lastActivity || Date.parse(activity.observed_at) >= Date.parse(lastActivity.observed_at)) lastActivity = activity;
      const previous = childActivity.get(activity.session_id);
      if (activity.parent_session_id && (!previous || Date.parse(activity.observed_at) >= Date.parse(previous.observed_at))) childActivity.set(activity.session_id, activity);
    }
    if (event.kind === "notification_failure") failures.push({ observed_at: event.observed_at ?? null, ...event.payload });
    if (event.kind !== "observation_gap") continue;
    gaps.push({ observed_at: event.observed_at ?? event.payload?.observed_at ?? null, ...event.payload, confirmed_sleep: false });
  }
  return { source: journal, model_attribution: models, observation_gaps: gaps, observation_failures: failures, completeness: failures.length ? "incomplete" : "available", confirmed_sleep_intervals: null,
    last_activity: lastActivity, child_activity: [...childActivity.values()],
    timing_note: "Wall duration includes waiting and observation gaps. Gaps do not prove OS sleep. Do not subtract them to estimate model work time; token usage is independent." };
}
