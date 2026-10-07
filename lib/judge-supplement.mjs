import { createHash } from "node:crypto";
import { mkdir, readFile, readdir, lstat, realpath, open } from "node:fs/promises";
import { constants } from "node:fs";
import path from "node:path";
import { hashJson, writeJsonAtomic } from "./runner-events.mjs";
import { withRunnerLock } from "./runner-lock.mjs";
import { snapshotTreeHash } from "./case-acceptance.mjs";
import { frozenFile, resolveBoundSnapshot, selectedSnapshots } from "./recovery-safety.mjs";

const sha = bytes => createHash("sha256").update(bytes).digest("hex");
const inside = (root, file) => file === root || file.startsWith(root + path.sep);
const fail = (message, code = "judge_supplement_invalid") => { throw Object.assign(new Error(message), { code }); };
const relative = name => typeof name === "string" && name && !path.isAbsolute(name) && !name.split(/[\\/]/).includes("..");
const digest = value => /^[a-f0-9]{64}$/.test(value ?? "");
const payloadHash = snapshot => hashJson({ workspace: snapshotTreeHash(path.join(snapshot, "workspace")), runtime: snapshotTreeHash(path.join(snapshot, "runtime")) });
async function owned(root, file) {
  await frozenFile(root, file);
  const actual = await realpath(file);
  if (!inside(root, actual) || (await lstat(file)).isSymbolicLink()) fail(`Evidence escaped its frozen owner: ${file}`);
  const handle = await open(actual, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
  try { if (!(await handle.stat()).isFile()) fail(`Evidence is not a regular file: ${file}`); return await handle.readFile(); }
  finally { await handle.close(); }
}

async function destination(root, file) {
  let ancestor = path.dirname(file);
  for (;;) {
    try { if (!inside(root, await realpath(ancestor))) fail(`Assessment destination escaped its owner: ${file}`); break; }
    catch (error) { if (error.code !== "ENOENT") throw error; ancestor = path.dirname(ancestor); }
  }
  await mkdir(path.dirname(file), { recursive: true });
  const parent = await realpath(path.dirname(file));
  if (!inside(root, parent)) fail(`Assessment destination escaped its owner: ${file}`);
  return path.join(parent, path.basename(file));
}

export function validateJudgeSupplement(value) {
  const keys = ["schema_id", "original_eval_id", "candidate_sha256", "boundary", "sources", "author", "claim", "kind", "impact", "proof_limits"];
  if (!value || Object.keys(value).some(key => !keys.includes(key)) || keys.some(key => !Object.hasOwn(value, key))
    || value.schema_id !== "dd-eval/judge-supplement@1" || typeof value.original_eval_id !== "string" || !digest(value.candidate_sha256)
    || !value.boundary || !relative(value.boundary.execution_id) || !relative(value.boundary.name) || !digest(value.boundary.manifest_sha256)
    || Object.keys(value.boundary).some(key => !["execution_id", "name", "manifest_sha256"].includes(key))
    || !["observation", "source_inference", "hypothesis"].includes(value.kind)
    || ["author", "claim", "impact"].some(key => typeof value[key] !== "string" || !value[key].trim())
    || !Array.isArray(value.proof_limits) || !value.proof_limits.length || value.proof_limits.some(item => typeof item !== "string" || !item.trim())
    || !Array.isArray(value.sources) || !value.sources.length) fail("Supplement is missing identity, source proof or inference limits");
  const seen = new Set();
  for (const source of value.sources) {
    if (!source || typeof source !== "object") fail("Supplement source is invalid or ambiguous");
    const key = `${source.root}:${source.path}`;
    if (!source || Object.keys(source).some(key => !["root", "path", "sha256"].includes(key)) || !["workspace", "runtime"].includes(source.root) || !relative(source.path) || !digest(source.sha256) || seen.has(key)) fail("Supplement source is invalid or ambiguous");
    seen.add(key);
  }
  return value;
}

async function frozenCandidate(evalRoot, supplement) {
  const root = await realpath(evalRoot);
  const manifestBytes = await owned(root, path.join(root, "manifest.json")), manifest = JSON.parse(manifestBytes);
  if (manifest.run_id !== supplement.original_eval_id) fail("Supplement belongs to another EVAL");
  let judgeRoot = path.join(root, "judge");
  let candidateBytes = await owned(root, path.join(judgeRoot, "candidate.json"));
  if (JSON.parse(candidateBytes).immutable_hash !== supplement.candidate_sha256) {
    judgeRoot = path.join(root, "judge", "revisions", supplement.candidate_sha256);
    candidateBytes = await owned(root, path.join(judgeRoot, "candidate.json"));
  }
  const candidate = JSON.parse(candidateBytes), { file: _file, immutable_hash, ...content } = candidate;
  if (candidate.schema_id !== "dd-eval/run-candidate@2" || candidate.run_id !== manifest.run_id || immutable_hash !== supplement.candidate_sha256 || hashJson(content) !== immutable_hash || candidate.manifest_sha256 !== hashJson(manifest)) fail("Original frozen candidate identity differs");
  const boundary = path.join(root, "executions", supplement.boundary.execution_id, "boundaries", supplement.boundary.name);
  const selected = candidate.executions?.find(item => item.execution === supplement.boundary.execution_id)?.checkpoint;
  if (!selected || path.resolve(selected.snapshot) !== boundary || selected.manifest_sha256 !== supplement.boundary.manifest_sha256) fail("Supplement is not bound to the candidate checkpoint");
  return { root, manifestBytes, manifest, judgeRoot, candidateBytes, candidate, immutable_hash, boundary, selected };
}

export async function supplementalEngineIdentity(evalRoot, value) {
  const supplement = validateJudgeSupplement(value);
  const { root, boundary, selected, candidate } = await frozenCandidate(evalRoot, supplement);
  const { data: snapshot } = await resolveBoundSnapshot({ evalRoot: root, execution: supplement.boundary.execution_id,
    result: candidate.executions.find(item => item.execution === supplement.boundary.execution_id), checkpoint: selected, purpose: "candidate" });
  const runRoot = snapshot.source_status?.run?.run_root, home = snapshot.dd_flow_home;
  if (!path.isAbsolute(home ?? "") || !path.isAbsolute(runRoot ?? "") || !inside(path.resolve(home), path.resolve(runRoot)) || snapshot.run_id !== selected.run_id) fail("Frozen RUN engine owner is missing", "judge_runtime_missing");
  const file = path.join(boundary, "runtime", path.relative(path.resolve(home), path.resolve(runRoot)), "engine-binding.json");
  const binding = JSON.parse(await owned(root, file));
  if (binding.schema_id !== "dd-flow/run-engine-binding@1" || binding.run_id !== selected.run_id || !digest(binding.engine?.integrity_checksum)
    || ["package_name", "package_version", "engine_version"].some(key => typeof binding.engine?.[key] !== "string" || !binding.engine[key])) fail("Frozen RUN engine binding is invalid", "judge_runtime_missing");
  return binding.engine;
}

/** Pure evidence preparation: no Subject/provider dispatch and no old EVAL writes. */
export async function prepareSupplementalJudge({ evalRoot, supplementFile, outputRoot, profile }) {
  const supplement = validateJudgeSupplement(JSON.parse(await readFile(supplementFile, "utf8")));
  const { root, manifestBytes, manifest, judgeRoot, candidateBytes, candidate, immutable_hash, boundary, selected } = await frozenCandidate(evalRoot, supplement);
  const output = path.resolve(outputRoot);
  // Resolve the nearest existing ancestor too: an output parent symlink must
  // not turn this independent assessment into a historical EVAL mutation.
  let ancestor = output;
  for (;;) {
    try { ancestor = await realpath(ancestor); break; }
    catch (error) { if (error.code !== "ENOENT") throw error; ancestor = path.dirname(ancestor); }
  }
  if (inside(root, output) || inside(root, ancestor)) fail("Supplemental output must be outside the historical EVAL", "judge_output_conflict");
  const assessmentBytes = await owned(root, path.join(judgeRoot, "assessment.json")).catch(error => {
    if (error.code === "ENOENT") fail("Frozen original Judge assessment is missing", "judge_assessment_missing");
    throw error;
  });
  const evidenceBytes = await owned(root, path.join(judgeRoot, "evidence.json"));
  const assessment = JSON.parse(assessmentBytes), evidence = JSON.parse(evidenceBytes);
  const receiptBytes = await owned(root, path.join(judgeRoot, "result.json")), originalReceipt = JSON.parse(receiptBytes);
  if (originalReceipt.candidate_sha256 !== immutable_hash || originalReceipt.evidence_sha256 !== hashJson(evidence) || evidence.candidate_sha256 !== immutable_hash) fail("Original Judge packet is not bound to its verdict");
  const snapshots = selectedSnapshots(candidate, evidence);
  const originals = new Map(), mapping = new Map(), frozenTrees = [];
  const retain = async (file, retainedBytes, sourceRoot = root, target = path.join(output, "evidence", path.relative(root, file))) => {
    const bytes = retainedBytes ?? await owned(sourceRoot, file);
    if (originals.has(file) && originals.get(file).sha256 !== sha(bytes)) fail("Frozen evidence changed during preparation", "judge_packet_changed");
    originals.set(file, { bytes, sha256: sha(bytes), owner: sourceRoot });
    mapping.set(file, target);
  };
  for (const [file, bytes] of [[path.join(root, "manifest.json"), manifestBytes],
    ...[["candidate.json", candidateBytes], ["assessment.json", assessmentBytes], ["evidence.json", evidenceBytes], ["result.json", receiptBytes]].map(([name, bytes]) => [path.join(judgeRoot, name), bytes])]) await retain(file, bytes);
  const walk = async (directory, sourceRoot, target) => {
    if (!inside(sourceRoot, await realpath(directory)) || (await lstat(directory)).isSymbolicLink()) fail("Frozen evidence directory escaped its snapshot");
    mapping.set(directory, target);
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const file = path.join(directory, entry.name);
      if (entry.isDirectory()) await walk(file, sourceRoot, path.join(target, entry.name));
      else await retain(file, undefined, sourceRoot, path.join(target, entry.name)); // Symlinks/devices are refused by owned().
    }
  };
  for (const selection of snapshots) {
    const { snapshot } = await resolveBoundSnapshot({ evalRoot: root, ...selection });
    const target = inside(root, snapshot) ? path.join(output, "evidence", path.relative(root, snapshot))
      : path.join(output, "evidence", "recovery", selection.execution, selection.checkpoint.manifest_sha256);
    frozenTrees.push({ original: snapshot, owner: snapshot, file: target, sha256: payloadHash(snapshot), manifest_sha256: selection.checkpoint.manifest_sha256 });
    mapping.set(snapshot, target);
    // Typed payloads only: an unrelated root file is not a copying capability.
    await retain(path.join(snapshot, "snapshot.json"), undefined, snapshot, path.join(target, "snapshot.json"));
    for (const payload of ["workspace", "runtime"]) await walk(path.join(snapshot, payload), snapshot, path.join(target, payload));
  }
  for (const source of supplement.sources) {
    const file = path.join(boundary, source.root, source.path);
    if (!inside(await realpath(path.join(boundary, source.root)), await realpath(file)) || sha(await owned(root, file)) !== source.sha256) fail(`Supplement source checksum/ownership differs: ${source.root}:${source.path}`);
  }
  // Only published source inventories grant retention; diagnostic strings do not.
  const references = [];
  for (const result of evidence.executions ?? []) {
    const journals = [...(result.artifacts?.evidence_journals ?? []), ...(result.observation?.journals ?? [])];
    for (const source of journals) references.push(source.journal, source.model_observations?.file);
    for (const source of result.verification_matrix_sources ?? []) references.push(source.path);
  }
  for (const file of references) if (typeof file === "string" && path.isAbsolute(file) && inside(root, path.resolve(file)) && !originals.has(file)) {
    try { await retain(file); }
    catch (error) { if (error.code !== "ENOENT") throw error; }
  }
  const hashes = [...originals].map(([file, { sha256 }]) => ({ path: path.relative(output, mapping.get(file)), sha256 })).sort((a, b) => a.path.localeCompare(b.path));
  const identity = { schema_id: "dd-eval/supplemental-assessment@1", evidence_view_contract: "typed-frozen-payload@2", original_eval_id: manifest.run_id, candidate_sha256: immutable_hash, assessment_sha256: sha(assessmentBytes), evidence_sha256: sha(evidenceBytes), supplement_sha256: hashJson(supplement), profile, sources: hashes };
  const key = hashJson(identity);
  await mkdir(output, { recursive: true });
  const ownedRoot = await realpath(output);
  await withRunnerLock(path.join(output, "assessment"), async () => {
    let existing;
    try { existing = JSON.parse(await owned(ownedRoot, path.join(output, "identity.json"))); }
    catch (error) { if (error.code !== "ENOENT") throw error; }
    if (existing ? existing.key !== key : (await readdir(output)).some(name => name !== "assessment.lock")) fail("Assessment output is already owned by another packet", "judge_output_conflict");
    if (!existing) await writeJsonAtomic(await destination(ownedRoot, path.join(output, "identity.json")), { key, identity });
    for (const [file, { bytes, sha256 }] of originals) {
      const target = await destination(ownedRoot, mapping.get(file));
      try { const handle = await open(target, "wx", 0o600); try { await handle.writeFile(bytes); await handle.sync(); } finally { await handle.close(); } }
      catch (error) { if (error.code !== "EEXIST") throw error; if (sha(await owned(await realpath(output), target)) !== sha256) fail("Retained assessment source changed", "judge_packet_changed"); }
    }
    const view = value => typeof value === "string" && path.isAbsolute(value) ? mapping.get(path.resolve(value)) ?? `provenance-only:${value}`
      : Array.isArray(value) ? value.map(view) : value && typeof value === "object" ? Object.fromEntries(Object.entries(value).map(([name, item]) => [name, view(item)])) : value;
    const packets = { "candidate.json": { ...view(candidate), derived_view: true, original_candidate_sha256: immutable_hash }, "assessment.json": assessment,
      "evidence.json": { ...view(evidence), frozen_snapshots: frozenTrees.map(tree => ({ snapshot: tree.file, manifest_sha256: tree.manifest_sha256 })),
        supplement: { ...supplement, sources: supplement.sources.map(source => ({ ...source, file: mapping.get(path.join(boundary, source.root, source.path)) })) } } };
    for (const [name, value] of Object.entries(packets)) {
      const file = path.join(output, name);
      try { if (hashJson(JSON.parse(await owned(await realpath(output), file))) !== hashJson(value)) fail("Derived Judge packet changed", "judge_packet_changed"); }
      catch (error) { if (error.code !== "ENOENT") throw error; await writeJsonAtomic(await destination(ownedRoot, file), value); }
    }
  });
  const packetHashes = await Promise.all(["candidate.json", "assessment.json", "evidence.json"].map(async name => [path.join(output, name), sha(await owned(await realpath(output), path.join(output, name)))]));
  const prepared = { root: output, ownedRoot, key, identity, manifest, candidate, assessment, evidence, originalReceipt, checkpoint: selected, files: ["candidate.json", "assessment.json", "evidence.json"].map(name => path.join(output, name)),
    packetHashes, frozenTrees, sourceFiles: [...originals].map(([file, value]) => ({ original: file, owner: value.owner, file: mapping.get(file), sha256: value.sha256 })), originalRoot: root };
  await assertSupplementalEvidence(prepared);
  return prepared;
}

export async function assertSupplementalEvidence(prepared) {
  const root = await realpath(prepared.root), originalRoot = await realpath(prepared.originalRoot);
  if (root !== prepared.ownedRoot) fail("Supplemental assessment owner moved", "judge_packet_changed");
  const saved = JSON.parse(await owned(root, path.join(root, "identity.json")));
  if (saved.key !== prepared.key || hashJson(saved.identity) !== prepared.key) fail("Supplemental assessment identity changed", "judge_packet_changed");
  for (const [file, hash] of prepared.packetHashes) if (sha(await owned(root, file)) !== hash) fail("Supplemental packet changed", "judge_packet_changed");
  for (const source of prepared.sourceFiles) if (sha(await owned(root, source.file)) !== source.sha256 || sha(await owned(source.owner ?? originalRoot, source.original)) !== source.sha256) fail("Supplemental or historical evidence changed", "judge_packet_changed");
  for (const tree of prepared.frozenTrees) {
    if (!inside(root, await realpath(tree.file)) || !inside(tree.owner ?? originalRoot, await realpath(tree.original))
      || payloadHash(tree.file) !== tree.sha256 || payloadHash(tree.original) !== tree.sha256) fail("Supplemental evidence tree changed", "judge_packet_changed");
  }
}
