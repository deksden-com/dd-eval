import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, mkdir, readFile, writeFile, rm, readdir, access, symlink } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import os from "node:os";
import path from "node:path";
import { assertCheckpointEngine, assertVerificationMatrixQualification, engineArtifactDigest, verifyEngineArtifact } from "../lib/engine-admission.mjs";
import { verificationMatrixFingerprint, validateVerificationMatrixAuthority } from "../lib/case-acceptance.mjs";

test("frozen native contracts preserve normalized inputs, resolved prompts and cross-gate exact-input reuse", () => {
  const hash = value => createHash("sha256").update(value).digest("hex");
  const inputs = ["./", "src/", "./src", "src\\nested"];
  const plan = { protocol_id: "PRT-001", plan_id: "PLAN-001", revision: 1, items: [], acceptance: [], checks: ["code", "merge"].map((run_at, index) => ({ id: `CHK-${index}`, command: "printf '{run_id}'", purpose: "proof", run_at, availability: "available", reuse: "deterministic", inputs })) };
  const planHash = hash(JSON.stringify(plan)), batch = { sources: [{ protocol_id: plan.protocol_id, plan_id: plan.plan_id, revision: 1, sha256: planHash }] }, batchHash = hash(JSON.stringify(batch));
  const checks = plan.checks.map(check => ({ ...check, canonical_ref: `${plan.protocol_id}/${check.id}` }));
  const gate = { checks, acceptance_refs: [], profile_hash: null };
  const fingerprint = "e".repeat(64), native = { id: "RCP-native", status: "passed", scope: "aggregate", exit_code: 0, profile_hash: null, command: "printf 'RUN-1'", gate: "code", input_hash: "bound-input", verification_epoch: hash(`code\0${fingerprint}`), before_fingerprint: fingerprint, after_fingerprint: fingerprint, mutation_paths: [], inputs: [".", "src", "src/nested"], resources: { ports: {} }, artifacts: [], required_artifacts: [], finished_at: "2026-10-01T00:00:00Z", check_refs: ["legacy-execution-ref"] };
  const accepted = { receipts: [{ id: native.id, input_hash: native.input_hash, execution_refs: native.check_refs, binding_refs: checks.map(check => check.canonical_ref) }] };
  const values = [
    ["specify", "01-specify/specify.json", { requirements: [], acceptance_criteria: [] }],
    ["protocolize", "02-protocolize/protocolize-result.json", { delivery: { members: [{ key: "main" }] }, obligation_ownership: [] }],
    ["protocolize_report", "02-protocolize/stage-report.json", { semantic: { acceptance: [plan.protocol_id] } }],
    ["plan:PRT-001", `07-merge/verification/sources/${planHash}/plan.json`, plan],
    ["code_work_batch", `07-merge/verification/sources/${batchHash}/code-work-batch.json`, batch],
    ["batch", "03-plan/code-work-batch.json", batch], ["gate", "07-merge/merge-gate.json", gate], ["acceptance", "07-merge/merge-gate-acceptance.json", accepted],
    ["receipt:PRT-001/CHK-0", "07-merge/checks/RCP-native/receipt.json", native],
    ["completion:PRT-001/CHK-0", "07-merge/checks/RCP-native/completion.json", { exit_code: 0, finished_at: native.finished_at }],
    ...["baseline", "source", "target"].map(role => [`check_profile_${role}`, `07-merge/check-profile-${role}.json`, { schema_id: "dd-flow/retained-check-profile@1", profile: null, profile_sha256: null, profile_bytes: null }])
  ];
  const proofs = values.map(([role, relative, value]) => ({ role, root: "run", path: relative, sha256: hash(JSON.stringify(value)), value }));
  const matrix = { schema_id: "dd-flow/verification-matrix@1", header: { project_id: "PRJ-1", run_id: "RUN-1", stage: "merge", stage_attempt: "try-001", role: "output", completeness: "final", source_fingerprint: "" }, sources: proofs.map(({ value, ...source }) => source), requirements: [], criteria: [], policy_checks: checks.map(check => ({ id: check.id, canonical_ref: check.canonical_ref, declaration: check, result: native, disposition: "retained" })) };
  matrix.header.source_fingerprint = verificationMatrixFingerprint(matrix);
  assert.doesNotThrow(() => validateVerificationMatrixAuthority(matrix, proofs));
});

