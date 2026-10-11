import { readFile } from "node:fs/promises";
import path from "node:path";
import { canonicalJson, sha256, hashJson, writeJsonAtomic } from "./runner-events.mjs";
import { stages } from "./entry-pack.mjs";
import { selectedExecutionEntries } from "./completion-scope.mjs";
import { isCliAdmittedExecutionSnapshot } from "./memory-runtime-setup.mjs";

const aliases = { codex: "codex-desktop", "codex-desktop": "codex-desktop", zcode: "zcode-acp", "zcode-acp": "zcode-acp", agy: "antigravity-cli", "antigravity-cli": "antigravity-cli", grok: "grok-acp", "grok-acp": "grok-acp", opencode: "opencode-server", "opencode-server": "opencode-server", droid: "droid-cli", "droid-cli": "droid-cli" };
const flowHarness = { "codex-desktop": "codex", "zcode-acp": "zcode", "antigravity-cli": "agy", "grok-acp": "grok", "opencode-server": "opencode", "droid-cli": "droid" };
const fields = ["schema_id", "id", "harness", "provider", "model", "reasoning", "mode", "permission"];
const fail = (message, code = "execution_contract_invalid") => { throw Object.assign(new Error(message), { code }); };
const safeId = id => typeof id === "string" && /^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(id);
const object = value => value && typeof value === "object" && !Array.isArray(value);
const cliRevision = value => sha256(canonicalJson(value).slice(0, -1));

export function profileSemanticHash(profile) {
  return hashJson(Object.fromEntries(["id", "harness", "provider", "model", "reasoning", "mode", "permission"].map(key => [key, key === "harness" ? aliases[profile[key]] : profile[key]])));
}
function validateProfile(profile, id) {
  if (!safeId(id) || !object(profile) || profile.schema_id !== "dd-flow/agent-profile@1" || profile.id !== id
    || Object.keys(profile).some(key => !fields.includes(key)) || !flowHarness[aliases[profile.harness]]
    || ["provider", "model", "reasoning", "mode"].some(key => typeof profile[key] !== "string" || !profile[key].trim())
    || !["allow", "deny"].includes(profile.permission)) fail(`Invalid complete execution profile: ${id}`);
}
export function assertExecutionPolicy(profile) {
  // The pinned adapters implement configurable deny only in ZCode's ACP bridge.
  // Other adapters hard-code autonomous approval; an ignored flag is not policy.
  if (profile.permission === "deny" && aliases[profile.harness] !== "zcode-acp")
    fail(`Adapter cannot enforce permission=deny: ${profile.id ?? profile.harness}`, "execution_policy_unsupported");
}
export const nativePermissionMode = profile => aliases[profile.harness] === "antigravity-cli" && profile.permission === "allow"
  ? "always-proceed" : profile.permission ?? profile.permission_mode;
function validateOverride(route, root = false) {
  if (!object(route) || Object.keys(route).some(key => !["agent_profile_id", "delegation", ...(root ? ["stage_overrides"] : [])].includes(key))) fail("Invalid execution routing");
  if ((root || route.agent_profile_id !== undefined) && !safeId(route.agent_profile_id)) fail("Invalid routing profile ID");
  if (route.delegation !== undefined) {
    const value = route.delegation;
    if (!object(value) || Object.keys(value).some(key => !["mode", "agent_profile_id", "max_parallel"].includes(key))
      || !["native", "external"].includes(value.mode) || (value.agent_profile_id !== undefined && !safeId(value.agent_profile_id))
      || (value.max_parallel !== undefined && (value.mode !== "external" || !Number.isSafeInteger(value.max_parallel) || value.max_parallel < 1))) fail("Invalid delegation");
  }
  if (root && route.stage_overrides !== undefined) {
    if (!object(route.stage_overrides)) fail("Invalid stage overrides");
    for (const [stage, override] of Object.entries(route.stage_overrides)) { if (!stages.includes(stage)) fail(`Invalid routing stage: ${stage}`); validateOverride(override); }
  }
}
const semantic = contract => ({ profiles: contract.profiles, routing: contract.routing, roles: contract.roles });
const integrityHash = contract => hashJson({ ...contract, integrity_sha256: undefined });
function admissionIds(contract, selectedStages) {
  if (contract.generic_execution) return [...new Set([...Object.values(contract.roles), contract.routing.root_profile,
    ...selectedStages.map(stage => contract.routing.stage_profiles[stage]), ...contract.routing.work_profiles])];
  const admission = new Set(Object.values(contract.roles));
  for (const stage of selectedStages) {
    const route = contract.routing.stage_overrides?.[stage];
    const coordinatorId = route?.agent_profile_id ?? contract.routing.agent_profile_id;
    const delegation = route?.delegation ?? contract.routing.delegation;
    admission.add(coordinatorId); admission.add(delegation?.agent_profile_id ?? coordinatorId);
  }
  return [...admission];
}

