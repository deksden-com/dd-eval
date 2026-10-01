import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { validateVerificationMatrix, verificationMatrixFingerprint, validateVerificationMatrixAuthority } from "./case-acceptance.mjs";
import { lstat, realpath } from "node:fs/promises";

function fail(message, code) { throw Object.assign(new Error(message), { code }); }
// Matches dd-flow's full_content engine checksum, excluding its relocatable manifest.
export async function engineArtifactDigest(root) {
  const files = [];
  async function collect(directory) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      if (entry.name === "engine.json") continue;
      const file = path.join(directory, entry.name);
      if (entry.isDirectory()) await collect(file);
      else if (entry.isFile()) files.push(path.relative(root, file));
    }
  }
  await collect(root);
  const hash = createHash("sha256");
  for (const file of files.sort()) { hash.update(file); hash.update("\0"); hash.update(await readFile(path.join(root, file))); hash.update("\0"); }
  return hash.digest("hex");
}
export async function verifyEngineArtifact(engine, root = engine?.snapshot_root) {
  const expected = engine?.integrity?.checksum ?? engine?.integrity_checksum;
  if (!root || !/^[a-f0-9]{64}$/.test(expected ?? "")) fail("Engine has no verifiable artifact identity", "engine_artifact_identity_missing");
  const actual = await engineArtifactDigest(root);
  if (actual !== expected) fail("Engine files differ from the declared artifact digest", "engine_artifact_mismatch");
  return actual;
}
export async function assertCheckpointEngine(inputCheckpoint, engine, policy = null) {
  const expected = inputCheckpoint?.value?.flow_pack?.engine;
  if (!/^[a-f0-9]{64}$/.test(expected?.artifact_sha256 ?? "")) fail("Input checkpoint has no engine artifact pin; create a new checkpoint before execution", "input_checkpoint_engine_pin_missing");
  if (engine?.package_version !== expected.version || engine?.engine_version !== expected.version || (engine?.integrity?.checksum ?? engine?.integrity_checksum) !== expected.artifact_sha256) fail("Runtime engine version or artifact differs from the input checkpoint", "input_checkpoint_engine_mismatch");
  await verifyEngineArtifact(engine);
  await assertVerificationMatrixQualification(inputCheckpoint, engine, policy);
}

