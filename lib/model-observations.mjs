import { readFile } from "node:fs/promises";
import path from "node:path";

const text = value => typeof value === "string" && value.trim() ? value.trim() : null;
const fields = ["provider", "model", "reasoning", "mode", "permission_mode"];
export const observedFields = value => Object.fromEntries(fields.map(key => [key, text(value?.[key])]));
export const modelObservationFile = journal => path.join(path.dirname(journal), "model-observations.jsonl");

/** Routing is allowed. Permission/autonomy changes remain integrity failures.
 * Missing native fields are unknown, never proof that the request was applied. */
export function checkObservedProfile(requested, observed, { strict = false, required = [] } = {}) {
  const unknown = fields.filter(key => requested?.[key] && !observed?.[key]);
  const changes = fields.filter(key => requested?.[key] && observed?.[key] && requested[key] !== observed[key]);
  const violations = changes.filter(key => strict || ["mode", "permission_mode"].includes(key));
  const missing = required.filter(key => !observed?.[key]);
  if (violations.length || missing.length) throw Object.assign(new Error("native execution profile integrity is not confirmed"), {
    code: "profile_integrity_violation", details: { requested: observedFields(requested), observed: observedFields(observed), violations, missing }
  });
  return { requested: observedFields(requested), observed: observedFields(observed), status: unknown.length ? "incomplete" : changes.length ? "mixed" : "matched", matched: !unknown.length && !changes.length, unknown, changes };
}

export async function readModelObservations(journal) {
  try { const text = await readFile(modelObservationFile(journal), "utf8"); return text.slice(0, text.lastIndexOf("\n") + 1).split("\n").filter(Boolean).map(JSON.parse); }
  catch (error) { if (error.code === "ENOENT") return []; throw error; }
}


export function modelAttribution(events) {
  const sessions = new Map();
  for (const event of events) {
    const key = `${event.harness}:${event.session_id}`;
    const session = sessions.get(key) ?? { harness: event.harness, session_id: event.session_id, parent_session_id: event.parent_session_id, requested: event.requested, observations: [] };
    session.observations.push(event); sessions.set(key, session);
  }
  const models = [...new Set(events.map(event => event.observed?.model).filter(Boolean))];
  const incomplete = !events.length || [...sessions.values()].some(session => session.observations.some(event => event.evidence === "unavailable" || !event.observed?.model));
  return { models, mixed: models.length > 1 || events.some(event => event.observed?.model && event.requested?.model && event.observed.model !== event.requested.model),
    observation_completeness: incomplete ? "incomplete" : "available_native_sources", transitions: events.filter(event => event.kind === "model_changed"),
    sessions: [...sessions.values()], usage_attribution: "session_totals_unattributed_to_model", note: "Native settings/events do not prove undisclosed server routing or per-model token costs." };
}
