import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, readFile, rm, symlink, realpath } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { createHash } from "node:crypto";
import { snapshotTreeHash } from "../lib/case-acceptance.mjs";
import { protocolizeMaterializationEvidence } from "../lib/materialization-evidence.mjs";
import { finalJudgePrompt } from "../lib/runner.mjs";
const sha = bytes => createHash("sha256").update(bytes).digest("hex");

test("Judge receives frozen owned reciprocal links, not authored empty lists", async t => {
  const root = await realpath(await mkdtemp(path.join(os.tmpdir(), "materialization-evidence-")));
  t.after(() => rm(root, { recursive: true, force: true }));
  const snapshot = path.join(root, "executions/e2e/boundaries/protocolize-cut"), runtime = path.join(snapshot, "runtime"), workspace = path.join(snapshot, "workspace");
  const feature = ".memory-bank/epics/EP-001/features/FT-001/index.md", protocol = ".memory-bank/protocol/PRT-001/summary.md";
  const docs = [{ path: feature, text: "---\nrelated_protocols: ['PRT-001']\n---\n" }, { path: protocol, text: `---\nrelated_features: ['${feature}']\n---\n` }];
  for (const doc of docs) { await mkdir(path.dirname(path.join(workspace, doc.path)), { recursive: true }); await writeFile(path.join(workspace, doc.path), doc.text); }
  const reportFile = path.join(runtime, "projects/PRJ/runs/RUN/02-protocolize/stage-report.json");
  await mkdir(path.dirname(reportFile), { recursive: true });
  const proof = { schema_id: "dd-flow/protocolize-materialization@1", run_id: "RUN", stage: "protocolize", action: "create", feature_path: feature, protocol_ids: ["PRT-001"], documents: [], owned_links: [{ feature_path: feature, protocol_id: "PRT-001", protocol_path: protocol }], status: "passed" };
  const report = { run_id: "RUN", stage: "protocolize", verdict: "done", semantic: { materialization: proof } };
  const result = { execution: "e2e", run_id: "RUN", boundaries: [], recovery: { snapshot: "/foreign/later-recovery" } };
  const seal = async (refreshRefs = true, purpose = "stage_entry") => {
    if (refreshRefs) proof.documents = await Promise.all(docs.map(async doc => ({ path: doc.path, sha256: sha(await readFile(path.join(workspace, doc.path))) })));
    await writeFile(reportFile, JSON.stringify(report));
    const manifest = { schema_id: "dd-flow/eval-run-snapshot@5", purpose, stage_entry: purpose === "candidate" ? null : "plan", run_id: "RUN", dd_flow_home: "/runtime", source_status: { run: { run_root: "/runtime/projects/PRJ/runs/RUN" } }, workspace: { sha256: snapshotTreeHash(workspace) }, runtime_sha256: snapshotTreeHash(runtime) };
    const bytes = JSON.stringify(manifest); await writeFile(path.join(snapshot, "snapshot.json"), bytes);
    result.boundaries = [{ stage: "protocolize", snapshot, manifest_sha256: sha(bytes) }];
  };
  await seal();
  const passed = await protocolizeMaterializationEvidence(root, result);
  assert.equal(passed.status, "passed"); assert.equal(passed.source, "stage_boundary"); assert.equal(passed.authored_result_role, "input_not_materialized_output");
  await seal(true, "candidate"); assert.equal((await protocolizeMaterializationEvidence(root, result)).status, "passed");
  for (const action of ["link", "update"]) { proof.action = action; await seal(); assert.equal((await protocolizeMaterializationEvidence(root, result)).status, "passed"); }
  proof.action = "not_applicable"; proof.feature_path = null; const ownedLinks = proof.owned_links; proof.owned_links = []; await seal();
  assert.equal((await protocolizeMaterializationEvidence(root, result)).status, "passed");
  proof.action = "create"; proof.feature_path = feature; proof.owned_links = ownedLinks;
  await seal();
  for (const [key, bad] of [["run_id", "foreign"], ["action", "none"], ["owned_links", [{ ...ownedLinks[0], protocol_id: "PRT-foreign" }]]]) {
    const prior = proof[key]; proof[key] = bad; await seal(); assert.equal((await protocolizeMaterializationEvidence(root, result)).status, "unavailable"); proof[key] = prior;
  }
  await seal(); proof.documents[0].path = "../outside"; await seal(false);
  assert.equal((await protocolizeMaterializationEvidence(root, result)).status, "unavailable");
  await seal(); proof.documents[0].sha256 = "0".repeat(64); await seal(false);
  assert.equal((await protocolizeMaterializationEvidence(root, result)).reason, "materialization_document_mismatch");
  await writeFile(path.join(workspace, protocol), "---\nrelated_features: []\n---\n"); await seal();
  assert.equal((await protocolizeMaterializationEvidence(root, result)).status, "failed");
  proof.documents[0].sha256 = "0".repeat(64); await writeFile(reportFile, JSON.stringify(report));
  const unavailable = await protocolizeMaterializationEvidence(root, result);
  assert.equal(unavailable.status, "unavailable"); // no fallback to later recovery
  delete report.semantic.materialization; await seal();
  assert.equal((await protocolizeMaterializationEvidence(root, result)).reason, "legacy_materialization_unavailable");
  await symlink(snapshot, path.join(root, "alias"));
  assert.equal((await protocolizeMaterializationEvidence(root, { ...result, boundaries: [{ ...result.boundaries[0], snapshot: path.join(root, "alias") }] })).status, "unavailable");
  const prompt = finalJudgePrompt({ assessmentFile: "a", candidateFile: "c", evidenceFile: "e", scope: "specify", assessment: { scopes: { specify: { outcome: [], flow: [] } } } });
  assert.match(prompt, /inputs to deterministic materialization/); assert.match(prompt, /unassessable, not proof/);
});
