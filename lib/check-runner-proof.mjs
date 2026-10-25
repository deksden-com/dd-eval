import crypto from "node:crypto";
import path from "node:path";
import { isDeepStrictEqual, stripVTControlCharacters } from "node:util";
import { fileURLToPath } from "node:url";
export const RUNNER_PROOF_CONTRACT = "dd-flow/check-runner-proof@1";
function object(value) { return Boolean(value) && typeof value === "object" && !Array.isArray(value); }
function boundedString(value, bytes) { return typeof value === "string" && Buffer.byteLength(value) <= bytes; }
const validatedBrowserProofs = new WeakSet();
const unsupportedObservationContracts = new WeakSet();
const validatedNativeProofs = new WeakSet();
const validatedChildren = new WeakMap();
const validatedReports = new WeakMap();
const hash = (value) => typeof value === "string" && /^[a-f0-9]{64}$/.test(value);
const absoluteFile = (value) => typeof value === "string" && value.length > 0 && value.length <= 4096 && !value.includes("\0") && path.isAbsolute(value);
export function candidateAbsencesValid(value) { return Array.isArray(value) && value.length <= 64 && value.every(item => object(item) && absoluteFile(item.file) && item.path_state === "missing" && object(item.declaration) && absoluteFile(item.declaration.file) && hash(item.declaration.sha256)); }
function relativeProofPath(value) { return typeof value === "string" && value.length > 0 && Buffer.byteLength(value) <= 4096 && !path.isAbsolute(value) && !value.includes("\\") && value.split("/").every(part => part !== "" && part !== "." && part !== ".."); }
function proofArtifact(value) { return object(value) && relativeProofPath(value.relative_path) && typeof value.sha256 === "string" && /^[a-f0-9]{64}$/.test(value.sha256); }
function browserProofShape(proof) {
    const attempt = proof.attempt, step = proof.step;
    return (proof.observation_contract === undefined || proof.observation_contract === "dd-tasks/browser-observation@2" && object(proof.target) && [proof.target.page_id, proof.target.context_id].every(value => boundedString(value, 256) && Boolean(value)) && Number.isSafeInteger(proof.window_epoch) && Number(proof.window_epoch) > 0)
        && proof.native_code === "PLAYWRIGHT_ACTION_INACTIVITY" && object(attempt) && boundedString(attempt.invocation_id, 4096) && boundedString(attempt.test_id, 4096) && Boolean(attempt.test_id)
        && [attempt.retry, attempt.repeat_each_index, attempt.worker_index].every(value => Number.isSafeInteger(value) && value >= 0)
        && object(step) && boundedString(step.id, 4096) && Boolean(step.id) && ["pw:api", "expect"].includes(String(step.category)) && step.file === proof.file && Number.isSafeInteger(step.line) && step.line > 0
        && proofArtifact(proof.worker_snapshot) && proofArtifact(proof.native_result);
}
export function runnerFailureValid(value) {
    if (!object(value) || typeof value.category !== "string" || !["assertion", "tooling", "unclassified"].includes(value.category))
        return false;
    if (value.diagnostic_artifact !== undefined && !proofArtifact(value.diagnostic_artifact))
        return false;
    for (const key of ["code", "message", "file", "test_id", "native_code", "classification_reason"])
        if (value[key] !== undefined && !boundedString(value[key], 4096))
            return false;
    if (value.stack !== undefined && !boundedString(value.stack, 16384) || value.origin !== undefined && (typeof value.origin !== "string" || !["candidate", "tooling", "unknown"].includes(value.origin)) || value.phase !== undefined && (typeof value.phase !== "string" || !["test", "setup", "teardown", "collection", "runner"].includes(value.phase)))
        return false;
    if (value.repair_evidence !== undefined) {
        const proof = value.repair_evidence;
        if (object(proof) && proof.rule === "candidate_test_runtime_error")
            return ["TypeError", "ReferenceError", "Error"].includes(String(proof.exception_type)) && (proof.exception_type !== "Error" || proof.phase === "test")
                && absoluteFile(proof.file) && hash(proof.file_sha256) && ["test", "setup", "collection"].includes(String(proof.phase))
                && [proof.line, proof.column].every(value => Number.isSafeInteger(value) && Number(value) > 0) && proofArtifact(proof.native_artifact);
        if (object(proof) && proof.rule === "candidate_migration_sql")
            return proof.native_code === "42601" && absoluteFile(proof.file) && hash(proof.file_sha256)
                && boundedString(proof.operation_id, 4096) && Boolean(proof.operation_id) && proofArtifact(proof.native_artifact) && object(proof.world)
                && boundedString(proof.world.invocation_id, 4096) && typeof proof.world.world_id === "string" && /^[a-f0-9]{32}$/.test(proof.world.world_id)
                && boundedString(proof.world.role, 128) && Boolean(proof.world.role) && hash(proof.world.migrations_sha256) && proof.world.phase === "migrating" && proof.world.setup_completed === false;
        if (object(proof) && proof.rule === "candidate_tool_diagnostic")
            return absoluteFile(proof.file) && proofArtifact(proof.native_artifact)
                && object(proof.tool) && { biome: "2.5.6", typescript: "5.9.3", docs: "1", "value-absence": "1" }[String(proof.tool.name)] === proof.tool.version
                && object(proof.step) && boundedString(proof.step.id, 256) && Boolean(proof.step.id) && Number.isSafeInteger(proof.step.ordinal) && proof.step.ordinal >= 0 && hash(proof.step.command_sha256)
                && boundedString(proof.diagnostic_code, 256) && (proof.tool.name === "biome" ? ["format", "assist/source/organizeImports"].includes(String(proof.diagnostic_code)) || /^lint\/[\w/-]+$/.test(String(proof.diagnostic_code)) : proof.tool.name === "typescript" ? /^TS\d+$/.test(String(proof.diagnostic_code)) : proof.tool.name === "docs" ? ["required_path_missing", "docs_contract"].includes(String(proof.diagnostic_code)) : proof.diagnostic_code === "value_absence")
                && (proof.path_state === "present" && hash(proof.file_sha256) || proof.path_state === "missing" && proof.tool.name === "docs" && proof.diagnostic_code === "required_path_missing" && proof.file_sha256 === null && object(proof.declaration) && absoluteFile(proof.declaration.file) && hash(proof.declaration.sha256));
        if (!object(proof) || !boundedString(proof.rule, 128) || !boundedString(proof.native_code, 128) || !boundedString(proof.file, 4096) || !object(proof.world))
            return false;
        const world = proof.world;
        if (world.schema_id !== "dd-tasks/test-world-ready@1" || !boundedString(world.invocation_id, 4096) || typeof world.world_id !== "string" || !/^[a-f0-9]{32}$/.test(world.world_id) || typeof world.migrations_sha256 !== "string" || !/^[a-f0-9]{64}$/.test(world.migrations_sha256) || world.ready !== true || world.setup_completed !== true || !boundedString(world.role, 128) || !world.role)
            return false;
        if (proof.rule === "candidate_browser_action_inactivity" && !browserProofShape(proof))
            return false;
        if (!["candidate_sql_integrity", "candidate_browser_action_inactivity"].includes(String(proof.rule)))
            return false;
    }
    return true;
}
function readBytes(context, relative, limit) {
    if (!relativeProofPath(relative))
        throw new Error("Unsafe proof path");
    const bytes = context.readArtifact(relative);
    if (!Buffer.isBuffer(bytes) || bytes.length > limit)
        throw new Error("Evidence is not bounded bytes");
    context.consumed += bytes.length;
    if (context.consumed > 128 * 1024 * 1024)
        throw Object.assign(new Error("Proof byte budget exceeded"), { code: "proof_budget_exceeded" });
    return bytes;
}
function readProofArtifact(root, ref, context, limit = 2 * 1024 * 1024) {
    const bytes = readBytes(context, path.posix.join(root, ref.relative_path), limit);
    if (crypto.createHash("sha256").update(bytes).digest("hex") !== ref.sha256)
        throw new Error("Proof hash differs");
    const value = JSON.parse(bytes.toString("utf8"));
    if (!object(value))
        throw new Error("Invalid proof object");
    return value;
}
function matches(actual, expected) { return object(actual) && Object.entries(expected).every(([key, value]) => actual[key] === value); }
function validateBrowserArtifacts(root, proof, binding, context) {
    const snapshot = readProofArtifact(root, proof.worker_snapshot, context), native = readProofArtifact(root, proof.native_result, context);
    if (proof.observation_contract !== undefined && (proof.observation_contract !== "dd-tasks/browser-observation@2" || snapshot.observation_contract !== proof.observation_contract || native.observation_contract !== proof.observation_contract
        || !isDeepStrictEqual(snapshot.target, proof.target) || !isDeepStrictEqual(native.target, proof.target) || snapshot.window_epoch !== proof.window_epoch || native.window_epoch !== proof.window_epoch))
        return false;
    if (!Array.isArray(native.errors) || native.errors.length < 1 || native.errors.length > 64 || native.errors.some(error => !boundedString(error, 4096) || !/^(?:Error: )?(?:[A-Za-z][\w.]*: )?Test timeout of [1-9]\d*ms exceeded\.(?:\nCall log:[\s\S]*)?$/.test(stripVTControlCharacters(String(error)))))
        return false;
    if (!matches(snapshot.binding, binding) || !matches(native.binding, binding) || !matches(snapshot.attempt, proof.attempt) || !matches(native.attempt, proof.attempt)
        || !matches(snapshot.step, proof.step) || !matches(native.step, proof.step) || !matches(snapshot.world, proof.world) || proof.world.invocation_id !== binding.invocation_id
        || native.status !== "timedOut" || native.phase !== "test" || native.file !== proof.file || snapshot.phase !== "body" || snapshot.observation_gap !== false || !matches(snapshot.browser, { connected: true, page_closed: false, crashed: false })
        || !matches(snapshot.world_health, { api: true, web: true, db: true }))
        return false;
    const quiet = snapshot.quiet_ms, last = Date.parse(String(snapshot.last_progress_at)), deadline = Date.parse(String(snapshot.deadline_at)), observed = Date.parse(String(snapshot.observed_at)), health = Date.parse(String(snapshot.health_observed_at)), ended = Date.parse(String(native.ended_at));
    return Number.isSafeInteger(quiet) && quiet > 0 && [last, deadline, observed, health, ended].every(Number.isFinite) && Math.abs(deadline - last - quiet) <= 2 && observed >= last && observed <= deadline && health <= observed && health >= last && deadline - health <= Math.min(1000, quiet / 4) && ended >= deadline && ended <= Date.now() && ended - deadline <= 5000;
}
export function runnerProofArtifacts(evidence) {
    return [...new Set([...(evidence?.failures ?? []).flatMap(failure => {
                const child = validatedChildren.get(failure);
                if (child && failure.child_evidence)
                    return [failure.child_evidence.report.relative_path, ...runnerProofArtifacts(child.evidence).map(file => path.posix.join(path.posix.dirname(failure.child_evidence.report.relative_path), file))];
                const proof = failure.repair_evidence;
                return [...(failure.diagnostic_artifact ? [failure.diagnostic_artifact.relative_path] : []), ...(proof?.rule === "candidate_browser_action_inactivity" ? [proof.worker_snapshot.relative_path, proof.native_result.relative_path] : proof && "native_artifact" in proof ? [proof.native_artifact.relative_path] : [])];
            }), ...(evidence ? validatedReports.get(evidence) ?? [] : []).flatMap(child => [child.report.relative_path, ...runnerProofArtifacts(child.evidence).map(file => path.posix.join(path.posix.dirname(child.report.relative_path), file))])])];
}
function diagnostic(context, value) {
    // Diagnostics are locators, never another copy of untrusted report content.
    if (context.diagnostics.length >= 64 || context.bytes + Buffer.byteLength(JSON.stringify(value)) > 32 * 1024 - 64) {
        context.truncated = true;
        return;
    }
    context.diagnostics.push(value);
    context.bytes += Buffer.byteLength(JSON.stringify(value));
}
export function validateRunnerProof(contract, binding, readArtifact) {
    const context = { diagnostics: [], bytes: 0, consumed: 0, truncated: false, readArtifact };
    const evidence = readRunnerEvidenceInternal("", contract, binding, 0, { reports: 0 }, context, "");
    return { contract: RUNNER_PROOF_CONTRACT, evidence, required_artifacts: evidence ? runnerProofArtifacts(evidence) : [], diagnostics: context.diagnostics, ...(context.truncated ? { diagnostics_truncated: true } : {}) };
}
function readRunnerEvidenceInternal(root, contract, binding, depth, budget, context, prefix) {
    const report = relativeProofPath(contract.path) ? path.posix.join(prefix, contract.path) : "<invalid-report-path>";
    const count = context.diagnostics.length;
    let accepted = false;
    let failureReason = "invalid_shape";
    const invalid = () => { if (context.diagnostics.length === count)
        diagnostic(context, { reason: failureReason, report }); return null; };
    try {
        if (!relativeProofPath(contract.path))
            return invalid();
        if (depth > 4 || ++budget.reports > 64) {
            failureReason = "proof_budget_exceeded";
            return invalid();
        }
        const bytes = readBytes(context, path.posix.join(root, contract.path), 1024 * 1024);
        failureReason = "invalid_json";
        const evidence = JSON.parse(bytes.toString("utf8"));
        failureReason = "invalid_shape";
        if (!object(evidence))
            return invalid();
        if (!["dd-flow/check-runner-evidence@1", "dd-flow/check-runner-evidence@2"].includes(contract.schema_id))
            return null;
        const partial = evidence.failure_projection;
        if (partial !== undefined && (evidence.schema_id !== "dd-flow/check-runner-evidence@2" || !object(partial) || partial.state !== "partial" || !["count_bound", "byte_bound", "interrupt"].includes(partial.reason)
            || ![partial.represented, partial.omitted].every(value => Number.isSafeInteger(value) && value >= 0)))
            return null;
        if (evidence.schema_id !== contract.schema_id) {
            diagnostic(context, { reason: "invalid_shape", report, expected: contract.schema_id, observed: ["dd-flow/check-runner-evidence@1", "dd-flow/check-runner-evidence@2"].includes(evidence.schema_id) ? evidence.schema_id : "unsupported" });
            return null;
        }
        if (!evidence.binding || Object.entries(binding).some(([key, value]) => evidence.binding[key] !== value)) {
            diagnostic(context, { reason: "binding_mismatch", report });
            return null;
        }
        if (typeof evidence.runner?.name !== "string" || !evidence.runner.name || typeof evidence.runner.version !== "string" || !evidence.runner.version || typeof evidence.completed !== "boolean" || !evidence.counts
            || ![evidence.counts.passed, evidence.counts.failed, evidence.counts.skipped].every(n => Number.isSafeInteger(n) && n >= 0)
            || !Array.isArray(evidence.failures) || evidence.failures.length > 64 || evidence.failures.some(f => !runnerFailureValid(f))
            || !partial && evidence.counts.failed > evidence.failures.length || evidence.observation_unknown !== undefined && typeof evidence.observation_unknown !== "boolean")
            return null;
        const children = new Map();
        const consumed = new Map();
        if (evidence.steps !== undefined) {
            if (!Array.isArray(evidence.steps) || evidence.steps.length > 64)
                return null;
            const ids = new Set(), invocations = new Set();
            let stopped = false;
            for (const [ordinal, step] of evidence.steps.entries()) {
                if (!step || !boundedString(step.id, 256) || !step.id || ids.has(step.id) || step.ordinal !== ordinal || !hash(step.command_sha256) || !["passed", "failed", "unreached"].includes(step.state))
                    return null;
                ids.add(step.id);
                if (step.state === "unreached") {
                    if (!stopped || step.binding !== undefined || step.report !== undefined || step.exit_code !== undefined)
                        return null;
                    continue;
                }
                if (stopped)
                    return null;
                if (step.state === "failed")
                    stopped = true;
                if (!step.binding || !proofArtifact(step.report) || !Number.isSafeInteger(step.exit_code) || step.state === "passed" && step.exit_code !== 0 || step.state === "failed" && step.exit_code === 0 || invocations.has(step.binding.invocation_id) || step.binding.invocation_id === binding.invocation_id)
                    return null;
                if (step.binding.invocation_id !== `${binding.invocation_id}:step:${step.id}` || step.binding.check_id !== `${binding.check_id}/${step.id}` || step.binding.verification_epoch !== binding.verification_epoch || step.binding.input_hash !== crypto.createHash("sha256").update(JSON.stringify([binding.input_hash, step.command_sha256])).digest("hex"))
                    return null;
                if (crypto.createHash("sha256").update(step.binding.command).digest("hex") !== step.command_sha256)
                    return null;
                invocations.add(step.binding.invocation_id);
                failureReason = "artifact_mismatch";
                readProofArtifact(root, step.report, context, 1024 * 1024);
                failureReason = "invalid_shape";
                const child = readRunnerEvidenceInternal(path.posix.join(root, path.posix.dirname(step.report.relative_path)), { schema_id: contract.schema_id, path: path.basename(step.report.relative_path) }, step.binding, depth + 1, budget, context, path.posix.join(prefix, path.posix.dirname(step.report.relative_path)));
                if (!child || step.state === "passed" && (child.counts.failed !== 0 || child.failures.length !== 0) || step.state === "failed" && !child.failures.length && child.completed && !child.observation_unknown)
                    return null;
                if (!child.completed || child.observation_unknown)
                    stopped = true;
                children.set(step.id, child);
            }
            for (const key of ["passed", "failed", "skipped"])
                if (evidence.counts[key] !== [...children.values()].reduce((total, child) => total + child.counts[key], 0))
                    return null;
        }
        for (const failure of evidence.failures) {
            failureReason = "artifact_mismatch";
            if (failure.child_evidence) {
                const ref = failure.child_evidence, step = evidence.steps?.find(item => item.id === ref.step_id), child = children.get(ref.step_id);
                if (!step || !child || !isDeepStrictEqual(ref.binding, step.binding) || !isDeepStrictEqual(ref.report, step.report))
                    return null;
                const original = { ...failure };
                delete original.child_evidence;
                const used = consumed.get(child) ?? new Set();
                consumed.set(child, used);
                const index = child.failures.findIndex((item, index) => { const native = { ...item }; delete native.child_evidence; return !used.has(index) && isDeepStrictEqual(native, original); });
                if (index < 0)
                    return null;
                used.add(index);
                const matched = child.failures[index];
                if (!matched.child_evidence && matched.repair_evidence?.rule === "candidate_tool_diagnostic" && !isDeepStrictEqual(matched.repair_evidence.step, { id: step.id, ordinal: step.ordinal, command_sha256: step.command_sha256 }))
                    return null;
                validatedChildren.set(failure, { failure: matched, evidence: child });
                continue;
            }
            if (failure.diagnostic_artifact && !matches(readProofArtifact(root, failure.diagnostic_artifact, context, 2 * 1024 * 1024).binding, binding))
                return null;
            const proof = failure.repair_evidence;
            if (proof?.rule === "candidate_migration_sql" || proof?.rule === "candidate_tool_diagnostic" || proof?.rule === "candidate_test_runtime_error") {
                const native = readProofArtifact(root, proof.native_artifact, context, 2 * 1024 * 1024), facts = Object.fromEntries(Object.entries(proof).filter(([key]) => key !== "native_artifact"));
                if (!isDeepStrictEqual(native.binding, binding) || Object.entries(facts).some(([key, value]) => !isDeepStrictEqual(native[key], value)))
                    return null;
                if (proof.rule === "candidate_test_runtime_error") {
                    failureReason = "attribution_unproven";
                    if (evidence.schema_id !== "dd-flow/check-runner-evidence@2" || native.executing_file !== proof.file || native.exception_name !== proof.exception_type
                        || !isDeepStrictEqual(native.top_frame, { file: proof.file, line: proof.line, column: proof.column }) || !boundedString(native.stack, 16384) || !String(native.stack).startsWith(`${proof.exception_type}:`))
                        return null;
                    const firstFrame = String(native.stack).split("\n").find(line => /^\s*at\s/.test(line));
                    const frame = firstFrame?.match(/^\s*at\s+(?:.*?\()?((?:file:\/\/)?\/[^\n]+):(\d+):(\d+)\)?$/);
                    if (!frame || (frame[1].startsWith("file://") ? fileURLToPath(frame[1]) : frame[1]) !== proof.file || Number(frame[2]) !== proof.line || Number(frame[3]) !== proof.column)
                        return null;
                }
                validatedNativeProofs.add(proof);
            }
            if (proof?.rule === "candidate_browser_action_inactivity") {
                if (proof.observation_contract === undefined && evidence.schema_id === "dd-flow/check-runner-evidence@1") {
                    // Legacy diagnostics remain readable; they do not prove the new window/target guarantee.
                    if (!validateBrowserArtifacts(root, proof, binding, context))
                        return null;
                    evidence.completed = false;
                    unsupportedObservationContracts.add(evidence);
                    continue;
                }
                if (proof.observation_contract !== "dd-tasks/browser-observation@2" || !validateBrowserArtifacts(root, proof, binding, context))
                    return null;
                validatedBrowserProofs.add(proof);
            }
        }
        failureReason = "invalid_shape";
        const represented = [...consumed.values()].reduce((total, used) => total + used.size, 0), childFailures = [...children.values()].reduce((total, child) => total + child.failures.length, 0);
        if (partial) {
            if (children.size ? partial.represented !== represented || partial.omitted !== childFailures - represented : partial.represented !== evidence.failures.filter(failure => failure.code !== "report_truncated").length)
                return null;
            evidence.completed = false;
        }
        else if (represented !== childFailures)
            return null;
        // Valid but incomplete native observation is diagnostic evidence, not a
        // malformed schema. Preserve the primary failure and references through
        // every composite, including a parent that incorrectly claims completion.
        if ([...children.values()].some(child => !child.completed || child.observation_unknown)) {
            evidence.completed = false;
            if ([...children.values()].some(child => unsupportedObservationContracts.has(child)))
                unsupportedObservationContracts.add(evidence);
            if (evidence.schema_id === "dd-flow/check-runner-evidence@1" && [...children.values()].some(child => !child.completed && !unsupportedObservationContracts.has(child)) || [...children.values()].some(child => child.observation_unknown))
                evidence.observation_unknown = true;
        }
        validatedReports.set(evidence, (evidence.steps ?? []).flatMap(step => step.report && children.has(step.id) ? [{ report: step.report, evidence: children.get(step.id) }] : []));
        if (unsupportedObservationContracts.has(evidence))
            diagnostic(context, { reason: "unsupported_observation_contract", report, expected: "dd-tasks/browser-observation@2", observed: "legacy" });
        else if (!evidence.completed || evidence.observation_unknown)
            diagnostic(context, { reason: "observation_incomplete", report });
        for (const failure of evidence.failures)
            if (failure.origin === "unknown" || failure.category === "unclassified" && !failure.repair_evidence) {
                diagnostic(context, { reason: "attribution_unproven", report });
                break;
            }
        accepted = true;
        return evidence;
    }
    catch (error) {
        if (error.code === "ENOENT")
            failureReason = "missing";
        else if (error.code === "proof_budget_exceeded")
            failureReason = "proof_budget_exceeded";
        return invalid();
    }
    finally {
        if (!accepted && context.diagnostics.length === count)
            diagnostic(context, { reason: failureReason, report });
    }
}
export function runnerEvidencePass(evidence) { return Boolean(evidence?.completed && !evidence.failure_projection && !evidence.observation_unknown && evidence.counts.failed === 0 && evidence.failures.length === 0); }
export const validatedRunnerChild = (failure) => validatedChildren.get(failure);
export const hasValidatedNativeProof = (proof) => validatedNativeProofs.has(proof);
export const hasValidatedBrowserProof = (proof) => validatedBrowserProofs.has(proof);
export const hasUnsupportedObservation = (evidence) => unsupportedObservationContracts.has(evidence);
