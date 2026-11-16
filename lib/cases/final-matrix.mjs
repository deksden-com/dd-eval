import path from "node:path";
import { loadRunnerProofSources } from "../runner-proof-sources.mjs";
import { validateVerificationMatrixAuthority } from "../verification-matrix-checks.mjs";
import { validateVerificationMatrix, isVerificationMatrixTextSource, verificationMatrixFingerprint } from "../verification-matrix-schema.mjs";
import { validateFrozenAcceptedIntent } from "./frozen-authority.mjs";
import { ownedFile } from "./frozen-evidence.mjs";

const ensure = (condition, message) => { if (!condition) throw new Error(message); };
const parseJson = file => JSON.parse(file.text);
const unique = values => [...new Set(values)];
const same = (left, right) => JSON.stringify([...left].sort()) === JSON.stringify([...right].sort());

/** Verify the final matrix against retained sources, receipts and accepted gate. */
export async function verifyFinalMatrix({ snapshot, runtime, data, read, consumed, mergeReport, accepted, plans, byBinding, verifiedReceipts }) {
  const index = await read(`${runtime}/run.json`);
  ensure(index.verification_matrix_contract === "dd-flow/verification-matrix@1", "RUN has no retained verification matrix contract");
  ensure(index.final_check_coverage_contract === "dd-flow/final-check-coverage@1", "RUN has no final check coverage contract");
  const binding = mergeReport.semantic?.verification_matrix;
  ensure(binding?.coverage_contract === index.final_check_coverage_contract, "MERGE report has no bound final check coverage contract");
  ensure(binding?.contract === index.verification_matrix_contract && binding.role === "output" && binding.completeness === "final", "MERGE final matrix binding is unavailable");
  const json = await ownedFile(snapshot, `${runtime}/${binding.json?.path}`);
  const markdown = await ownedFile(snapshot, `${runtime}/${binding.markdown?.path}`);
  ensure(json.sha256 === binding.json.sha256 && markdown.sha256 === binding.markdown.sha256, "MERGE matrix packet checksum differs");
  consumed.push(json, markdown);
  const matrix = validateVerificationMatrix(parseJson(json));
  const intentDatabase = await validateFrozenAcceptedIntent(snapshot, data, index, matrix);
  if (intentDatabase) consumed.push(intentDatabase);
  const header = matrix.header;
  const stage = index.stage_runs?.find(item => item.stage === "merge");
  ensure(header.project_id === data.project_id && header.run_id === data.run_id && header.stage === "merge"
    && header.role === "output" && header.completeness === "final" && header.source_fingerprint === binding.source_fingerprint
    && header.stage_attempt === (stage?.attempt ?? stage?.stage_attempt), "MERGE matrix owning Stage identity differs");
  const merged = header.merge;
  ensure(merged?.merge_request_id === accepted.merge_request_id && merged.work_id === accepted.work_id
    && merged.gate_hash === accepted.gate_hash && merged.profile_hash === accepted.profile_hash
    && merged.accepted_tree === accepted.accepted_tree, "MERGE matrix accepted tree or gate differs");
  const sourceKeys = matrix.sources.map(source => `${source.role}:${source.root}:${source.path}`);
  ensure(unique(sourceKeys).length === sourceKeys.length, "matrix source catalog is ambiguous");
  const sourceMap = new Map();
  const sourceProofs = [];
  for (const source of matrix.sources) {
    const relative = source.root === "run" ? `${runtime}/${source.path}` : `workspace/${source.path}`;
    const file = await ownedFile(snapshot, relative); consumed.push(file);
    ensure(file.sha256 === source.sha256, "matrix source checksum differs");
    sourceMap.set(`${source.root}:${source.path}`, source.sha256);
    const textSource = isVerificationMatrixTextSource(source);
    sourceProofs.push({ ...source, value: source.role.startsWith("artifact:") ? {} : textSource ? { text: file.text } : parseJson(file) });
  }
  const runnerBytes = await loadRunnerProofSources(matrix, sourceProofs, async source => {
    const file = await ownedFile(snapshot, `${runtime}/${source.path}`);
    return Buffer.from(file.text);
  });
  validateVerificationMatrixAuthority(matrix, sourceProofs, mergeReport, runnerBytes);
  ensure(merged.acceptance_ref.root === "run" && merged.acceptance_ref.path === "07-merge/merge-gate-acceptance.json"
    && sourceMap.get(`run:${merged.acceptance_ref.path}`) === merged.acceptance_ref.sha256, "matrix final acceptance source is unavailable");
  for (const relative of ["01-specify/specify.json", "02-protocolize/protocolize-result.json", "02-protocolize/stage-report.json", "03-plan/code-work-batch.json", "07-merge/merge-gate.json"]) {
    const file = await ownedFile(snapshot, `${runtime}/${relative}`);
    ensure(sourceMap.get(`run:${relative}`) === file.sha256, "matrix retained authority source is unavailable");
  }
  for (const item of plans) ensure(matrix.sources.some(source => source.role === `plan:${item.protocol_id}` && source.sha256 === item.source.sha256),
    "matrix accepted PLAN source differs");
  const assertCheck = check => {
    if (check.declaration.run_at === "release") { ensure(check.disposition === "not_due" && check.result === null, "not-due check claims a target result"); return; }
    const saved = byBinding.get(check.canonical_ref);
    ensure(saved, `matrix check has no accepted target binding: ${check.canonical_ref}`);
    const proof = verifiedReceipts.get(saved.id);
    ensure(check.disposition === "retained" && check.result?.id === saved.id && check.result.status === proof.receipt.status
      && check.result.input_hash === saved.input_hash && check.result.verification_epoch === proof.receipt.verification_epoch
      && same(check.result.check_refs ?? [], proof.receipt.check_refs), "matrix check result differs from frozen receipt");
    ensure([...sourceMap].some(([key, hash]) => key === `run:${path.relative(runtime, proof.frozen.path)}` && hash === proof.frozen.sha256), "matrix receipt source is unavailable");
  };
  for (const row of matrix.criteria) {
    for (const check of row.checks) {
      assertCheck(check);
    }
  }
  for (const check of matrix.policy_checks) assertCheck(check);
  ensure(verificationMatrixFingerprint(matrix) === header.source_fingerprint, "matrix source fingerprint differs");
  return { contract: binding.contract, json: { path: json.path, sha256: json.sha256 }, markdown: { path: markdown.path, sha256: markdown.sha256 }, source_fingerprint: header.source_fingerprint };
}