export async function resolveExecutionContract({ runProfile, loadProfile, configHome, stages: reachable }) {
  const input = runProfile.value ?? runProfile;
  const roles = { subject: input.subject?.profile_id };
  if (input.interaction_judge?.profile_id) roles.interaction_judge = input.interaction_judge.profile_id;
  if (input.judge?.enabled && input.judge.profile_id) roles.final_judge = input.judge.profile_id;
  const routing = structuredClone(input.subject?.execution ?? { agent_profile_id: roles.subject });
  validateOverride(routing, true);
  const ids = new Set(Object.values(roles));
  for (const route of [routing, ...Object.values(routing.stage_overrides ?? {})]) for (const id of [route.agent_profile_id, route.delegation?.agent_profile_id]) if (id !== undefined) ids.add(id);
  const contract = { schema_id: "dd-eval/execution-contract@1", profiles: {}, declarations: {}, routing, roles, field_sources: {}, profile_sha256: {}, admission_profile_ids: [] };
  for (const id of ids) {
    if (!safeId(id)) fail(`Invalid profile ID: ${id}`);
    let template;
    try { template = JSON.parse(await readFile(path.join(configHome, "agent-profiles", `${id}.json`), "utf8")); }
    catch (cause) { throw Object.assign(new Error(`Complete runtime template unavailable: ${id}`, { cause }), { code: "agent_profile_missing" }); }
    validateProfile(template, id);
    assertExecutionPolicy(template);
    let declaration;
    try { const loaded = await loadProfile(id); declaration = loaded?.value ?? loaded; }
    catch (error) { if (Object.values(roles).includes(id) || !["ENOENT", "profile_missing", "profile_not_found"].includes(error.code)) throw error; }
    if (declaration) {
      if (declaration.id !== id || aliases[declaration.harness] !== aliases[template.harness]
        || ["provider", "mode"].some(key => Object.hasOwn(declaration, key) && declaration[key] !== template[key])
        || ["permission", "permission_mode"].some(key => Object.hasOwn(declaration, key))) fail(`Conflicting or unsupported repo declaration: ${id}`);
      if (["model", "reasoning"].some(key => typeof declaration[key] !== "string" || !declaration[key].trim())) fail(`Incomplete repo declaration: ${id}`);
    }
    const effective = { ...template, harness: flowHarness[aliases[template.harness]], ...(declaration ? { model: declaration.model, reasoning: declaration.reasoning } : {}) };
    contract.profiles[id] = effective;
    // Only compatibility/capacity fields belong in retained declarations; never arbitrary notes or secrets.
    contract.declarations[id] = { schema_version: 1, id, harness: aliases[effective.harness], model: effective.model, reasoning: effective.reasoning,
      ...(declaration?.runtime ? { runtime: structuredClone(declaration.runtime) } : {}), ...(declaration?.subagent_capacity !== undefined ? { subagent_capacity: declaration.subagent_capacity } : {}) };
    contract.field_sources[id] = { template_sha256: hashJson(template), model: declaration ? "repo" : "runtime_template", reasoning: declaration ? "repo" : "runtime_template", provider: "runtime_template", mode: "runtime_template", permission: "runtime_template" };
    contract.profile_sha256[id] = profileSemanticHash(effective);
  }
  const selectedStages = reachable ?? (Array.isArray(input.selection?.focused_stages)
    ? [...new Set(selectedExecutionEntries(input, stages).flatMap(entry => stages.slice(stages.indexOf(entry.stage), stages.indexOf(entry.terminal_stage) + 1)))]
    : input.selection?.stop_after ? stages.slice(0, stages.indexOf(input.selection.stop_after) + 1) : stages);
  if (selectedStages.some(stage => !stages.includes(stage)) || (input.selection?.stop_after && !stages.includes(input.selection.stop_after))) fail("Invalid admission stages");
  for (const stage of [undefined, ...stages]) {
    const route = routing.stage_overrides?.[stage];
    const coordinator = contract.profiles[route?.agent_profile_id ?? routing.agent_profile_id];
    const delegation = route?.delegation ?? routing.delegation ?? { mode: "native" };
    const worker = contract.profiles[delegation.agent_profile_id ?? coordinator.id];
    if (delegation.mode === "native" && profileSemanticHash({ ...worker, id: coordinator.id }) !== profileSemanticHash(coordinator)) fail("Native delegation cannot change session settings", "native_profile_override_unqualified");
  }
  contract.admission_stages = [...selectedStages];
  contract.admission_profile_ids = admissionIds(contract, selectedStages);
  contract.semantic_sha256 = hashJson(semantic(contract));
  contract.integrity_sha256 = integrityHash(contract);
  return validateExecutionContract(contract);
}

