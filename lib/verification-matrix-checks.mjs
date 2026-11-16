import { createHash } from "node:crypto";
import path from "node:path";
import { validateRunnerProof, runnerEvidencePass } from "./check-runner-proof.mjs";
import { matrixCanonical } from "./verification-matrix-schema.mjs";

const digest = bytes => createHash("sha256").update(bytes).digest("hex");
const sorted = values => [...values].sort();
const same = (left, right) => JSON.stringify(sorted(left)) === JSON.stringify(sorted(right));
const unique = values => [...new Set(values)];
const ensure = (condition, message) => { if (!condition) throw new Error(message); };

export function validateFinalCheckCoverage(matrix, plans, gate, decoded) {
  const profiles = ["baseline", "source", "target"].map(role => {
    const sources = matrix.sources.filter(source => source.role === `check_profile_${role}` && source.root === "run");
    ensure(sources.length === 1, `matrix ${role} check profile proof is missing or ambiguous`);
    const value = decoded.get(`run:${sources[0].path}`);
    ensure(value?.schema_id === "dd-flow/retained-check-profile@1" && (value.profile === null ? value.profile_sha256 === null : /^[a-f0-9]{64}$/.test(value.profile_sha256 ?? "")), `matrix ${role} check profile proof differs`);
    const profile = value.profile;
    ensure(profile === null || ["dd-flow/code-check-profile@6", "dd-flow/code-check-profile@7"].includes(profile.schema_id) && profile.aliases && profile.require_alias_for && profile.mandatory_by_gate
      && (profile.schema_id !== "dd-flow/code-check-profile@6" || profile.runner_evidence_by_alias === undefined), `matrix ${role} check profile schema differs`);
    ensure(profile === null ? value.profile_bytes === null : typeof value.profile_bytes === "string" && digest(value.profile_bytes) === value.profile_sha256 && matrixCanonical(JSON.parse(value.profile_bytes)) === matrixCanonical(profile), `matrix ${role} exact profile bytes differ`);
    return profile;
  });
  const [baseline, source, target] = profiles;
  ensure(matrixCanonical(source) === matrixCanonical(target), "matrix integrated target profile differs from reviewed source");
  const semantic = plans.flatMap(plan => (plan.checks ?? []).filter(check => ["work", "code", "readiness", "merge"].includes(check.run_at)).map(check => ({ ...check, canonical_ref: `${plan.protocol_id}/${check.id}` })));
  if (!source) ensure(!baseline && gate.profile_hash === null, "matrix absent profile is not bound to accepted absence");
  else {
    ensure(baseline, "matrix source profile has no accepted baseline");
    const retained = structuredClone(source);
    const existingAliases = new Set(Object.keys(baseline.aliases));
    const aliasFields = ["aliases", "ports_by_alias", "inputs_by_alias", "runner_evidence_by_alias"];
    ensure(!aliasFields.slice(1).some(field => Object.keys(source[field] ?? {}).some(alias => existingAliases.has(alias)
      && !(alias in (baseline[field] ?? {})))), "matrix source changes existing baseline alias metadata");
    for (const field of aliasFields) {
      if (!baseline[field]) delete retained[field];
      else retained[field] = Object.fromEntries(Object.keys(baseline[field]).filter(key => key in (source[field] ?? {})).map(key => [key, source[field][key]]));
    }
    ensure(matrixCanonical(retained) === matrixCanonical(baseline), "matrix source changes baseline policy");
    const planned = new Set(semantic.filter(check => check.availability === "planned" && check.command?.startsWith("@check/")).map(check => check.command));
    const bound = planned.size ? { ...source, ...Object.fromEntries(aliasFields.filter(field => field !== "runner_evidence_by_alias" || source.schema_id === "dd-flow/code-check-profile@7").map(field => [field, Object.fromEntries(Object.entries(source[field] ?? {}).filter(([key]) => !planned.has(key)))])) } : source;
    const bytes = source.schema_id === "dd-flow/code-check-profile@7"
      ? JSON.stringify(bound, (_key, item) => item && typeof item === "object" && !Array.isArray(item) ? Object.fromEntries(Object.entries(item).sort(([left], [right]) => left.localeCompare(right))) : item)
      : JSON.stringify(bound);
    ensure(digest(bytes) === gate.profile_hash, "matrix retained profile hash differs from accepted gate");
  }
  const policy = ["work", "code", "readiness", "merge"].flatMap(run_at => (source?.mandatory_by_gate[run_at] ?? []).map(command => {
    ensure(typeof command === "string" && command.startsWith("@check/") && source.aliases[command], "matrix mandatory policy alias is invalid");
    const id = `POLICY/${run_at}/${command.slice(7).replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").toLowerCase()}`;
    return { id, canonical_ref: id, source: "project_policy", command, purpose: `Mandatory project ${run_at} gate.`, run_at, availability: "available", ...(source.ports_by_alias?.[command] ? { ports: source.ports_by_alias[command] } : {}), ...(source.inputs_by_alias?.[command] ? { inputs: source.inputs_by_alias[command] } : {}) };
  }));
  const required = [...semantic, ...policy], refs = required.map(check => check.canonical_ref);
  ensure(unique(refs).length === refs.length && same(gate.checks.map(check => check.canonical_ref ?? check.id), refs), "matrix final gate omits or adds accepted due checks");
  for (const check of required) {
    ensure(matrixCanonical(gate.checks.find(item => (item.canonical_ref ?? item.id) === check.canonical_ref)) === matrixCanonical(check), "matrix final gate declaration differs from accepted authority");
    if (check.command?.startsWith("@check/")) ensure(source?.aliases[check.command] && (!check.definition || check.definition === source.aliases[check.command]), "matrix required alias definition is unavailable or changed");
  }
}

