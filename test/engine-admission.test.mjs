import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, mkdir, readFile, writeFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { assertCheckpointEngine, assertVerificationMatrixQualification, engineArtifactDigest, verifyEngineArtifact } from "../lib/engine-admission.mjs";
import { verificationMatrixFingerprint } from "../lib/case-acceptance.mjs";

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
    matrix.header.source_fingerprint = verificationMatrixFingerprint(matrix);
    const json = await put("matrix.json", matrix), markdown = await put("matrix.md", "Generated view\n");
    const runValue = { project: { id: "PRJ-1" }, run_id: "RUN-1", verification_matrix_contract: matrix.schema_id, stage_runs: ["plan", "plan-review", "code", "code-review", "merge"].map(stage => ({ stage, attempt: "try-001" })) };
    const run = await put("run.json", runValue);
    const report = await put("report.json", { run_id: "RUN-1", stage: "plan", semantic: { verification_matrix: { contract: matrix.schema_id, role: "output", completeness: "declared", source_fingerprint: matrix.header.source_fingerprint, json, markdown } } });
    const receipt = { schema_id: "dd-eval/verification-matrix-qualification@1", status: "passed", contract: matrix.schema_id, engine_artifact_sha256: "a".repeat(64), flow_commit: "b".repeat(40), built_with_canon: canon, packets: [{ run, report, json, markdown }] };
    const qualification = await put("qualification.json", receipt);
    const checkpoint = { file: path.join(root, "checkpoint.json"), value: { flow_pack: { commit: receipt.flow_commit, memory_bank_version: canon.version, verification_matrix: { contract: matrix.schema_id, file: qualification.path, sha256: qualification.sha256, canon_commit: canon.commit } } } };
    const engine = { snapshot_root: root, integrity: { checksum: receipt.engine_artifact_sha256 } };
    await assert.rejects(assertVerificationMatrixQualification(checkpoint, engine, policy), { code: "verification_matrix_qualification_invalid" }, "one PLAN output cannot qualify the full promised cycle");
    const gate = { schema_id: "dd-flow/merge-gate@2", run_id: "RUN-1", checks: [{ id: "CHK-1" }], acceptance_refs: [], profile_hash: null };
    gate.gate_hash = hash(JSON.stringify({ checks: gate.checks, acceptance_refs: [] }));
    const native = { id: "WRK-1/RCP-1", scope: "aggregate", status: "passed", input_hash: "target-input", verification_epoch: "epoch", check_refs: ["CHK-1"] };
    const accepted = { schema_id: "dd-flow/merge-gate-acceptance@2", run_id: "RUN-1", accepted_tree: "tree", work_id: "WRK-1", merge_request_id: "MRG-1", profile_hash: null, gate_hash: gate.gate_hash, receipts: [{ id: native.id, input_hash: native.input_hash, execution_refs: native.check_refs, binding_refs: native.check_refs }] };
    const refs = [];
    for (const [source_path, value] of [["07-merge/merge-gate.json", gate], ["07-merge/merge-gate-acceptance.json", accepted], ["07-merge/checks/RCP-1/receipt.json", native]]) {
      const ref = await put(`proof-${refs.length}.json`, value); refs.push({ ...ref, root: "run", source_path });
    }
    for (const stage of ["plan-review", "code", "code-review", "merge"]) {
      const value = { ...matrix, header: { ...matrix.header, stage, completeness: stage === "merge" ? "final" : "execution" }, sources: [] };
      if (stage === "merge") {
        value.header.merge = { merge_request_id: accepted.merge_request_id, work_id: accepted.work_id, gate_hash: gate.gate_hash, profile_hash: null, accepted_tree: "tree", acceptance_ref: { root: "run", path: "07-merge/merge-gate-acceptance.json", sha256: refs[1].sha256 } };
        value.sources = refs.map(ref => ({ role: ref.source_path, root: "run", path: ref.source_path, sha256: ref.sha256 }));
        value.policy_checks = [{ id: "CHK-1", canonical_ref: "CHK-1", declaration: gate.checks[0], result: native, disposition: "retained" }];
      }
      value.header.source_fingerprint = verificationMatrixFingerprint(value);
      const json = await put(`${stage}.json`, value), markdown = await put(`${stage}.md`, "Generated\n");
      const report = await put(`${stage}-report.json`, { run_id: "RUN-1", stage, semantic: { verification_matrix: { contract: matrix.schema_id, role: "output", completeness: value.header.completeness, source_fingerprint: value.header.source_fingerprint, json, markdown } } });
      receipt.packets.push({ run, report, json, markdown, ...(stage === "merge" ? { sources: refs } : {}) });
    }
    const reseal = async () => { checkpoint.value.flow_pack.verification_matrix.sha256 = (await put("qualification.json", receipt)).sha256; };
    await reseal();
    await assertVerificationMatrixQualification(checkpoint, engine, policy);
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
    const mergePacket = receipt.packets.at(-1);
    const mergeValue = JSON.parse(await readFile(path.join(root, mergePacket.json.path), "utf8"));
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
