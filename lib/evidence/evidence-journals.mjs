import { access, realpath, stat } from "node:fs/promises";
import path from "node:path";
import { harnessConfigKey } from "../driver-bindings.mjs";
import { modelAttribution, modelObservationFile, readModelObservations } from "./model-observations.mjs";
import { observationSummary } from "./observation-summary.mjs";
import { errorRecord } from "../operation-errors.mjs";
import { hashJson } from "../runner-events.mjs";

/**
 * Resolve retained journals, checking containment where an inventory home or state directory is published.
 * @param {object} result Retained execution result and its observation inventory.
 * @returns {Promise<object>} Journal statuses, model attribution and tool observation coverage.
 */
export async function resolveEvidenceJournals(result) {
  const paths = new Set(), rejected = [], roots = new Map();
  const inventory = result.statistics?.usage?.observations;
  const validInventory = inventory?.schema_id === "dd-flow/run-observations@1" && path.isAbsolute(inventory.home ?? "") && Array.isArray(inventory.sources)
    && inventory.sources.every(source => source && typeof source === "object" && !Array.isArray(source));
  const provenance = new Map();
  const inside = (root, file) => {
    const relative = path.relative(root, file);
    return relative && relative !== ".." && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
  };
  const controllers = [result.driver?.controller, result.statistics?.controller, result.details?.controller].filter(Boolean);
  if (validInventory) {
    for (const source of inventory.sources ?? []) {
      if (typeof source.path !== "string" || path.isAbsolute(source.path)) {
        rejected.push({ journal: null, status: "unavailable", reason: source.reason ?? "journal_path_missing", provenance: source.provenance });
        continue;
      }
      const journal = path.resolve(inventory.home, source.path);
      if (!inside(path.resolve(inventory.home), journal)) {
        rejected.push({ journal, status: "unavailable", reason: "journal_outside_published_home", provenance: source.provenance });
        continue;
      }
      paths.add(journal); roots.set(journal, inventory.home); provenance.set(journal, source.provenance);
    }
  }
  for (const controller of controllers) {
    for (const session of controller.sessions ?? []) {
      if (typeof session.journal !== "string" || !path.isAbsolute(session.journal)) continue;
      const journal = path.resolve(session.journal);
      if (typeof session.state_dir === "string" && path.isAbsolute(session.state_dir)) {
        if (!inside(path.resolve(session.state_dir), journal)) {
          rejected.push({ journal, status: "unavailable", reason: "journal_outside_published_state_dir" });
          continue;
        }
        roots.set(journal, session.state_dir);
      }
      paths.add(journal);
    }
  }
  if (inventory !== undefined && !validInventory) {
    rejected.push({ journal: null, status: "unavailable", reason: "canonical_inventory_invalid" });
  }
  if (!controllers.length && inventory === undefined) {
    const legacy = result.driver?.journal ?? (typeof result.attempt === "string" ? path.join(result.attempt, "drivers", "subject.events.jsonl") : null);
    if (typeof legacy === "string" && path.isAbsolute(legacy)) paths.add(legacy);
  }
  const journals = [...rejected], observations = [], observationFiles = new Set();
  for (const journal of [...paths].sort()) {
    try {
      if (roots.has(journal) && !inside(await realpath(roots.get(journal)), await realpath(journal))) {
        journals.push({ journal, status: "unavailable", provenance: provenance.get(journal) ?? "current", reason: "journal_outside_published_state_dir" });
        continue;
      }
      if (!(await stat(journal)).isFile()) throw Object.assign(new Error("Journal is not a file"), { code: "journal_not_file" });
      const models = modelObservationFile(journal);
      let modelStatus = "available";
      try {
        if (roots.has(journal) && !inside(await realpath(roots.get(journal)), await realpath(models))) throw new Error("Model observations escaped the owned directory");
        await access(models);
        if (!observationFiles.has(models)) {
          observations.push(...await readModelObservations(journal));
          observationFiles.add(models);
        }
      } catch { modelStatus = "unavailable"; }
      const summary = await observationSummary(journal);
      journals.push({ journal, status: "available", provenance: provenance.get(journal) ?? "current", model_observations: { file: models, status: modelStatus }, observation_failures: summary.observation_failures ?? [], last_activity: summary.last_activity ?? null, child_activity: summary.child_activity ?? [] });
    } catch (error) { journals.push({ journal, status: "unavailable", provenance: provenance.get(journal) ?? "current", reason: error.code === "ENOENT" ? "journal_missing" : errorRecord(error) }); }
  }
  if (!journals.length) journals.push({ journal: null, status: "unavailable", reason: "session_journals_not_published" });
  const unique = [...new Map(observations.map(event => [hashJson(event), event])).values()];
  const assertingSessions = validInventory ? inventory.sources.filter(source => source.non_asserting !== true && source.session?.non_asserting !== true).map(source => source.session) : [];
  const validCanonicalIdentity = session => session && typeof session === "object" && !Array.isArray(session)
    && typeof session.session_id === "string" && Boolean(session.session_id.trim())
    && typeof (session.harness_id ?? session.harness) === "string" && Boolean((session.harness_id ?? session.harness).trim());
  const canonicalIdentityInvalid = assertingSessions.some(session => !validCanonicalIdentity(session));
  if (canonicalIdentityInvalid) journals.push({ journal: null, status: "unavailable", reason: "canonical_session_identity_invalid" });
  const expectedModelSessions = [...new Map([
    ...assertingSessions.filter(validCanonicalIdentity),
    ...controllers.flatMap(controller => controller.sessions ?? [])
  ].map(session => {
    const id = session.session_id ?? session.id ?? session.provider_session_id;
    let harness = session.harness_id ?? session.harness;
    if (harness === undefined && session.profile?.harness !== undefined) {
      try { harness = harnessConfigKey(session.profile.harness); }
      catch { journals.push({ journal: null, status: "unavailable", reason: "controller_session_identity_invalid" }); return null; }
    }
    return typeof id === "string" && id ? (typeof harness === "string" ? { harness, session_id: id } : id) : null;
  }).filter(Boolean).map(identity => [hashJson(identity), identity])).values()];
  const attribution = modelAttribution(unique, expectedModelSessions);
  if (canonicalIdentityInvalid || journals.some(item => item.observation_failures?.length || ["canonical_inventory_invalid", "controller_session_identity_invalid"].includes(item.reason))) attribution.observation_completeness = "incomplete";
  const counters = inventory?.tools ?? result.statistics?.usage?.tool_calls ?? result.driver?.evidence?.tool_calls ?? null;
  const status = inventory?.tools?.completeness === "complete" && inventory.tools.outcome_completeness === "complete" ? "complete"
    : !journals.some(item => item.status === "available") ? "unavailable" : "partial";
  return { journals, attribution, tools: { status, sources: journals, counters,
    ...(inventory ? { legacy_counters: result.statistics?.usage?.legacy_tool_calls ?? null,
      journal_coverage: Object.fromEntries(["current", "inherited"].map(kind => {
        const selected = journals.filter(source => source.provenance === kind);
        return [kind, { available: selected.filter(source => source.status === "available").length, expected: selected.length }];
      })) } : {}) } };
}