test("checkpoint admission verifies bytes, rejects same-version substitutions and requires a new pin", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "engine-admission-"));
  try {
    await writeFile(path.join(root, "cli.js"), "original artifact");
    const digest = await engineArtifactDigest(root);
    const checkpoint = { value: { flow_pack: { engine: { version: "1.0.0", artifact_sha256: digest } } } };
    const engine = { package_version: "1.0.0", engine_version: "1.0.0", snapshot_root: root, integrity: { checksum: digest } };
    await assertCheckpointEngine(checkpoint, engine);
    await writeFile(path.join(root, "engine.json"), JSON.stringify({ snapshot_root: "/relocated" }));
    assert.equal(await verifyEngineArtifact(engine), digest);
    await writeFile(path.join(root, "cli.js"), "different artifact, same version");
    await assert.rejects(assertCheckpointEngine(checkpoint, engine), { code: "engine_artifact_mismatch" });
    const substituted = { ...engine, integrity: { checksum: await engineArtifactDigest(root) } };
    await assert.rejects(assertCheckpointEngine(checkpoint, substituted), { code: "input_checkpoint_engine_mismatch" });
    delete checkpoint.value.flow_pack.engine.artifact_sha256;
    await assert.rejects(assertCheckpointEngine(checkpoint, substituted), { code: "input_checkpoint_engine_pin_missing" });
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("engine digest rejects symlink files and directories instead of omitting their executable bytes", async t => {
  const root = await mkdtemp(path.join(os.tmpdir(), "engine-symlink-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const engine = path.join(root, "engine"); await mkdir(engine);
  await writeFile(path.join(engine, "cli.js"), "original artifact");
  const checksum = await engineArtifactDigest(engine);
  // The runtime-home alias is outside the snapshot content and remains valid.
  const alias = path.join(root, "engine-alias"); await symlink(engine, alias);
  assert.equal(await engineArtifactDigest(alias), checksum);
  const external = path.join(root, "foreign.mjs"); await writeFile(external, "unhashed executable");
  for (const [target, type] of [[external, "file"], [path.join(engine, "cli.js"), "file"], [root, "dir"], [engine, "dir"]]) {
    const link = path.join(engine, "unhashed"); await symlink(target, link, type);
    await assert.rejects(engineArtifactDigest(engine), { code: "engine_artifact_symlink" });
    await assert.rejects(verifyEngineArtifact({ integrity: { checksum } }, engine), { code: "engine_artifact_symlink" });
    await rm(link);
    assert.equal(await engineArtifactDigest(engine), checksum);
  }
});

test("V3 exact qualification validates owning packet bytes and cannot be bypassed by direct admission", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "matrix-admission-"));
  const hash = bytes => createHash("sha256").update(bytes).digest("hex");
  const policy = { checker: "task-priority@3" };
  try {
    const put = async (file, value) => { const bytes = typeof value === "string" ? value : JSON.stringify(value); await writeFile(path.join(root, file), bytes); return { path: file, sha256: hash(bytes) }; };
    const canon = { version: "4.1.2", commit: "c".repeat(40) };
    await mkdir(path.join(root, "dist"));
    await put("dist/build-info.json", { built_with_canon: canon });
    const matrix = { schema_id: "dd-flow/verification-matrix@1", header: { project_id: "PRJ-1", run_id: "RUN-1", stage: "plan", stage_attempt: "try-001", role: "output", completeness: "declared", source_fingerprint: "1".repeat(64) }, sources: [], requirements: [], criteria: [], policy_checks: [] };
    const planned = { id: "CHK-1", command: "@check/new", definition: "true", provided_by: "ITEM-1", run_at: "work", purpose: "planned semantic", availability: "planned" };
    const itemOnly = { id: "CHK-MERGE", command: "true", run_at: "merge", purpose: "item-only semantic", availability: "available" };
    const baselineProfile = { schema_id: "dd-flow/code-check-profile@6", aliases: { "@check/quality": "true" }, require_alias_for: {}, mandatory_by_gate: { merge: ["@check/quality"] } };
    const sourceProfile = { ...baselineProfile, aliases: { ...baselineProfile.aliases, "@check/new": "true" } };
    const policyCheck = { id: "POLICY/merge/quality", canonical_ref: "POLICY/merge/quality", source: "project_policy", command: "@check/quality", purpose: "Mandatory project merge gate.", run_at: "merge", availability: "available" };
    const plan = { protocol_id: "PRT-001", plan_id: "PLAN-001", revision: 1, items: [], checks: [planned, itemOnly], acceptance: [] }, planHash = hash(JSON.stringify(plan));
    const batch = { sources: [{ protocol_id: plan.protocol_id, plan_id: plan.plan_id, revision: 1, sha256: planHash }] }, batchHash = hash(JSON.stringify(batch));
    const baseProofs = [];
    for (const [source_path, value, role] of [
      ["01-specify/specify.json", { requirements: [], acceptance_criteria: [] }, "specify"],
      ["02-protocolize/protocolize-result.json", { delivery: { members: [{ key: "main" }] }, obligation_ownership: [] }, "protocolize"],
      ["02-protocolize/stage-report.json", { semantic: { acceptance: ["PRT-001"] } }, "protocolize_report"],
      [`03-plan/verification/sources/${planHash}/plan.json`, plan, "plan:PRT-001"],
      [`03-plan/verification/sources/${batchHash}/code-work-batch.json`, batch, "code_work_batch"]
    ]) baseProofs.push({ ...await put(`base-${baseProofs.length}.json`, value), root: "run", source_path, role });
    matrix.sources = baseProofs.map(ref => ({ role: ref.role, root: ref.root, path: ref.source_path, sha256: ref.sha256 }));
    matrix.header.source_fingerprint = verificationMatrixFingerprint(matrix);
    const json = await put("matrix.json", matrix), markdown = await put("matrix.md", "Generated view\n");
    const runValue = { project: { id: "PRJ-1" }, run_id: "RUN-1", verification_matrix_contract: matrix.schema_id, final_check_coverage_contract: "dd-flow/final-check-coverage@1", stage_runs: ["plan", "plan-review", "code", "code-review", "merge"].map(stage => ({ stage, attempt: "try-001", status: "done" })) };
    const run = await put("run.json", runValue);
    const report = await put("report.json", { run_id: "RUN-1", stage: "plan", semantic: { batch_checksum: batchHash, verification_matrix: { contract: matrix.schema_id, role: "output", completeness: "declared", source_fingerprint: matrix.header.source_fingerprint, json, markdown } } });
    const engineBinding = await put("engine-binding.json", { schema_id: "dd-flow/run-engine-binding@1", run_id: "RUN-1", engine: { package_name: "dd-flow", package_version: "test", engine_version: "test", integrity_checksum: "a".repeat(64) } });
    const receipt = { schema_id: "dd-eval/verification-matrix-qualification@3", coverage_contract: "dd-flow/final-check-coverage@1", status: "passed", contract: matrix.schema_id, engine_artifact_sha256: "a".repeat(64), engine_binding: engineBinding, flow_commit: "b".repeat(40), built_with_canon: canon, packets: [{ run, report, json, markdown, sources: baseProofs }] };
    const qualification = await put("qualification.json", receipt);
    const checkpoint = { file: path.join(root, "checkpoint.json"), value: { flow_pack: { commit: receipt.flow_commit, memory_bank_version: canon.version, verification_matrix: { contract: matrix.schema_id, file: qualification.path, sha256: qualification.sha256, canon_commit: canon.commit } } } };
    const engine = { package_name: "dd-flow", package_version: "test", engine_version: "test", snapshot_root: root, integrity: { checksum: receipt.engine_artifact_sha256 } };
    await assert.rejects(assertVerificationMatrixQualification(checkpoint, engine, policy), { code: "verification_matrix_qualification_invalid" }, "one PLAN output cannot qualify the full promised cycle");
    const gate = { schema_id: "dd-flow/merge-gate@2", run_id: "RUN-1", checks: [planned, itemOnly].map(check => ({ ...check, canonical_ref: `PRT-001/${check.id}` })).concat(policyCheck), acceptance_refs: [], profile_hash: hash(JSON.stringify({ ...baselineProfile, ports_by_alias: {}, inputs_by_alias: {} })) };
    gate.gate_hash = hash(JSON.stringify({ checks: gate.checks, acceptance_refs: [] }));
    const fingerprint = "e".repeat(64);
    const artifactBytes = "non-JSON native proof\u0000\u0001";
    const native = { id: "WRK-1/RCP-1", scope: "aggregate", status: "passed", exit_code: 0, profile_hash: gate.profile_hash, command: "true", gate: "merge", input_hash: "target-input", verification_epoch: hash(`merge\0${fingerprint}`), before_fingerprint: fingerprint, after_fingerprint: fingerprint, mutation_paths: [], inputs: [], resources: { ports: {} }, required_artifacts: [], artifacts: [{ path: "proof.bin", sha256: hash(artifactBytes) }], finished_at: "2026-10-01T00:00:00Z", check_refs: gate.checks.map(check => check.canonical_ref) };
    const accepted = { schema_id: "dd-flow/merge-gate-acceptance@2", run_id: "RUN-1", accepted_tree: "tree", work_id: "WRK-1", merge_request_id: "MRG-1", profile_hash: gate.profile_hash, gate_hash: gate.gate_hash, receipts: [{ id: native.id, input_hash: native.input_hash, execution_refs: native.check_refs, binding_refs: native.check_refs }] };
    const refs = [];
    for (const [source_path, value] of [["07-merge/merge-gate.json", gate], ["07-merge/merge-gate-acceptance.json", accepted], ["07-merge/checks/RCP-1/receipt.json", native], ["03-plan/code-work-batch.json", batch], ["07-merge/checks/RCP-1/completion.json", { exit_code: 0, finished_at: native.finished_at }]]) {
      const ref = await put(`proof-${refs.length}.json`, value); refs.push({ ...ref, root: "run", source_path, ...(source_path.endsWith("/receipt.json") ? { role: "receipt:PRT-001/CHK-1" } : source_path.endsWith("/completion.json") ? { role: "completion:PRT-001/CHK-1" } : {}) });
    }
    refs.push(...baseProofs);
    refs.push({ ...await put("proof.bin", artifactBytes), root: "run", source_path: "07-merge/checks/RCP-1/artifacts/proof.bin", role: "artifact:PRT-001/CHK-1:proof.bin" });
    for (const role of ["baseline", "source", "target"]) {
      const profile = role === "baseline" ? baselineProfile : sourceProfile;
      refs.push({ ...await put(`profile-${role}.json`, { schema_id: "dd-flow/retained-check-profile@1", profile, profile_sha256: hash(JSON.stringify(profile)), profile_bytes: JSON.stringify(profile) }), root: "run", source_path: `07-merge/check-profile-${role}.json`, role: `check_profile_${role}` });
    }
    for (const stage of ["plan-review", "code", "code-review", "merge"]) {
      const value = { ...matrix, header: { ...matrix.header, stage, completeness: stage === "merge" ? "final" : "execution" }, sources: matrix.sources };
      if (stage === "merge") {
        value.header.merge = { merge_request_id: accepted.merge_request_id, work_id: accepted.work_id, gate_hash: gate.gate_hash, profile_hash: gate.profile_hash, accepted_tree: "tree", acceptance_ref: { root: "run", path: "07-merge/merge-gate-acceptance.json", sha256: refs[1].sha256 } };
        value.sources = refs.map(ref => ({ role: ref.role ?? ref.source_path, root: "run", path: ref.source_path, sha256: ref.sha256 }));
        value.policy_checks = gate.checks.map(check => ({ id: check.id, canonical_ref: check.canonical_ref, declaration: check, result: native, disposition: "retained" }));
      }
      value.header.source_fingerprint = verificationMatrixFingerprint(value);
      const json = await put(`${stage}.json`, value), markdown = await put(`${stage}.md`, "Generated\n");
      const report = await put(`${stage}-report.json`, { run_id: "RUN-1", stage, semantic: { ...(stage === "plan-review" ? { plan_review: { final_batch_checksum: batchHash } } : {}), verification_matrix: { contract: matrix.schema_id, role: "output", completeness: value.header.completeness, source_fingerprint: value.header.source_fingerprint, json, markdown } } });
      receipt.packets.push({ run, report, json, markdown, sources: stage === "merge" ? refs : baseProofs });
    }
    const reseal = async () => {
      for (const packet of receipt.packets) { const report = JSON.parse(await readFile(path.join(root, packet.report.path))); report.semantic.verification_matrix.coverage_contract = receipt.coverage_contract; packet.report = await put(packet.report.path, report); runValue.stage_runs.find(item => item.stage === report.stage).data_sha256 = packet.report.sha256; }
      const boundRun = await put("run.json", runValue); for (const packet of receipt.packets) packet.run = boundRun;
      checkpoint.value.flow_pack.verification_matrix.sha256 = (await put("qualification.json", receipt)).sha256;
    };
    await reseal();
    await assertVerificationMatrixQualification(checkpoint, engine, policy);
    for (const change of [{ data_sha256: "f".repeat(64) }, { status: "running" }]) {
      const unacceptedRun = structuredClone(runValue); Object.assign(unacceptedRun.stage_runs[0], change);
      const ref = await put("run.json", unacceptedRun); for (const packet of receipt.packets) packet.run = ref;
      checkpoint.value.flow_pack.verification_matrix.sha256 = (await put("qualification.json", receipt)).sha256;
      await assert.rejects(assertVerificationMatrixQualification(checkpoint, engine, policy), { code: "verification_matrix_qualification_invalid" }, "self-consistent matrix/report must still belong to an accepted Stage publication");
      await reseal();
    }
    // Exercise the actual producer CLI publication boundary without a provider.
    const producerEngine = path.join(root, "producer-engine"), producerRun = path.join(root, "producer-run");
    await mkdir(path.join(producerEngine, "dist"), { recursive: true }); await mkdir(producerRun);
    await writeFile(path.join(producerEngine, "dist/build-info.json"), JSON.stringify({ built_with_canon: canon }));
    const selected = { ...engine, snapshot_root: producerEngine, integrity: { checksum: await engineArtifactDigest(producerEngine) } };
    const engineFile = path.join(producerEngine, "engine.json"); await writeFile(engineFile, JSON.stringify(selected));
    await writeFile(path.join(producerRun, "run.json"), JSON.stringify(runValue));
    await writeFile(path.join(producerRun, "engine-binding.json"), JSON.stringify({ schema_id: "dd-flow/run-engine-binding@1", run_id: runValue.run_id, engine: { ...selected, integrity_checksum: selected.integrity.checksum } }));
    const directories = { plan: "03-plan", "plan-review": "04-plan-review", code: "05-code", "code-review": "06-code-review", merge: "07-merge" };
    for (const packet of receipt.packets) {
      const reportValue = JSON.parse(await readFile(path.join(root, packet.report.path)));
      await mkdir(path.join(producerRun, directories[reportValue.stage]), { recursive: true });
      await writeFile(path.join(producerRun, directories[reportValue.stage], "stage-report.json"), JSON.stringify(reportValue));
      for (const kind of ["json", "markdown"]) await writeFile(path.join(producerRun, packet[kind].path), await readFile(path.join(root, packet[kind].path)));
      for (const source of packet.sources) { const file = path.join(producerRun, source.source_path); await mkdir(path.dirname(file), { recursive: true }); await writeFile(file, await readFile(path.join(root, source.path))); }
    }
    const qualify = output => promisify(execFile)(process.execPath, [path.resolve("bin/qualify-verification-matrix.mjs"), "--run-home", producerRun, "--engine-json", engineFile, "--flow-commit", receipt.flow_commit, "--output", output]);
    const output = path.join(root, "atomic-qualification.json"); await qualify(output);
    const publishedQualification = JSON.parse(await readFile(output));
    assert.equal(publishedQualification.schema_id, "dd-eval/verification-matrix-qualification@3");
    const publishedArtifact = publishedQualification.packets.at(-1).sources.find(source => source.source_path.endsWith("/artifacts/proof.bin"));
    assert.deepEqual(await readFile(path.join(root, publishedArtifact.path)), Buffer.from(artifactBytes), "producer qualification retains non-JSON native bytes exactly");
    const blocked = path.join(root, "atomic-blocked.json"); await writeFile(blocked, "existing pin\n");
    await assert.rejects(qualify(blocked), error => error.stderr.includes("EEXIST"));
    assert.equal(await readFile(blocked, "utf8"), "existing pin\n");
    assert.equal((await readdir(root)).some(file => file.startsWith("atomic-blocked.json.") && file.endsWith(".tmp")), false);
    const missingMatrix = structuredClone(matrix); missingMatrix.sources = missingMatrix.sources.filter(source => source.role !== "code_work_batch");
    missingMatrix.header.source_fingerprint = verificationMatrixFingerprint(missingMatrix);
    const matrixBytes = Buffer.from(JSON.stringify(missingMatrix)); await writeFile(path.join(producerRun, json.path), matrixBytes);
    const missingReport = JSON.parse(await readFile(path.join(root, report.path))); missingReport.semantic.verification_matrix.source_fingerprint = missingMatrix.header.source_fingerprint; missingReport.semantic.verification_matrix.json.sha256 = hash(matrixBytes);
    await writeFile(path.join(producerRun, "03-plan/stage-report.json"), JSON.stringify(missingReport));
    const invalidOutput = path.join(root, "invalid-qualification.json"); await assert.rejects(qualify(invalidOutput));
    await assert.rejects(access(invalidOutput), { code: "ENOENT" }, "invalid authority cannot publish a passed qualification");
    const originalSchema = receipt.schema_id;
    receipt.schema_id = "dd-eval/verification-matrix-qualification@1"; await reseal();
    await assert.rejects(assertVerificationMatrixQualification(checkpoint, engine, policy), { code: "verification_matrix_qualification_invalid" }, "old self-consistency checkpoint cannot admit the stronger contract");
    receipt.schema_id = originalSchema; await reseal();
    const boundEngine = JSON.parse(await readFile(path.join(root, engineBinding.path), "utf8"));
    receipt.engine_binding = await put(engineBinding.path, { ...boundEngine, engine: { ...boundEngine.engine, integrity_checksum: "f".repeat(64) } }); await reseal();
    await assert.rejects(assertVerificationMatrixQualification(checkpoint, engine, policy), { code: "verification_matrix_qualification_invalid" }, "supplied engine cannot hide a foreign RUN engine binding");
    receipt.engine_binding = await put(engineBinding.path, boundEngine); await reseal();
    const planPacket = receipt.packets[0], originalPlanMatrix = JSON.parse(await readFile(path.join(root, planPacket.json.path), "utf8")), originalPlanReport = JSON.parse(await readFile(path.join(root, planPacket.report.path), "utf8"));
    for (const source of originalPlanMatrix.sources) {
      const changed = structuredClone(originalPlanMatrix); changed.sources = changed.sources.filter(item => item.path !== source.path);
      changed.header.source_fingerprint = verificationMatrixFingerprint(changed);
      planPacket.json = await put(planPacket.json.path, changed);
      const changedReport = structuredClone(originalPlanReport); changedReport.semantic.verification_matrix.json = planPacket.json; changedReport.semantic.verification_matrix.source_fingerprint = changed.header.source_fingerprint;
      planPacket.report = await put(planPacket.report.path, changedReport);
      planPacket.sources = baseProofs.filter(item => item.source_path !== source.path); await reseal();
      await assert.rejects(assertVerificationMatrixQualification(checkpoint, engine, policy), { code: "verification_matrix_qualification_invalid" }, "missing mandatory source cannot pass with rehashed consistent catalog and existing physical bytes");
    }
    const forgedProjection = structuredClone(originalPlanMatrix);
    forgedProjection.requirements = [{ protocol_id: "PRT-001", id: "R-FAKE", statement: "invented", plan_items: [] }];
    forgedProjection.header.source_fingerprint = verificationMatrixFingerprint(forgedProjection);
    planPacket.json = await put(planPacket.json.path, forgedProjection); planPacket.sources = baseProofs;
    const forgedReport = structuredClone(originalPlanReport); forgedReport.semantic.verification_matrix.json = planPacket.json; forgedReport.semantic.verification_matrix.source_fingerprint = forgedProjection.header.source_fingerprint;
    planPacket.report = await put(planPacket.report.path, forgedReport); await reseal();
    await assert.rejects(assertVerificationMatrixQualification(checkpoint, engine, policy), { code: "verification_matrix_qualification_invalid" }, "whole intact source catalog cannot excuse forged projection");
    planPacket.json = await put(planPacket.json.path, originalPlanMatrix); planPacket.report = await put(planPacket.report.path, originalPlanReport); await reseal();
    checkpoint.value.flow_pack.verification_matrix.canon_commit = "d".repeat(40);
    await assert.rejects(assertVerificationMatrixQualification(checkpoint, engine, policy), { code: "verification_matrix_qualification_invalid" }, "canon identity is independent of synced flow pack identity");
    checkpoint.value.flow_pack.verification_matrix.canon_commit = canon.commit;
    checkpoint.value.flow_pack.commit = canon.commit;
    await assert.rejects(assertVerificationMatrixQualification(checkpoint, engine, policy), { code: "verification_matrix_qualification_invalid" }, "unrelated repository SHAs cannot satisfy the flow-pack pin");
    checkpoint.value.flow_pack.commit = receipt.flow_commit;
    const mutateReport = async (packet, change) => {
      const original = JSON.parse(await readFile(path.join(root, packet.report.path), "utf8"));
      packet.report = await put(packet.report.path, change(structuredClone(original))); await reseal();
      await assert.rejects(assertVerificationMatrixQualification(checkpoint, engine, policy), { code: "verification_matrix_qualification_invalid" });
      packet.report = await put(packet.report.path, original); await reseal();
    };
    await mutateReport(receipt.packets[0], value => { value.semantic.verification_matrix.role = "input"; return value; });
    await mutateReport(receipt.packets[0], value => { value.run_id = "RUN-foreign"; return value; });
    await mutateReport(receipt.packets[0], value => { delete value.semantic.batch_checksum; return value; });
    await mutateReport(receipt.packets[1], value => { delete value.semantic.plan_review.final_batch_checksum; return value; });
    const mergePacket = receipt.packets.at(-1);
    const mergeValue = JSON.parse(await readFile(path.join(root, mergePacket.json.path), "utf8"));
    // A gate and its projected matrix cannot jointly define their own completeness.
    const exactProofs = await Promise.all(mergePacket.sources.map(async source => ({ root: source.root, path: source.source_path, sha256: source.sha256, value: source.role?.startsWith("artifact:") ? {} : JSON.parse(await readFile(path.join(root, source.path))) })));
    const changedMetadata = structuredClone(mergeValue), metadataProofs = structuredClone(exactProofs);
    for (const role of ["source", "target"]) {
      const proof = metadataProofs.find(item => item.path === `07-merge/check-profile-${role}.json`);
      proof.value.profile.inputs_by_alias = { "@check/quality": ["./src"] };
      proof.value.profile_bytes = JSON.stringify(proof.value.profile); proof.value.profile_sha256 = hash(proof.value.profile_bytes);
      proof.sha256 = hash(JSON.stringify(proof.value)); changedMetadata.sources.find(item => item.path === proof.path).sha256 = proof.sha256;
    }
    changedMetadata.header.source_fingerprint = verificationMatrixFingerprint(changedMetadata);
    assert.throws(() => validateVerificationMatrixAuthority(changedMetadata, metadataProofs), /existing baseline alias metadata/);
    for (const ref of native.check_refs) {
      const reduced = structuredClone(mergeValue), proofs = structuredClone(exactProofs);
      const gateProof = proofs.find(source => source.path === "07-merge/merge-gate.json");
      gateProof.value.checks = gateProof.value.checks.filter(check => check.canonical_ref !== ref);
      gateProof.sha256 = hash(JSON.stringify(gateProof.value));
      reduced.sources.find(source => source.path === gateProof.path).sha256 = gateProof.sha256;
      reduced.policy_checks = reduced.policy_checks.filter(check => check.canonical_ref !== ref);
      reduced.header.source_fingerprint = verificationMatrixFingerprint(reduced);
      assert.throws(() => validateVerificationMatrixAuthority(reduced, proofs), /omits or adds accepted due checks/, `coordinated omission of ${ref}`);
    }
    const withoutBindings = { ...mergeValue, policy_checks: [] };
    withoutBindings.header = { ...withoutBindings.header, source_fingerprint: verificationMatrixFingerprint(withoutBindings) };
    mergePacket.json = await put(mergePacket.json.path, withoutBindings);
    const mergeReport = JSON.parse(await readFile(path.join(root, mergePacket.report.path), "utf8"));
    mergeReport.semantic.verification_matrix.json.sha256 = mergePacket.json.sha256;
    mergeReport.semantic.verification_matrix.source_fingerprint = withoutBindings.header.source_fingerprint;
    mergePacket.report = await put(mergePacket.report.path, mergeReport); await reseal();
    await assert.rejects(assertVerificationMatrixQualification(checkpoint, engine, policy), { code: "verification_matrix_qualification_invalid" }, "a final packet cannot omit its actual target binding");
    mergePacket.json = await put(mergePacket.json.path, mergeValue);
    mergeReport.semantic.verification_matrix.json.sha256 = mergePacket.json.sha256;
    mergeReport.semantic.verification_matrix.source_fingerprint = mergeValue.header.source_fingerprint;
    mergePacket.report = await put(mergePacket.report.path, mergeReport); await reseal();
    const mutateMerge = async (change, rejects = true) => {
      const value = change(structuredClone(mergeValue));
      value.header.source_fingerprint = verificationMatrixFingerprint(value);
      mergePacket.json = await put(mergePacket.json.path, value);
      mergeReport.semantic.verification_matrix.json.sha256 = mergePacket.json.sha256;
      mergeReport.semantic.verification_matrix.source_fingerprint = value.header.source_fingerprint;
      mergePacket.report = await put(mergePacket.report.path, mergeReport); await reseal();
      if (rejects) await assert.rejects(assertVerificationMatrixQualification(checkpoint, engine, policy), { code: "verification_matrix_qualification_invalid" });
      else await assertVerificationMatrixQualification(checkpoint, engine, policy);
    };
    for (const changed of [{ root: "workspace" }, { path: "foreign-acceptance.json" }, { sha256: "f".repeat(64) }]) {
      await mutateMerge(value => { Object.assign(value.header.merge.acceptance_ref, changed); return value; });
    }
    await mutateMerge(value => value, false);
    const artifactSource = mergePacket.sources.find(source => source.role?.startsWith("artifact:"));
    await rm(path.join(root, artifactSource.path));
    await assert.rejects(assertVerificationMatrixQualification(checkpoint, engine, policy), /ENOENT/, "missing claimed binary bytes cannot qualify");
    await put(artifactSource.path, "corrupt claimed binary");
    await assert.rejects(assertVerificationMatrixQualification(checkpoint, engine, policy), /checksum differs/, "corrupt claimed binary bytes cannot qualify");
    Object.assign(artifactSource, await put(artifactSource.path, "coordinated corrupt binary"));
    await mutateMerge(value => { value.sources.find(source => source.path === artifactSource.source_path).sha256 = artifactSource.sha256; return value; });
    Object.assign(artifactSource, await put(artifactSource.path, artifactBytes));
    await mutateMerge(value => { value.sources.find(source => source.path === artifactSource.source_path).sha256 = artifactSource.sha256; return value; }, false);
    const withArtifactSources = mergePacket.sources;
    mergePacket.sources = withArtifactSources.filter(source => !source.role?.startsWith("artifact:"));
    await mutateMerge(value => { value.sources = value.sources.filter(source => !source.role.startsWith("artifact:")); return value; });
    mergePacket.sources = withArtifactSources; await mutateMerge(value => value, false);
    const nativeSource = mergePacket.sources.find(source => source.source_path.endsWith("/receipt.json"));
    const mutateNative = async (change, rejects = true) => {
      const changed = { ...native, ...change };
      Object.assign(nativeSource, await put(nativeSource.path, changed));
      await mutateMerge(value => {
        for (const source of value.sources) if (source.path === nativeSource.source_path) source.sha256 = nativeSource.sha256;
        for (const fact of value.policy_checks) fact.result = changed;
        return value;
      }, rejects);
    };
    for (const change of [{ exit_code: 99 }, { profile_hash: "foreign-profile" }, { command: "false" }, { after_fingerprint: "f".repeat(64) }, { verification_epoch: "foreign-epoch" }, { inputs: ["different-input"] }, { resources: { ports: { api: 1234 } } }, { required_artifacts: ["missing-proof.json"] }, { mutation_paths: ["src/changed"] }, { artifacts: [{ path: "../receipt.json", sha256: hash(artifactBytes) }] }]) {
      await mutateNative(change); await mutateNative({}, false);
    }
    const completionSource = mergePacket.sources.find(source => source.source_path.endsWith("/completion.json"));
    const completionProof = { exit_code: 0, finished_at: native.finished_at };
    for (const changed of [{ exit_code: 1, finished_at: native.finished_at }, { exit_code: 0 }]) {
      Object.assign(completionSource, await put(completionSource.path, changed));
      await mutateMerge(value => { value.sources.find(source => source.path === completionSource.source_path).sha256 = completionSource.sha256; return value; });
      Object.assign(completionSource, await put(completionSource.path, completionProof));
      await mutateMerge(value => { value.sources.find(source => source.path === completionSource.source_path).sha256 = completionSource.sha256; return value; }, false);
    }
    await mutateMerge(value => { value.policy_checks[0].declaration = { ...value.policy_checks[0].declaration, purpose: "forged declaration outside accepted gate" }; return value; });
    await mutateMerge(value => { value.policy_checks.push({ ...value.policy_checks[0], id: "CHK-EXTRA", canonical_ref: "CHK-EXTRA" }); return value; });
    await mutateMerge(value => value, false);
    const originalSources = mergePacket.sources;
    for (const altered of [originalSources.slice(0, -1), [...originalSources, originalSources[0]], [...originalSources.slice(0, -1), { ...originalSources.at(-1), source_path: "foreign-source.json" }]]) {
      mergePacket.sources = altered; await reseal();
      await assert.rejects(assertVerificationMatrixQualification(checkpoint, engine, policy), { code: "verification_matrix_qualification_invalid" }, "missing, extra or foreign source evidence cannot qualify");
    }
    // One native receipt may legitimately prove several canonical refs.
    mergePacket.sources = [...originalSources, originalSources[2]];
    await mutateMerge(value => { value.sources.push({ ...value.sources[2], role: "receipt:another-canonical-ref" }); return value; }, false);
    await mutateMerge(value => { value.sources.push({ ...value.sources[2] }); return value; });
    mergePacket.sources = originalSources;
    await mutateMerge(value => value, false);
    const codeReview = receipt.packets.splice(receipt.packets.findIndex(packet => packet.json.path === "code-review.json"), 1)[0];
    receipt.skipped_stages = ["code-review"]; await reseal();
    await assert.rejects(assertVerificationMatrixQualification(checkpoint, engine, policy), { code: "verification_matrix_qualification_invalid" }, "coverage skip needs a retained execution setting");
    runValue.settings = { code_review: { mode: "off", reason: "explicit fixture execution profile" } };
    const skippedRun = await put("run.json", runValue);
    for (const packet of receipt.packets) packet.run = skippedRun;
    await reseal(); await assertVerificationMatrixQualification(checkpoint, engine, policy);
    runValue.settings.code_review.reason = "";
    const noReasonRun = await put("run.json", runValue);
    for (const packet of receipt.packets) packet.run = noReasonRun;
    await reseal();
    await assert.rejects(assertVerificationMatrixQualification(checkpoint, engine, policy), { code: "verification_matrix_qualification_invalid" }, "off without a retained reason cannot prove coverage");
    delete runValue.settings; const completeRun = await put("run.json", runValue);
    receipt.packets.push(codeReview); delete receipt.skipped_stages;
    for (const packet of receipt.packets) packet.run = completeRun;
    await reseal(); await assertVerificationMatrixQualification(checkpoint, engine, policy);
    await put("matrix.md", "Changed bytes\n");
    await assert.rejects(assertVerificationMatrixQualification(checkpoint, engine, policy), { code: "verification_matrix_qualification_invalid" });
    delete checkpoint.value.flow_pack.verification_matrix;
    await assert.rejects(assertVerificationMatrixQualification(checkpoint, engine, policy), { code: "verification_matrix_qualification_missing" });
    assert.equal(await assertVerificationMatrixQualification(checkpoint, engine, { checker: "task-priority@2" }), null);
  } finally { await rm(root, { recursive: true, force: true }); }
});