/** Generic routing is resolved by the exact installed CLI, not reimplemented
 * here. Repo Subject identity may differ from the selected operator profile ID,
 * but its model/reasoning/harness declaration must match that selected root. */
export async function resolveGenericExecutionContract({ runProfile, expectation, loadProfile, configHome, stages: reachable }) {
  const input = runProfile.value ?? runProfile;
  const root = expectation.profiles.find(entry => entry.id === expectation.settings.root_profile)?.profile;
  if (!root) fail("Generic root profile was not frozen");
  const loadedSubject = await loadProfile(input.subject.profile_id), subject = loadedSubject.value ?? loadedSubject;
  if (aliases[subject.harness] !== aliases[root.harness] || subject.model !== root.model || subject.reasoning !== root.reasoning
    || ["provider", "mode"].some(key => subject[key] !== undefined && subject[key] !== root[key])
    || ["permission", "permission_mode"].some(key => subject[key] !== undefined)) fail("Memory root differs from declared Subject", "profile_contract_mismatch");
  const contract = { schema_id: "dd-eval/execution-contract@1", profiles: {}, declarations: {}, routing: structuredClone(expectation.settings),
    roles: { subject: input.subject.profile_id }, field_sources: {}, profile_sha256: {}, admission_profile_ids: [],
    admission_stages: [...reachable], generic_execution: structuredClone(expectation) };
  const retain = (profile, declaration, source) => {
    validateProfile(profile, profile.id); assertExecutionPolicy(profile);
    contract.profiles[profile.id] = structuredClone(profile);
    contract.declarations[profile.id] = { schema_version: 1, id: profile.id, harness: aliases[profile.harness], model: profile.model, reasoning: profile.reasoning,
      ...(declaration?.runtime ? { runtime: structuredClone(declaration.runtime) } : {}), ...(declaration?.subagent_capacity !== undefined ? { subagent_capacity: declaration.subagent_capacity } : {}) };
    contract.field_sources[profile.id] = { source }; contract.profile_sha256[profile.id] = profileSemanticHash(profile);
  };
  retain({ ...root, id: subject.id }, subject, "declared_subject_matching_selected_root");
  for (const entry of expectation.profiles) {
    let declaration;
    try { const loaded = await loadProfile(entry.id); declaration = loaded.value ?? loaded; } catch (error) { if (!["ENOENT", "profile_missing", "profile_not_found"].includes(error.code)) throw error; }
    if (entry.id === root.id) declaration = subject;
    if (declaration && (aliases[declaration.harness] !== aliases[entry.profile.harness] || declaration.model !== entry.profile.model || declaration.reasoning !== entry.profile.reasoning
      || ["provider", "mode"].some(key => declaration[key] !== undefined && declaration[key] !== entry.profile[key])
      || ["permission", "permission_mode"].some(key => declaration[key] !== undefined))) fail("Selected Memory profile differs from its declared qualification", "profile_contract_mismatch");
    retain(entry.profile, declaration, "installed_cli_operator_selection");
  }
  for (const [role, id] of [["interaction_judge", input.interaction_judge?.profile_id], ["final_judge", input.judge?.enabled ? input.judge.profile_id : undefined]]) {
    if (!id) continue;
    contract.roles[role] = id;
    const admitted = await resolveExecutionContract({ runProfile: { subject: { profile_id: id } }, configHome, loadProfile, stages: [] });
    if (contract.profiles[id] && profileSemanticHash(contract.profiles[id]) !== admitted.profile_sha256[id]) fail("Memory role profile conflicts with execution selection", "profile_contract_mismatch");
    retain(admitted.profiles[id], admitted.declarations[id], "validated_runtime_role");
  }
  contract.admission_profile_ids = admissionIds(contract, reachable);
  contract.semantic_sha256 = hashJson(semantic(contract)); contract.integrity_sha256 = integrityHash(contract);
  return validateExecutionContract(contract);
}

