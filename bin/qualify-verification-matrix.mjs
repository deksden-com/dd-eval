import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile, realpath, lstat, open, link, unlink } from "node:fs/promises";
import path from "node:path";
import { verifyEngineArtifact, assertVerificationMatrixQualification } from "../lib/engine-admission.mjs";
import { validateVerificationMatrix } from "../lib/case-acceptance.mjs";
import { matrixComponentFingerprint } from '../lib/verification-components.mjs';
import { readPackCatalogHistory } from '../lib/recovery/pack-history.mjs';
import { readPackRevisionGraphs } from '../lib/recovery/pack-review-graph.mjs';
import { ownedDirectory } from '../lib/pack-matrix-admission.mjs';
import { assessPackCatalogComponents } from '../lib/pack-catalog-components.mjs';

const args = process.argv.slice(2);
const argument = name => { const at = args.indexOf(name); if (at < 0 || !args[at + 1]) throw new Error(`Required: ${name}`); return args[at + 1]; };
if (args.includes('--inspect-pack-catalog')) {
  const names = args.filter((_, index) => index % 2 === 0);
  if (![4, 8].includes(args.length) || new Set(names).size !== names.length || !names.includes('--snapshot-sha256')
    || names.some(name => !['--inspect-pack-catalog', '--snapshot-sha256', '--target-bundle', '--target-manifest-sha256'].includes(name))
    || names.includes('--target-bundle') !== names.includes('--target-manifest-sha256')) throw new Error('Use --inspect-pack-catalog <file> --snapshot-sha256 <digest> [--target-bundle <absolute-directory> --target-manifest-sha256 <digest>]');
  const digest = argument('--snapshot-sha256');
  if (!/^[a-f0-9]{64}$/.test(digest)) throw new Error('An independently pinned snapshot SHA-256 is required');
  const catalog = JSON.parse(await readFile(argument('--inspect-pack-catalog'), 'utf8'));
  if (catalog?.ok !== true || typeof catalog.run_id !== 'string' || !Array.isArray(catalog.snapshots)) throw new Error('Public snapshot catalog is invalid');
  const matches = catalog.snapshots.filter(item => item.manifest_sha256 === digest);
  if (matches.length !== 1 || matches[0].catalog?.provenance !== 'capture' || matches[0].reason !== 'pack_assessment_only'
    || matches[0].forkable !== false || matches[0].restorable !== false) throw new Error('Pinned capture assessment is missing or ambiguous');
  const entry = matches[0];
  const history = await readPackCatalogHistory({ snapshot: entry.snapshot, snapshotSha256: digest, runId: catalog.run_id, catalog: entry });
  const components = await assessPackCatalogComponents({ snapshot: entry.snapshot, snapshotSha256: digest, history,
    ...(names.includes('--target-bundle') ? { targetRoot: argument('--target-bundle'), targetManifestSha256: argument('--target-manifest-sha256') } : {}) });
  await new Promise((resolve, reject) => process.stdout.write(`${JSON.stringify({ status: 'assessment_only', qualification: 'unavailable', history, components })}\n`, error => error ? reject(error) : resolve()));
  process.exit(0);
}
if (args.includes('--pack-history')) {
  const checkpointFile = await realpath(argument('--checkpoint'));
  const owner = path.dirname(checkpointFile), output = path.resolve(argument('--output'));
  if (await realpath(path.dirname(output)) !== owner || output === checkpointFile) throw new Error('Pack qualification output must be a new file beside its checkpoint');
  const checkpoint = JSON.parse(await readFile(checkpointFile, 'utf8'));
  const selection = JSON.parse(await readFile(argument('--pack-history'), 'utf8'));
  const engine = JSON.parse(await readFile(argument('--engine-json'), 'utf8'));
  const engineDigest = await verifyEngineArtifact(engine);
  const canon = JSON.parse(await readFile(path.join(engine.snapshot_root, 'dist', 'build-info.json'), 'utf8')).built_with_canon;
  const flowCommit = argument('--flow-commit');
  if (!/^[a-f0-9]{40}$/.test(flowCommit) || !/^[a-f0-9]{40}$/.test(canon?.commit ?? '') || typeof canon.version !== 'string' || !canon.version)
    throw new Error('Pack qualification requires exact project and canon provenance');
  const snapshot = await ownedDirectory(owner, selection.snapshot);
  const history = await readPackRevisionGraphs({ snapshot, snapshotSha256: selection.snapshot_sha256, runId: selection.run_id,
    previousPlanVisit: selection.previous_plan_visit, previousReviewVisit: selection.previous_review_visit,
    planVisit: selection.plan_visit, reviewVisit: selection.review_visit });
  if (history.pack.engine_checksum !== engineDigest || history.pack.project_commit !== flowCommit || history.pack.canon_commit !== canon.commit)
    throw new Error('Pack history differs from the selected engine, project or canon');
  const receipt = { schema_id: 'dd-eval/verification-matrix-qualification@5', contract: 'dd-flow/verification-matrix@1',
    coverage_contract: 'dd-flow/final-check-coverage@1', status: 'passed', engine_artifact_sha256: engineDigest,
    component_sha256: await matrixComponentFingerprint(engine.snapshot_root), flow_commit: flowCommit, built_with_canon: canon, pack_history: selection };
  const bytes = Buffer.from(JSON.stringify(receipt, null, 2) + '\n');
  const ref = { contract: receipt.contract, file: path.basename(output), sha256: createHash('sha256').update(bytes).digest('hex'), canon_commit: canon.commit };
  await assertVerificationMatrixQualification({ file: checkpointFile, value: { ...checkpoint, flow_pack: { ...checkpoint.flow_pack, verification_matrix: ref } } }, engine, { checker: 'task-priority@4' }, bytes);
  // Admission must finish before any passed receipt becomes visible.
  const temporary = `${output}.${randomUUID()}.tmp`;
  let handle;
  try {
    handle = await open(temporary, 'wx'); await handle.writeFile(bytes); await handle.sync(); await handle.close(); handle = null;
    await link(temporary, output);
  } finally { await handle?.close(); await unlink(temporary).catch(error => { if (error.code !== 'ENOENT') throw error; }); }
  process.stdout.write(JSON.stringify({ file: output, sha256: ref.sha256, schema_id: receipt.schema_id }) + '\n');
  process.exit(0);
}
const runHome = await realpath(argument("--run-home"));
const output = path.resolve(argument("--output"));
const flowCommit = argument("--flow-commit");
if (!/^[a-f0-9]{40}$/.test(flowCommit)) throw new Error("--flow-commit must be the exact synced flow-pack repository commit, not the separate canon commit");
const engine = JSON.parse(await readFile(argument("--engine-json"), "utf8"));
const engineDigest = await verifyEngineArtifact(engine);
const build = JSON.parse(await readFile(path.join(engine.snapshot_root, "dist", "build-info.json"), "utf8"));
const canon = build.built_with_canon;
if (!/^[a-f0-9]{40}$/.test(canon?.commit ?? "") || typeof canon.version !== "string") throw new Error("Engine has no exact built_with_canon provenance");
const read = async (relative, owner = runHome) => {
  if (typeof relative !== "string" || !relative || path.isAbsolute(relative) || relative.split(/[\\/]/).includes("..")) throw new Error("Packet is not RUN-relative");
  const file = path.resolve(owner, relative), actual = await realpath(file);
  if (!actual.startsWith(owner + path.sep) || (await lstat(file)).isSymbolicLink()) throw new Error("Packet escaped its declared ownership");
  return await readFile(file);
};
const runBytes = await read("run.json"), run = JSON.parse(runBytes);
if (run.pack_state != null) throw new Error("Pack RUN matrix publication requires a pack-aware qualification contract");
const bindingBytes = await read("engine-binding.json"), binding = JSON.parse(bindingBytes);
if (binding.schema_id !== "dd-flow/run-engine-binding@1" || binding.run_id !== run.run_id || binding.engine?.integrity_checksum !== engineDigest
  || binding.engine?.package_name !== engine.package_name || binding.engine?.package_version !== engine.package_version || binding.engine?.engine_version !== engine.engine_version) throw new Error("Evidence RUN belongs to a different selected engine");