export function validateCheckCompletion(receipt, completion) {
  ensure(Number.isInteger(receipt.exit_code) && completion?.exit_code === receipt.exit_code
    && typeof completion.finished_at === "string" && Number.isFinite(Date.parse(completion.finished_at))
    && typeof receipt.finished_at === "string" && Number.isFinite(Date.parse(receipt.finished_at))
    && (receipt.fingerprint_scope == null || completion.fingerprint_scope === receipt.fingerprint_scope
      && ["id", "input_hash", "verification_epoch", "before_fingerprint", "after_fingerprint"].every(key => completion[key] === receipt[key])
      && matrixCanonical(completion.input_manifest ?? null) === matrixCanonical(receipt.input_manifest ?? null)), "check has no matching terminal completion");
}

export function validateFinalCheckReceipts(matrix, gate, decoded, runnerBytes = new Map()) {
  const accepted = decoded.get("run:07-merge/merge-gate-acceptance.json");
  ensure(Array.isArray(accepted?.receipts) && unique(accepted.receipts.map(item => item.id)).length === accepted.receipts.length, "matrix final receipt catalog is ambiguous");
  const targetSource = matrix.sources.find(source => source.role === "check_profile_target" && source.root === "run");
  const profile = decoded.get(`run:${targetSource.path}`).profile;
  const normalizedInputs = inputs => sorted(unique(inputs.map(input => {
    ensure(typeof input === "string" && input.trim() && !path.isAbsolute(input) && !input.split(/[\\/]/).includes(".."), "matrix check input is not workspace-relative");
    const normalized = path.posix.normalize(input.replaceAll("\\", "/")).replace(/^\.\/$/, "");
    return normalized === "" || normalized === "." ? "." : normalized.replace(/\/$/, "");
  })));
  const execution = check => {
    const runner = profile?.runner_evidence_by_alias?.[check.command] ?? check.runner_evidence ?? null;
    ensure(runner === null || ["dd-flow/check-runner-evidence@1", "dd-flow/check-runner-evidence@2"].includes(runner.schema_id) && typeof runner.path === "string" && runner.path
      && !path.isAbsolute(runner.path) && !runner.path.includes("\\") && runner.path.split("/")[0] !== "engine-outcome.json"
      && !runner.path.split("/").some(part => ["", ".", ".."].includes(part)), "matrix check runner contract differs");
    // The producer adds these engine/runner obligations after resolving aliases.
    // Passed runner evidence has no failure sidecars; arbitrary extras are not trusted.
    return {
      command: (profile?.aliases[check.command] ?? check.command).replaceAll("{run_id}", matrix.header.run_id),
      required_artifacts: sorted(unique([...(check.required_artifacts ?? []), ...(runner ? [runner.path, "engine-outcome.json"] : [])])),
      runner_evidence: runner,
      ports: sorted(check.ports ?? profile?.ports_by_alias?.[check.command] ?? []),
      inputs: normalizedInputs(check.inputs ?? profile?.inputs_by_alias?.[check.command] ?? []),
      reusable: check.reuse === "deterministic"
    };
  };
  const allBindings = accepted.receipts.flatMap(item => item.binding_refs ?? []);
  ensure(unique(allBindings).length === allBindings.length && same(allBindings, unique([...gate.checks.map(check => check.canonical_ref ?? check.id), ...gate.acceptance_refs])), "matrix final receipt bindings differ");
  for (const saved of accepted.receipts) {
    const nativeSources = unique(matrix.sources.filter(source => source.root === "run" && source.role.startsWith("receipt:")
      && decoded.get(`run:${source.path}`)?.id === saved.id).map(source => source.path));
    ensure(nativeSources.length === 1, "matrix native receipt source is missing or ambiguous");
    const native = decoded.get(`run:${nativeSources[0]}`);
    ensure(native.status === "passed" && native.scope === "aggregate" && native.exit_code === 0
      && [undefined, null, "check_inputs"].includes(native.fingerprint_scope)
      && ["work", "code", "readiness", "merge", "release"].includes(native.gate)
      && native.profile_hash === gate.profile_hash && native.input_hash && native.input_hash === saved.input_hash
      && /^[a-f0-9]{64}$/.test(native.before_fingerprint ?? "") && native.before_fingerprint === native.after_fingerprint
      && native.verification_epoch === digest(`${native.gate}\0${native.before_fingerprint}`)
      && Array.isArray(native.mutation_paths) && native.mutation_paths.length === 0
      && Array.isArray(native.check_refs) && same(native.check_refs, saved.execution_refs ?? []), "matrix native target receipt is invalid");
    const completionPath = path.posix.join(path.posix.dirname(nativeSources[0]), "completion.json");
    ensure(matrix.sources.some(source => source.root === "run" && source.role.startsWith("completion:") && source.path === completionPath), "matrix native completion proof is missing");
    validateCheckCompletion(native, decoded.get(`run:${completionPath}`));
    const bindings = (saved.binding_refs ?? []).map(ref => gate.checks.find(check => (check.canonical_ref ?? check.id) === ref));
    ensure(bindings.length && bindings.every(Boolean), "matrix native receipt has unknown bindings");
    const expected = execution(bindings[0]);
    ensure(bindings.every(check => matrixCanonical(execution(check)) === matrixCanonical(expected)), "matrix native receipt joins different execution contracts");
    if (expected.runner_evidence) {
      const root = path.posix.join(path.posix.dirname(nativeSources[0]), 'artifacts');
      const proof = validateRunnerProof(expected.runner_evidence, { invocation_id: native.id, check_id: native.id, command: native.command, input_hash: native.input_hash, verification_epoch: native.verification_epoch }, relative => {
        const key = `run:${path.posix.join(root, relative)}`;
        const bytes = runnerBytes.get(key);
        if (!bytes) throw Object.assign(new Error('Missing retained runner proof'), { code: 'ENOENT' });
        return bytes;
      });
      if (!runnerEvidencePass(proof.evidence)) throw Object.assign(new Error('matrix native receipt runner proof is invalid'), { code: 'runner_proof_invalid', details: { receipt_id: native.id, contract: proof.contract, diagnostics: proof.diagnostics } });
      expected.required_artifacts = sorted(unique([...expected.required_artifacts, ...proof.required_artifacts]));
    }
    if (!Array.isArray(native.required_artifacts) || !same(native.required_artifacts, expected.required_artifacts)) {
      const observed = Array.isArray(native.required_artifacts) ? native.required_artifacts.filter(name => typeof name === 'string') : [];
      const bounded = paths => paths.slice(0, 16).map(name => name.slice(0, 256));
      throw Object.assign(new Error('matrix native receipt execution contract differs'), { code: 'runner_proof_invalid', details: { receipt_id: String(native.id).slice(0, 256), field: 'required_artifacts', expected: bounded(expected.required_artifacts), observed: bounded(observed),
        missing: bounded(expected.required_artifacts.filter(name => !observed.includes(name))), unexpected: bounded(observed.filter(name => !expected.required_artifacts.includes(name))) } });
    }
    ensure(native.command === expected.command && Array.isArray(native.required_artifacts) && same(native.required_artifacts, expected.required_artifacts)
      && matrixCanonical(native.runner_evidence_required ?? null) === matrixCanonical(expected.runner_evidence)
      && Array.isArray(native.inputs) && same(native.inputs, expected.inputs)
      && same(Object.keys(native.resources?.ports ?? {}), expected.ports)
      && Object.values(native.resources?.ports ?? {}).every(port => Number.isInteger(port) && port > 0 && port <= 65535)
      && Array.isArray(native.artifacts) && native.artifacts.every(artifact => typeof artifact.path === "string" && artifact.path && !artifact.path.includes("\0")
        && !path.isAbsolute(artifact.path) && !artifact.path.split(/[\\/]/).includes("..") && /^[a-f0-9]{64}$/.test(artifact.sha256 ?? ""))
      && expected.required_artifacts.every(name => native.artifacts.some(artifact => artifact.path === name)), "matrix native receipt execution contract differs");
    for (const artifact of native.artifacts) {
      const artifactPath = path.posix.join(path.posix.dirname(nativeSources[0]), "artifacts", artifact.path.replaceAll("\\", "/"));
      ensure(matrix.sources.some(source => source.root === "run" && source.role.startsWith("artifact:") && source.path === artifactPath
        && source.sha256 === artifact.sha256), "matrix claimed native artifact proof is missing or changed");
    }
  }
}