export function validateExecutionContract(contract) {
  const catalog = contract?.generic_execution?.contour ?? stages;
  if (!object(contract) || contract.schema_id !== "dd-eval/execution-contract@1" || !object(contract.profiles) || !object(contract.roles)
    || !safeId(contract.roles.subject) || Object.keys(contract.roles).some(key => !["subject", "interaction_judge", "final_judge"].includes(key))
    || !object(contract.declarations) || !object(contract.field_sources) || !object(contract.profile_sha256)
    || !Array.isArray(contract.admission_profile_ids) || !Array.isArray(contract.admission_stages)
    || !Array.isArray(catalog) || !catalog.length || new Set(catalog).size !== catalog.length
    || catalog.some(stage => typeof stage !== "string" || !/^[a-z][a-z0-9-]{0,63}$/.test(stage))
    || contract.admission_stages.some(stage => !catalog.includes(stage)) || new Set(contract.admission_stages).size !== contract.admission_stages.length) fail("Missing or incomplete execution contract");
  if (contract.generic_execution) {
    const generic = contract.generic_execution, routing = contract.routing;
    if (!object(routing) || routing.schema_id !== "dd-flow/execution-settings@1" || !safeId(routing.flow_id)
      || !/^[a-f0-9]{64}$/.test(routing.descriptor_sha256 ?? "") || !safeId(routing.root_profile)
      || !object(routing.stage_profiles) || Object.keys(routing.stage_profiles).length !== catalog.length
      || routing.execution !== "managed" || routing.stage_session_mode !== "new_session" || routing.attached_session_receipt !== null
      || catalog.some(stage => !safeId(routing.stage_profiles[stage])) || !Array.isArray(routing.work_profiles)
      || new Set(routing.work_profiles).size !== routing.work_profiles.length
      || routing.work_profiles.some(id => !safeId(id)) || !["external", "native"].includes(routing.delegation?.mode)
      || !Number.isSafeInteger(routing.delegation.max_parallel) || routing.delegation.max_parallel < 1 || routing.delegation.max_parallel > 256
      || !/^[a-f0-9]{64}$/.test(generic.engine_artifact_sha256 ?? "") || hashJson(routing) !== hashJson(generic.settings)
      || !object(generic.aliases) || Object.entries(generic.aliases).some(([alias, id]) => !safeId(alias) || !safeId(id) || !generic.profiles?.some(entry => entry.id === id))
      || generic.native_capacity !== (routing.delegation.mode === "native" ? "requires_cli_admission" : "not_required")
      || routing.delegation.native_capacity_receipt !== null
      || !Array.isArray(generic.profiles) || generic.profiles.length !== routing.profiles?.length
      || new Set(generic.profiles.map(entry => entry.id)).size !== generic.profiles.length
      || generic.profiles.some(entry => !contract.profiles[entry.id] || cliRevision(entry.profile) !== entry.revision
        || hashJson(entry.profile) !== hashJson(contract.profiles[entry.id])
        || !routing.profiles.some(reference => reference.id === entry.id && reference.revision === entry.revision))) fail("Invalid generic execution expectation");
  } else validateOverride(contract.routing, true);
  for (const [id, profile] of Object.entries(contract.profiles)) {
    validateProfile(profile, id);
    if (contract.profile_sha256[id] !== profileSemanticHash(profile)) fail(`Profile hash mismatch: ${id}`);
    const declaration = contract.declarations[id];
    if (!object(declaration) || declaration.id !== id || declaration.harness !== aliases[profile.harness]
      || declaration.model !== profile.model || declaration.reasoning !== profile.reasoning
      || (declaration.runtime !== undefined && !object(declaration.runtime))
      || (declaration.subagent_capacity !== undefined && (!Number.isSafeInteger(declaration.subagent_capacity) || declaration.subagent_capacity < 1))
      || !object(contract.field_sources[id])) fail(`Invalid retained declaration: ${id}`);
  }
  const references = contract.generic_execution ? [contract.routing.root_profile, ...Object.values(contract.routing.stage_profiles), ...contract.routing.work_profiles]
    : [contract.routing, ...Object.values(contract.routing.stage_overrides ?? {})].flatMap(route => [route.agent_profile_id, route.delegation?.agent_profile_id]).filter(id => id !== undefined);
  for (const id of [...Object.values(contract.roles), ...(contract.admission_profile_ids ?? []), ...references]) if (!Object.hasOwn(contract.profiles, id)) fail(`Unfrozen profile: ${id}`, "execution_profile_not_frozen");
  if (contract.semantic_sha256 !== hashJson(semantic(contract))) fail("Execution contract hash mismatch");
  if (hashJson(contract.admission_profile_ids) !== hashJson(admissionIds(contract, contract.admission_stages))) fail("Execution admission inventory mismatch");
  if (contract.integrity_sha256 !== integrityHash(contract)) fail("Execution contract integrity mismatch");
  return contract;
}
export function contractProfile(contract, id) {
  validateExecutionContract(contract);
  if (!Object.hasOwn(contract.profiles, id)) fail(`Profile is not frozen: ${id}`, "execution_profile_not_frozen");
  const effective = contract.profiles[id];
  return { ...contract.declarations[id], id, harness: aliases[effective.harness], model: effective.model, reasoning: effective.reasoning, provider: effective.provider, mode: effective.mode, permission: effective.permission, execution_profile_sha256: contract.profile_sha256[id] };
}
export async function materializeExecutionContract(runtimeRoot, contract) {
  validateExecutionContract(contract);
  for (const [id, profile] of Object.entries(contract.profiles)) await writeJsonAtomic(path.join(runtimeRoot, "agent-profiles", `${id}.json`), profile);
  if (contract.generic_execution) await writeJsonAtomic(path.join(runtimeRoot, "profile-settings.json"), {
    schema_id: "dd-flow/profile-settings@1", profiles: contract.generic_execution.profiles, aliases: contract.generic_execution.aliases, default_profile: null });
  await writeJsonAtomic(path.join(runtimeRoot, "execution-contract.json"), contract);
}
export function conformanceExecutionContract(runJSON, contract) {
  if (!contract) return { state: "unknown", reason: "legacy_execution_contract_missing" };
  validateExecutionContract(contract);
  if (contract.generic_execution) {
    const snapshot = runJSON?.frozen_execution;
    if (!snapshot?.settings || !Array.isArray(snapshot.profiles)) return { state: "unknown", reason: "frozen_generic_execution_missing", contract_sha256: contract.semantic_sha256 };
    if (snapshot.settings.delegation?.mode === "native" && !isCliAdmittedExecutionSnapshot(snapshot)) return { state: "unknown", reason: "native_capacity_not_cli_admitted", contract_sha256: contract.semantic_sha256 };
    const settings = structuredClone(snapshot.settings);
    if (settings.delegation?.mode === "native") settings.delegation.native_capacity_receipt = null;
    const mismatches = [];
    if (hashJson(settings) !== hashJson(contract.routing)) mismatches.push("routing");
    if (snapshot.profiles.length !== contract.generic_execution.profiles.length
      || snapshot.profiles.some(entry => !contract.generic_execution.profiles.some(expected => expected.id === entry.id
        && expected.revision === entry.revision && hashJson(expected.profile) === hashJson(entry.profile)))) mismatches.push("profiles");
    return { state: mismatches.length ? "mismatched" : "matched", contract_sha256: contract.semantic_sha256,
      expected_profiles: contract.profiles, frozen_profiles: Object.fromEntries(snapshot.profiles.map(entry => [entry.id, entry.profile])), mismatches };
  }
  const snapshot = runJSON?.execution_profile;
  if (!snapshot?.agent_profiles || !snapshot.settings?.execution) return { state: "unknown", reason: "frozen_run_profiles_missing", contract_sha256: contract.semantic_sha256, expected_profiles: contract.profiles };
  const mismatches = [];
  if (hashJson(snapshot.settings.execution) !== hashJson(contract.routing)) mismatches.push("routing");
  for (const [id, profile] of Object.entries(snapshot.agent_profiles)) if (!contract.profiles[id] || profileSemanticHash(profile) !== contract.profile_sha256[id]) mismatches.push(id);
  for (const route of [contract.routing, ...Object.values(contract.routing.stage_overrides ?? {})]) for (const id of [route.agent_profile_id, route.delegation?.agent_profile_id]) if (id && !snapshot.agent_profiles[id]) mismatches.push(id);
  return { state: mismatches.length ? "mismatched" : "matched", contract_sha256: contract.semantic_sha256,
    expected_profiles: contract.profiles, frozen_profiles: snapshot.agent_profiles, mismatches: [...new Set(mismatches)] };
}
export function assertRunExecutionContract(runJSON, contract) {
  const result = conformanceExecutionContract(runJSON, contract);
  if (result.state !== "matched") fail(`RUN execution contract is ${result.state}: ${(result.mismatches ?? []).join(", ")}`, "profile_contract_mismatch");
  return result;
}