if (run.verification_matrix_contract !== "dd-flow/verification-matrix@1") throw new Error("RUN has no retained matrix contract");
if (run.final_check_coverage_contract !== "dd-flow/final-check-coverage@1") throw new Error("RUN has no final check coverage contract");
const stages = { plan: "03-plan", "plan-review": "04-plan-review", code: "05-code", "code-review": "06-code-review", merge: "07-merge" };
const packets = [], retained = [];
const sha = bytes => createHash("sha256").update(bytes).digest("hex");
const bindingRelative = `${path.basename(output)}.packets/engine-binding.json`;
retained.push({ file: path.join(path.dirname(output), bindingRelative), bytes: bindingBytes });
for (const [stage, directory] of Object.entries(stages)) {
  let reportBytes;
  try { reportBytes = await read(`${directory}/stage-report.json`); } catch (error) { if (error.code === "ENOENT") continue; throw error; }
  const report = JSON.parse(reportBytes), metadata = report.semantic?.verification_matrix;
  if (!metadata) continue;
  const jsonBytes = await read(metadata.json.path), mdBytes = await read(metadata.markdown.path);
  const matrix = validateVerificationMatrix(JSON.parse(jsonBytes));
  if (metadata.contract !== run.verification_matrix_contract || metadata.role !== "output" || metadata.role !== matrix.header.role
    || metadata.completeness !== matrix.header.completeness || report.run_id !== matrix.header.run_id || report.stage !== matrix.header.stage
    || matrix.header.run_id !== run.run_id || matrix.header.stage !== stage || matrix.header.stage_attempt !== run.stage_runs?.find(item => item.stage === stage)?.attempt
    || metadata.source_fingerprint !== matrix.header.source_fingerprint || sha(jsonBytes) !== metadata.json.sha256 || sha(mdBytes) !== metadata.markdown.sha256) throw new Error("Owning Stage publication does not match matrix bytes");
  const packet = {};
  for (const [kind, bytes] of Object.entries({ run: runBytes, report: reportBytes, json: jsonBytes, markdown: mdBytes })) {
    const relative = `${path.basename(output)}.packets/${stage}/${kind === "markdown" ? "matrix.md" : `${kind}.json`}`;
    packet[kind] = { path: relative, sha256: sha(bytes) };
    retained.push({ file: path.join(path.dirname(output), relative), bytes });
  }
  packet.sources = [];
  for (const [index, source] of matrix.sources.entries()) {
    const projectAt = args.indexOf("--project-root");
    const owner = source.root === "run" ? runHome : await realpath(projectAt >= 0 ? args[projectAt + 1] : run.workspace?.workspace_path ?? "");
    const bytes = await read(source.path, owner);
    if (sha(bytes) !== source.sha256) throw new Error("Final matrix source bytes differ");
    const relative = `${path.basename(output)}.packets/${stage}/sources/${index}.json`;
    packet.sources.push({ root: source.root, source_path: source.path, path: relative, sha256: source.sha256 });
    retained.push({ file: path.join(path.dirname(output), relative), bytes });
  }
  packets.push(packet);
}
if (!packets.length) throw new Error("No real owning Stage report published a matrix");
// Never manufacture/overwrite qualification from schema existence alone.
for (const item of retained) { await mkdir(path.dirname(item.file), { recursive: true }); await writeFile(item.file, item.bytes, { flag: "wx" }); }
const skipped = ["plan-review", "code-review"].filter(stage => run.settings?.[stage.replace("-", "_")]?.mode === "off" && run.settings[stage.replace("-", "_")].reason?.trim());
const receipt = { schema_id: "dd-eval/verification-matrix-qualification@3", contract: run.verification_matrix_contract, coverage_contract: run.final_check_coverage_contract, status: "passed", engine_artifact_sha256: engineDigest, engine_binding: { path: bindingRelative, sha256: sha(bindingBytes) }, flow_commit: flowCommit, built_with_canon: { version: canon.version, commit: canon.commit }, skipped_stages: skipped, packets };
try {
  receipt.component_sha256 = await matrixComponentFingerprint(engine.snapshot_root);
  receipt.schema_id = 'dd-eval/verification-matrix-qualification@4';
} catch (error) { if (error.code !== 'ENOENT') throw error; }
const receiptBytes = Buffer.from(JSON.stringify(receipt, null, 2) + "\n");
await assertVerificationMatrixQualification({ file: path.join(path.dirname(output), "checkpoint.json"), value: { flow_pack: { commit: flowCommit, memory_bank_version: canon.version, verification_matrix: { contract: receipt.contract, file: path.basename(output), sha256: sha(receiptBytes), canon_commit: canon.commit } } } }, engine, { checker: "task-priority@4" }, receiptBytes);
// A crash during writing must never expose a partial receipt labelled passed.
// Hard-link publication is atomic and, unlike rename, cannot overwrite a pin.
const temporary = `${output}.${randomUUID()}.tmp`;
let handle;
try {
  handle = await open(temporary, "wx");
  await handle.writeFile(receiptBytes); await handle.sync(); await handle.close(); handle = null;
  await link(temporary, output);
} finally {
  await handle?.close();
  await unlink(temporary).catch(error => { if (error.code !== "ENOENT") throw error; });
}
process.stdout.write(JSON.stringify({ file: output, sha256: sha(await readFile(output)), published_stages: packets.length }) + "\n");