/** V3 needs an exact offline publication proof, not a schema/semver capability guess. */
export async function assertVerificationMatrixQualification(inputCheckpoint, engine, policy, preparedReceipt = null) {
  if (policy?.checker !== "task-priority@3") return null;
  const ref = inputCheckpoint?.value?.flow_pack?.verification_matrix;
  const relative = value => typeof value === "string" && value && !path.isAbsolute(value) && !value.split(/[\\/]/).includes("..");
  if (ref?.contract !== "dd-flow/verification-matrix@1" || !relative(ref.file) || !/^[a-f0-9]{64}$/.test(ref.sha256 ?? "") || !/^[a-f0-9]{40}$/.test(ref.canon_commit ?? "")) fail("V3 checkpoint has no exact matrix publication qualification", "verification_matrix_qualification_missing");
  if (typeof inputCheckpoint.file !== "string" || !path.isAbsolute(inputCheckpoint.file)) fail("Matrix qualification has no owned checkpoint location", "verification_matrix_qualification_invalid");
  const owner = path.dirname(inputCheckpoint.file);
  const read = async name => {
    if (!relative(name)) fail("Matrix qualification path is not contained", "verification_matrix_qualification_invalid");
    const file = path.resolve(owner, name), root = await realpath(owner);
    const actual = await realpath(file);
    if (!actual.startsWith(root + path.sep) || (await lstat(file)).isSymbolicLink()) fail("Matrix qualification evidence escaped checkpoint ownership", "verification_matrix_qualification_invalid");
    return await readFile(file);
  };
  const bytes = preparedReceipt ?? await read(ref.file);
  if (createHash("sha256").update(bytes).digest("hex") !== ref.sha256) fail("Matrix qualification receipt checksum differs", "verification_matrix_qualification_invalid");
  const receipt = JSON.parse(bytes);
  const build = JSON.parse(await readFile(path.join(engine.snapshot_root, "dist", "build-info.json"), "utf8"));
  if (receipt.schema_id !== "dd-eval/verification-matrix-qualification@3" || receipt.coverage_contract !== "dd-flow/final-check-coverage@1" || receipt.status !== "passed"
    || receipt.contract !== ref.contract || receipt.engine_artifact_sha256 !== (engine.integrity?.checksum ?? engine.integrity_checksum)
    || receipt.flow_commit !== inputCheckpoint.value.flow_pack.commit || receipt.built_with_canon?.commit !== ref.canon_commit
    || receipt.built_with_canon?.commit !== build.built_with_canon?.commit || receipt.built_with_canon?.version !== build.built_with_canon?.version
    || receipt.built_with_canon?.version !== inputCheckpoint.value.flow_pack.memory_bank_version
    || !Array.isArray(receipt.packets) || !receipt.packets.length) fail("Matrix qualification belongs to another engine, flow pack or canon", "verification_matrix_qualification_invalid");
  const coverage = new Set();
  let final = false;
  let owningRun = null;
  const bindingBytes = await read(receipt.engine_binding?.path);
  if (createHash("sha256").update(bindingBytes).digest("hex") !== receipt.engine_binding?.sha256) fail("Qualified RUN engine binding checksum differs", "verification_matrix_qualification_invalid");
  const binding = JSON.parse(bindingBytes);
  if (binding.schema_id !== "dd-flow/run-engine-binding@1" || binding.engine?.integrity_checksum !== receipt.engine_artifact_sha256
    || !["package_name", "package_version", "engine_version"].every(key => typeof binding.engine?.[key] === "string" && binding.engine[key].length > 0)
    || binding.engine?.package_name !== engine.package_name || binding.engine?.package_version !== engine.package_version || binding.engine?.engine_version !== engine.engine_version) fail("Qualified RUN belongs to another engine", "verification_matrix_qualification_invalid");
  for (const packet of receipt.packets) {
    const files = {};
    for (const kind of ["run", "report", "json", "markdown"]) {
      const ref = packet[kind];
      const bytes = await read(ref?.path);
      if (createHash("sha256").update(bytes).digest("hex") !== ref.sha256) fail("Matrix qualification packet checksum differs", "verification_matrix_qualification_invalid");
      files[kind] = kind === "markdown" ? bytes.toString("utf8") : JSON.parse(bytes);
    }
    const matrix = validateVerificationMatrix(files.json), metadata = files.report.semantic?.verification_matrix;
    if (metadata?.coverage_contract !== receipt.coverage_contract) fail("Owning report has no final check coverage contract", "verification_matrix_qualification_invalid");
    const stage = files.run.stage_runs?.find(item => item.stage === matrix.header.stage);
    const identity = `${matrix.header.project_id}:${matrix.header.run_id}`;
    if (owningRun !== null && identity !== owningRun) fail("Matrix qualification combines unrelated RUN publications", "verification_matrix_qualification_invalid");
    owningRun = identity;
    if (files.run.final_check_coverage_contract !== receipt.coverage_contract || binding.run_id !== files.run.run_id || files.run.verification_matrix_contract !== ref.contract || matrix.header.run_id !== files.run.run_id
      || matrix.header.project_id !== files.run.project?.id || verificationMatrixFingerprint(matrix) !== matrix.header.source_fingerprint
      || matrix.header.stage_attempt !== stage?.attempt || stage?.status !== "done" || stage?.data_sha256 !== packet.report.sha256 || metadata?.contract !== ref.contract
      || metadata.source_fingerprint !== matrix.header.source_fingerprint || metadata.json?.sha256 !== packet.json.sha256
      || metadata.markdown?.sha256 !== packet.markdown.sha256 || matrix.header.role !== "output" || metadata.role !== matrix.header.role
      || metadata.completeness !== matrix.header.completeness || files.report.run_id !== matrix.header.run_id || files.report.stage !== matrix.header.stage
      || !["declared", "execution", "final"].includes(matrix.header.completeness)) fail("Matrix qualification does not prove an owning Stage publication", "verification_matrix_qualification_invalid");
    if (coverage.has(matrix.header.stage)) fail("Matrix qualification Stage coverage is ambiguous", "verification_matrix_qualification_invalid");
    coverage.add(matrix.header.stage);
    const proof = new Map(), sourceProofs = [];
    {
      if (!Array.isArray(packet.sources)) fail("Matrix qualification has no frozen source proof", "verification_matrix_qualification_invalid");
      const catalog = matrix.sources.map(source => JSON.stringify([source.role, source.root, source.path]));
      const declared = matrix.sources.map(source => JSON.stringify([source.root, source.path, source.sha256])).sort();
      const retained = packet.sources.map(source => JSON.stringify([source.root, source.source_path, source.sha256])).sort();
      if (new Set(catalog).size !== catalog.length || JSON.stringify(declared) !== JSON.stringify(retained)) fail("Final matrix qualification source coverage differs", "verification_matrix_qualification_invalid");
      for (const source of packet.sources) {
        const bytes = await read(source.path);
        const sha = createHash("sha256").update(bytes).digest("hex");
        if (sha !== source.sha256 || !matrix.sources.some(item => item.root === source.root && item.path === source.source_path && item.sha256 === sha)) fail("Final matrix qualification source checksum differs", "verification_matrix_qualification_invalid");
        proof.set(`${source.root}:${source.source_path}`, JSON.parse(bytes));
        sourceProofs.push({ root: source.root, path: source.source_path, sha256: sha, value: JSON.parse(bytes) });
      }
      try { validateVerificationMatrixAuthority(matrix, sourceProofs, files.report); }
      catch (error) { fail(`Matrix technical authority is invalid: ${error.message}`, "verification_matrix_qualification_invalid"); }
    }
    if (matrix.header.stage === "merge") {
      const gate = proof.get("run:07-merge/merge-gate.json"), accepted = proof.get("run:07-merge/merge-gate-acceptance.json"), merged = matrix.header.merge;
      const acceptanceSource = packet.sources.find(source => source.root === "run" && source.source_path === "07-merge/merge-gate-acceptance.json");
      if (matrix.header.completeness !== "final" || !merged || gate?.schema_id !== "dd-flow/merge-gate@2" || accepted?.schema_id !== "dd-flow/merge-gate-acceptance@2"
        || merged.acceptance_ref.root !== "run" || merged.acceptance_ref.path !== acceptanceSource?.source_path || merged.acceptance_ref.sha256 !== acceptanceSource?.sha256
        || gate.run_id !== matrix.header.run_id || accepted.run_id !== matrix.header.run_id || accepted.accepted_tree !== merged.accepted_tree || accepted.work_id !== merged.work_id
        || accepted.merge_request_id !== merged.merge_request_id || accepted.gate_hash !== merged.gate_hash || gate.gate_hash !== merged.gate_hash
        || accepted.profile_hash !== merged.profile_hash || gate.profile_hash !== merged.profile_hash || !Array.isArray(gate.checks) || !Array.isArray(accepted.receipts)) fail("Final matrix qualification MERGE authority differs", "verification_matrix_qualification_invalid");
      const hash = createHash("sha256").update(JSON.stringify({ checks: gate.checks, acceptance_refs: [...gate.acceptance_refs].sort() })).digest("hex");
      const expected = [...new Set([...gate.checks.map(item => item.canonical_ref ?? item.id), ...gate.acceptance_refs])].sort();
      const bound = accepted.receipts.flatMap(item => item.binding_refs ?? []).sort();
      if (hash !== gate.gate_hash || JSON.stringify(expected) !== JSON.stringify(bound) || !expected.length) fail("Final matrix qualification target bindings differ", "verification_matrix_qualification_invalid");
      for (const saved of accepted.receipts) {
        const actual = [...proof.values()].find(item => item.id === saved.id && item.scope === "aggregate");
        if (!actual || actual.status !== "passed" || actual.input_hash !== saved.input_hash || !actual.verification_epoch
          || JSON.stringify([...actual.check_refs].sort()) !== JSON.stringify([...saved.execution_refs].sort())) fail("Final matrix qualification target receipt is unproven", "verification_matrix_qualification_invalid");
      }
      const facts = new Map([...matrix.criteria.flatMap(item => item.checks), ...matrix.policy_checks].map(item => [item.canonical_ref, item]));
      for (const ref of expected) {
        const fact = facts.get(ref), saved = accepted.receipts.find(item => item.binding_refs.includes(ref));
        const native = [...proof.values()].find(item => item.id === saved?.id && item.scope === "aggregate");
        if (!fact || fact.disposition !== "retained" || fact.result?.status !== "passed" || fact.result.id !== native?.id
          || fact.result.input_hash !== native.input_hash || fact.result.verification_epoch !== native.verification_epoch
          || JSON.stringify([...fact.result.check_refs].sort()) !== JSON.stringify([...native.check_refs].sort())) fail("Final matrix qualification does not project its target bindings", "verification_matrix_qualification_invalid");
      }
      final = true;
    }
    for (const stage of ["plan-review", "code-review"]) {
      const setting = files.run.settings?.[stage.replace("-", "_")];
      if (receipt.skipped_stages?.includes(stage) && setting?.mode === "off" && typeof setting.reason === "string" && setting.reason.trim()) coverage.add(stage);
    }
  }
  if (!final || ["plan", "plan-review", "code", "code-review", "merge"].some(stage => !coverage.has(stage))) fail("Matrix qualification does not cover the full promised Stage cycle", "verification_matrix_qualification_invalid");
  return receipt;
}