// Comparison admission binds execution/compatibility inputs, not provenance-only edits.
export function executionAdmissionHash(contract) {
  validateExecutionContract(contract);
  return hashJson({ semantic_sha256: contract.semantic_sha256, declarations: contract.declarations,
    admission_stages: contract.admission_stages, admission_profile_ids: contract.admission_profile_ids });
}

export function executionContextHash(blueprint, selectedStages) {
  return hashJson({ schema_id: blueprint?.schema_id ?? null,
    stages: Object.fromEntries(selectedStages.map(stage => [stage, blueprint?.stages?.[stage] ?? null])) });
}

export const executionFixtureHash = (fixtures, contextSha256) => hashJson({ interaction_fixtures: fixtures, stage_context_sha256: contextSha256 });

export function validateExpectedExecutionInputs(expected) {
  if (!object(expected) || Object.keys(expected).length !== 5
    || ["profile_sha256", "contract_sha256", "admission_sha256", "checkpoint_sha256", "fixture_sha256"].some(key => !/^[a-f0-9]{64}$/.test(expected[key] ?? "")))
    fail("Expected inputs must contain five SHA256 bindings", "expected_execution_inputs_invalid");
  return expected;
}

export function assertExpectedExecutionInputs(expected, { profile, contract, checkpoint, fixtures, contextSha256 }) {
  if (expected === undefined) return;
  validateExpectedExecutionInputs(expected);
  const actual = { profile_sha256: hashJson(profile), contract_sha256: contract?.semantic_sha256,
    admission_sha256: executionAdmissionHash(contract), checkpoint_sha256: hashJson(checkpoint), fixture_sha256: executionFixtureHash(fixtures, contextSha256) };
  if (hashJson(actual) !== hashJson(expected)) fail("Execution inputs changed since comparison admission; no EVAL will be queued", "comparison_binding_mismatch");
}
