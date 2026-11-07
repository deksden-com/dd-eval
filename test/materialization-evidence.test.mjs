import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, readFile, rm, symlink, realpath, chmod } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { createHash } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import { snapshotTreeHash } from "../lib/case-acceptance.mjs";
import { framedSnapshotTreeHash } from "../lib/framed-snapshot-hash.mjs";
import { protocolizeMaterializationEvidence } from "../lib/materialization-evidence.mjs";
import { finalJudgePrompt } from "../lib/runner.mjs";
const sha = bytes => createHash("sha256").update(bytes).digest("hex");

test('framed snapshot hash follows the cross-engine root, mode, file and symlink contract',async t=>{
  const root=await realpath(await mkdtemp(path.join(os.tmpdir(),'framed-snapshot-contract-')));t.after(()=>rm(root,{recursive:true,force:true}));
  await chmod(root,0o700);await mkdir(path.join(root,'a'));await chmod(path.join(root,'a'),0o700);
  await writeFile(path.join(root,'a','file'),'hello');await chmod(path.join(root,'a','file'),0o600);await symlink('a/file',path.join(root,'b'));
  const records=[['root',0o700],['directory','a',0o700],['file','a/file',0o600,sha('hello')],['symlink','b',Buffer.from('a/file').toString('base64')]];
  assert.equal(framedSnapshotTreeHash(root),sha(records.map(item=>`${JSON.stringify(item)}\n`).join('')));
});

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
  const seal = async (refreshRefs = true, purpose = "stage_entry", acceptReport = true) => {
    if (refreshRefs) proof.documents = await Promise.all(docs.map(async doc => ({ path: doc.path, sha256: sha(await readFile(path.join(workspace, doc.path))) })));
    await writeFile(reportFile, JSON.stringify(report));
    const db = new DatabaseSync(path.join(runtime, "db.sqlite"));
    try {
      db.exec("CREATE TABLE IF NOT EXISTS runs(id TEXT PRIMARY KEY,project_id TEXT,run_root TEXT,index_json TEXT); CREATE TABLE IF NOT EXISTS audit_events(id INTEGER PRIMARY KEY,project_id TEXT,event_type TEXT,payload_json TEXT)");
      db.prepare("INSERT OR REPLACE INTO runs VALUES(?,?,?,?)").run("RUN", "PRJ", "/runtime/projects/PRJ/runs/RUN", JSON.stringify({ stage_runs: [{ stage: "protocolize", status: "done", attempt: "try-001" }] }));
      if (acceptReport) db.prepare("INSERT OR REPLACE INTO audit_events VALUES(1,?,?,?)").run("PRJ", "flow_run.stage_report", JSON.stringify({ run_id: "RUN", stage: "protocolize", attempt: "try-001", root: "/runtime/projects/PRJ/runs/RUN/02-protocolize", sha256: sha(JSON.stringify(report)) }));
    } finally { db.close(); }
    const manifest = { schema_id: "dd-flow/eval-run-snapshot@5", purpose, stage_entry: purpose === "candidate" ? null : "plan", run_id: "RUN", project_id: "PRJ", dd_flow_home: "/runtime", source_status: { run: { run_root: "/runtime/projects/PRJ/runs/RUN" } }, workspace: { sha256: snapshotTreeHash(workspace) }, runtime_sha256: snapshotTreeHash(runtime) };
    const bytes = JSON.stringify(manifest); await writeFile(path.join(snapshot, "snapshot.json"), bytes);
    result.boundaries = [{ stage: "protocolize", snapshot, manifest_sha256: sha(bytes) }];
  };
  await seal();
  const passed = await protocolizeMaterializationEvidence(root, result);
  assert.equal(passed.status, "passed"); assert.equal(passed.source, "stage_boundary"); assert.equal(passed.authored_result_role, "input_not_materialized_output");
  const project=path.join(snapshot,"project");await mkdir(project);
  await writeFile(path.join(project,"a"),"XbY");await writeFile(path.join(project,"b"),"Z");
  const stage=JSON.parse(await readFile(path.join(snapshot,"snapshot.json"))),framed={...stage,schema_id:"dd-flow/eval-run-snapshot@11",workspace:{...stage.workspace,kind:"git_worktree"},project_sha256:snapshotTreeHash(project),payload_integrity:{schema_id:"dd-flow/framed-payload@1",project:framedSnapshotTreeHash(project),runtime:framedSnapshotTreeHash(runtime),workspace:framedSnapshotTreeHash(workspace)}};
  const publish=async value=>{const bytes=JSON.stringify(value);await writeFile(path.join(snapshot,"snapshot.json"),bytes);result.boundaries[0].manifest_sha256=sha(bytes);};
  await publish(framed);assert.equal((await protocolizeMaterializationEvidence(root,result)).status,"passed");
  const bundle=Buffer.from('candidate bundle'),ref='a'.repeat(64);await writeFile(path.join(snapshot,'work-git.bundle'),bundle);
  const candidate={...framed,schema_id:'dd-flow/eval-run-snapshot@12',purpose:'candidate',stage_entry:null,work_git:{sha256:sha(bundle),refs:[{ref:`refs/dd-flow/work-results/${ref}`,commit:'b'.repeat(40)}]}};
  await publish(candidate);assert.equal((await protocolizeMaterializationEvidence(root,result)).status,'passed');
  await writeFile(path.join(snapshot,'work-git.bundle'),'corrupt');assert.equal((await protocolizeMaterializationEvidence(root,result)).status,'unavailable');
  await publish(framed);
  await writeFile(path.join(project,"a"),"X");await writeFile(path.join(project,"b"),"YbZ");
  assert.equal(snapshotTreeHash(project),framed.project_sha256,'legacy stream is ambiguous');
  assert.equal((await protocolizeMaterializationEvidence(root,result)).reason,"snapshot_payload_mismatch");
  await writeFile(path.join(project,"a"),"XbY");await writeFile(path.join(project,"b"),"Z");
  const incomplete={...framed};delete incomplete.payload_integrity;await publish(incomplete);
  assert.equal((await protocolizeMaterializationEvidence(root,result)).status,"unavailable");
  await seal();
  proof.owned_links[0].raw_body = "SECRET_SENTINEL";
  await seal(); proof.documents[0].headers = { authorization: "SECRET_SENTINEL" }; await seal(false);
  assert.ok(!JSON.stringify(await protocolizeMaterializationEvidence(root, result)).includes("SECRET_SENTINEL"));
  await seal(true, "candidate"); assert.equal((await protocolizeMaterializationEvidence(root, result)).status, "passed");
  for (const action of ["link", "update"]) { proof.action = action; await seal(); assert.equal((await protocolizeMaterializationEvidence(root, result)).status, "passed"); }
  proof.action = "not_applicable"; proof.feature_path = null; const ownedLinks = proof.owned_links; proof.owned_links = []; await seal();
  assert.equal((await protocolizeMaterializationEvidence(root, result)).status, "passed");
  proof.action = "create"; proof.feature_path = feature; proof.owned_links = ownedLinks;
  await seal();
  proof.action = "update"; await seal(false, "stage_entry", false);
  assert.equal((await protocolizeMaterializationEvidence(root, result)).reason, "materialization_publication_mismatch");
  proof.action = "create"; await seal();
  for (const [key, bad] of [["run_id", "foreign"], ["action", "none"], ["status", "failed"], ["protocol_ids", [{ token: "SECRET_SENTINEL" }]], ["protocol_ids", ["PRT-" + "a".repeat(257)]], ["owned_links", [{ ...ownedLinks[0], protocol_id: "PRT-foreign" }]]]) {
    const prior = proof[key]; proof[key] = bad; await seal(); const unavailable = await protocolizeMaterializationEvidence(root, result); assert.equal(unavailable.status, "unavailable"); assert.ok(!JSON.stringify(unavailable).includes("SECRET_SENTINEL")); proof[key] = prior;
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
