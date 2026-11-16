import path from "node:path";
import { harnessConfigKey } from "../harness/driver-bindings.mjs";
import { conformanceExecutionContract, contractProfile, nativePermissionMode } from "../execution-contract.mjs";

/**
 * Compare a retained execution's native observations with its validated frozen contract.
 * @param {object} result Execution result with model attribution and controller evidence.
 * @param {object} contract Validated execution contract and frozen profiles.
 * @param {object} frozen Retained RUN configuration already checked by the caller.
 * @returns {object} Conformance projection; absent evidence remains unknown.
 */
export function modelConformance(result, contract, frozen) {
  const conformance = conformanceExecutionContract(frozen, contract);
  const controllers = [result.driver?.controller, result.statistics?.controller, result.details?.controller].filter(Boolean);
  const identities = new Map(controllers.flatMap(controller => (controller.sessions ?? []).map(session => [session.session_id, session.profile_id])));
  const sessions = result.model_attribution?.sessions ?? [];
  const assertionsFor = session => (session.observations ?? []).filter(event => !event.source?.non_asserting);
  const parentsFor = session => [...new Set(assertionsFor(session).map(event => event.parent_session_id).filter(value => value != null))];
  const parentFor = session => parentsFor(session)[0] ?? (session.observations?.length ? null : session.parent_session_id);
  const identityFor = (session, visited = new Set()) => {
    if (visited.has(session.session_id)) return null;
    visited.add(session.session_id);
    if (identities.has(session.session_id)) return identities.get(session.session_id);
    const parent = sessions.find(item => item.session_id === parentFor(session) && item.harness === session.harness);
    return parent ? identityFor(parent, visited) : null;
  };
  const mismatches = new Set(), unknown = new Set(), unknownRoles = new Set(), diagnostics = [];
  let provenIntent = false, nativeSource = null;
  const known = value => value !== undefined && value !== null && value !== "";
  const diagnosticValue = value => typeof value === 'string' ? value.slice(0, 200) : value == null || ['number', 'boolean'].includes(typeof value) ? value ?? null : 'malformed';
  const diagnose = (session, field, expected, observed, kind) => {
    (kind === "conflicting" ? mismatches : unknown).add(session.session_id);
    if (diagnostics.length < 128) diagnostics.push({ session_id: session.session_id, field,
      expected: diagnosticValue(expected), observed: diagnosticValue(observed), kind,
      ...(nativeSource ? { source: Object.fromEntries(['channel', 'method', 'message_id', 'event_sha256'].filter(key => typeof nativeSource[key] === 'string').map(key => [key, nativeSource[key].slice(0, 200)])) } : {}) });
  };
  for (const session of result.model_attribution?.sessions ?? []) {
    nativeSource = null;
    const assertions = assertionsFor(session);
    if (!assertions.length) continue;
    const parents = parentsFor(session);
    if (parents.length > 1) diagnose(session, "parent_session_id", "one native parent", "multiple native parents", "conflicting");
    for (const event of assertions) if (event.evidence_conflict) { nativeSource = event.source; diagnose(session, "native_event", "immutable native observation", event.evidence_conflict.code ?? "conflict", "conflicting"); }
    const proofs = assertions.filter(event => ["configured", "request", "response"].includes(event.evidence));
    if (!proofs.some(event => typeof event.requested?.model === 'string' && event.requested.model.trim()))
      diagnose(session, "outbound_model", "assertive native model request/configuration", null, "missing");
    if (!proofs.length) continue;
    const id = identityFor(session);
    if (!id) { diagnose(session, "profile_lineage", "controller-bound profile", null, "missing"); continue; }
    const expected = contract.profiles[id] ? contractProfile(contract, id) : null;
    if (!expected) { diagnose(session, "profile", id, null, "missing"); continue; }
    for (const event of proofs) {
      nativeSource = event.source;
      const request = event.requested ?? {}, role = event.native_agent_role;
      let expectedMode = expected?.mode;
      if (session.harness && harnessConfigKey(session.harness) === 'opencode-server'
        && (parentFor(session) || request.mode === 'dd-flow-worker' || role?.kind === 'subagent')) {
        const parentId = parentFor(session);
        const parent = sessions.find(item => item.harness === session.harness && item.session_id === parentId);
        const launch = role?.launch;
        if (!parent) { diagnose(session, "native_parent", "owned root", null, "missing"); unknownRoles.add(session.session_id); }
        else if (parentFor(parent)) diagnose(session, "native_depth", 1, "nested", "conflicting");
        for (const [field, actual, wanted] of [
          ["role.kind", role?.kind, "subagent"], ["role.name", role?.name, "dd-flow-worker"],
          ["role.parent_session_id", role?.parent_session_id, parentId], ["event.parent_session_id", event.parent_session_id, parentId],
          ["launch.root_session_id", launch?.root_session_id, parentId], ["launch.primary_agent", launch?.primary_agent, expected.mode],
          ["launch.subagent", launch?.subagent, "dd-flow-worker"], ["launch.max_depth", launch?.max_depth, 1]
        ]) {
          if (!known(actual) || !known(wanted)) { diagnose(session, field, wanted, actual, "missing"); unknownRoles.add(session.session_id); }
          else if (actual !== wanted) diagnose(session, field, wanted, actual, "conflicting");
        }
        for (const [field, actual, valid] of [["launch.locator", launch?.locator, typeof launch?.locator === 'string' && path.isAbsolute(launch.locator)], ["launch.sha256", launch?.sha256, typeof launch?.sha256 === 'string' && /^[a-f0-9]{64}$/.test(launch.sha256)]])
          if (!known(actual)) { diagnose(session, field, "bound launch provenance", null, "missing"); unknownRoles.add(session.session_id); }
          else if (!valid) diagnose(session, field, "bound launch provenance", "malformed", "conflicting");
        expectedMode = 'dd-flow-worker';
      }
      if (session.harness && harnessConfigKey(session.harness) !== harnessConfigKey(expected.harness)) diagnose(session, "harness", expected.harness, session.harness, "conflicting");
      for (const [field, wanted] of [['provider', expected.provider], ['model', expected.model], ['reasoning', expected.reasoning], ['mode', expectedMode], ['permission_mode', nativePermissionMode(expected)]])
        if (known(request[field]) && request[field] !== wanted) diagnose(session, field, wanted, request[field], "conflicting");
      if (known(role?.name) && role.name !== expectedMode) diagnose(session, "role.name", expectedMode, role.name, "conflicting");
      if (typeof request.model === 'string' && request.model.trim()) provenIntent = true;
    }
  }
  return { ...conformance, state: mismatches.size || conformance.state === 'mismatched' ? 'mismatched'
      : unknown.size || !provenIntent || conformance.state !== 'matched' ? 'unknown' : 'matched',
    ...(unknownRoles.size ? { unproven_native_roles: [...unknownRoles] } : {}), ...(mismatches.size ? { intent_mismatches: [...mismatches] } : {}),
    intent_evidence: unknown.size || !provenIntent ? "unknown" : "available",
    ...(unknown.size ? { unmapped_intent_sessions: [...unknown] } : {}), ...(diagnostics.length ? { intent_diagnostics: diagnostics } : {}) };
}
