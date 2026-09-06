import { createHash } from "node:crypto";
import { mkdir, open, readFile } from "node:fs/promises";
import path from "node:path";
import { withRunnerLock } from "./runner-lock.mjs";

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

/** Only adapter-verified native facts enter this file. It records changes,
 * not every tool or token; reading it never requires replaying native history. */
export async function observeModel({ journal, harness, sessionId, parentSessionId = null, requested = {}, observed = {}, source, evidence = "configured", reason = null, nativeTimestamp = null, previousModel = null }) {
  if (!journal || !sessionId) return null;
  if (!source || !["configured", "request", "response", "unavailable"].includes(evidence)) throw new Error("model observation requires a native source and evidence level");
  const file = modelObservationFile(journal), profile = observedFields(observed);
  await mkdir(path.dirname(file), { recursive: true, mode: 0o700 });
  return withRunnerLock(file, async () => {
    const events = await readModelObservations(journal);
    const replay = source?.event_sha256 ? events.find(item => item.session_id === sessionId && item.source?.event_sha256 === source.event_sha256) : null;
    if (replay) return replay;
    const channel = source?.channel ?? evidence;
    const previous = events.findLast(item => item.harness === harness && item.session_id === sessionId && (item.source?.channel ?? item.evidence) === channel);
    const normalizedReason = text(reason)?.slice(0, 200) ?? null;
    if (previous && JSON.stringify(previous.observed) === JSON.stringify(profile) && previous.reason === normalizedReason && previous.evidence === evidence) return previous;
    const previousKnown = events.findLast(item => item.harness === harness && item.session_id === sessionId && item.evidence === evidence && item.observed?.model);
    const fromModel = text(previousModel) ?? previousKnown?.observed.model ?? null;
    const changed = Boolean(profile.model && fromModel && profile.model !== fromModel);
    const value = { schema_id: "dd-eval/model-observation@1", sequence: events.length + 1,
      harness, session_id: sessionId, parent_session_id: parentSessionId,
      kind: changed ? "model_changed" : !profile.model ? "model_observation_unavailable" : "model_observed",
      previous_model: fromModel, requested: observedFields(requested), observed: profile,
      source, evidence, reason: normalizedReason, native_timestamp: text(nativeTimestamp), observed_at: new Date().toISOString() };
    value.id = createHash("sha256").update(JSON.stringify(value)).digest("hex");
    const handle = await open(file, "a", 0o600);
    try {
      const bytes = await readFile(file); const committed = bytes.lastIndexOf(10) + 1;
      if (committed < bytes.length) await handle.truncate(committed);
      await handle.write(`${JSON.stringify(value)}\n`); await handle.sync();
    } finally { await handle.close(); }
    const directory = await open(path.dirname(file), "r");
    try { await directory.sync(); } finally { await directory.close(); }
    return value;
  });
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