export function validateMatrixPlanProjection(matrix, { specify, protocolize, protocols, plans }) {
  const expectedCriteria = plans.flatMap(item => item.criteria.map(criterion => `${item.protocol_id}/${criterion.criterion_id}`));
  const effectiveStatements = new Map([...(specify.requirements ?? []), ...(specify.acceptance_criteria ?? [])].map(item => [item.id, item.statement]));
  for (const amendment of protocolize.obligation_amendments ?? []) effectiveStatements.set(amendment.target_id, amendment.replacement);
  const actualCriteria = matrix.criteria.map(item => `${item.protocol_id}/${item.criterion_id}`);
  ensure(unique(actualCriteria).length === actualCriteria.length && same(expectedCriteria, actualCriteria), "matrix criterion coverage differs");
  const expectedRequirements = plans.flatMap(item => {
    const member = protocolize.delivery.members[protocols.indexOf(item.protocol_id)].key;
    return (specify.requirements ?? []).filter(requirement => protocolize.obligation_ownership.some(owner => owner.obligation_id === requirement.id && owner.member_keys.includes(member)))
      .map(requirement => ({ protocol_id: item.protocol_id, id: requirement.id, statement: effectiveStatements.get(requirement.id), plan_items: (item.value.items ?? []).filter(planItem => planItem.requirement_refs?.includes(requirement.id)).map(planItem => ({ id: planItem.id, check_refs: sorted(unique(planItem.verification.check_refs)) })).sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0) }));
  });
  const actualRequirements = matrix.requirements.map(row => ({ ...row, plan_items: row.plan_items.map(({ work_ids, ...item }) => item) }));
  ensure(same(actualRequirements.map(row => `${row.protocol_id}/${row.id}`), expectedRequirements.map(row => `${row.protocol_id}/${row.id}`))
    && unique(actualRequirements.map(row => `${row.protocol_id}/${row.id}`)).length === actualRequirements.length, "matrix requirement coverage differs");
  for (const row of actualRequirements) ensure(matrixCanonical(row) === matrixCanonical(expectedRequirements.find(item => item.protocol_id === row.protocol_id && item.id === row.id)), "matrix requirement PLAN linkage differs");
  for (const row of matrix.criteria) {
    const criterion = plans.find(item => item.protocol_id === row.protocol_id).criteria.find(item => item.criterion_id === row.criterion_id);
    ensure(row.statement === effectiveStatements.get(row.criterion_id) && row.gate === (criterion.gate ?? null)
      && same(row.check_refs, criterion.check_refs ?? []) && same(row.checks.map(item => item.id), criterion.check_refs ?? [])
      && unique(row.checks.map(item => item.id)).length === row.checks.length
      && matrixCanonical(row.declaration) === matrixCanonical(criterion), "matrix criterion declaration differs");
    for (const check of row.checks) {
      ensure(check.canonical_ref === `${row.protocol_id}/${check.id}`, "matrix criterion binding identity differs");
      const declaration = plans.find(item => item.protocol_id === row.protocol_id).value.checks?.find(item => item.id === check.id);
      ensure(declaration && matrixCanonical(check.declaration) === matrixCanonical({ ...declaration, canonical_ref: check.canonical_ref }), "matrix check declaration differs from accepted PLAN");
    }
  }
}
