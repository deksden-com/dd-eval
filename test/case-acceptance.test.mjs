import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, mkdir, readFile, rm, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { checkCaseAcceptance, snapshotTreeHash, validateCaseAcceptancePolicy } from "../lib/case-acceptance.mjs";

const sha = value => createHash("sha256").update(value).digest("hex");
const policy = { checker: "task-priority@1", case_id: "sdlc-eval-2026-summer-task-priority" };
const scenario = ".memory-bank/scenarios/SCN-002-workspace-task-core.md";
const matrix = ".memory-bank/plans/verification-matrix.md";
const plan = ".memory-bank/protocol/PRT-007-task-priority-levels/plan.json";
const evidence = ".memory-bank/protocol/PRT-007-task-priority-levels/evidence/local-proof.md";
test("case acceptance policy rejects a typo before runner admission", () => {
  assert.doesNotThrow(() => validateCaseAcceptancePolicy({ ...policy, checker: "task-priority@2" }));
  assert.doesNotThrow(() => validateCaseAcceptancePolicy({ ...policy, checker: "task-priority@3" }));
  assert.throws(() => validateCaseAcceptancePolicy({ ...policy, checker: "task-priority@4" }), /unsupported case acceptance policy/);
});
async function put(root, name, value) { const file = path.join(root, name); await mkdir(path.dirname(file), { recursive: true }); await writeFile(file, value); return file; }

async function fixture() {
  const root = await mkdtemp(path.join(os.tmpdir(), "eval-acceptance-"));
  const snapshot = path.join(root, "executions", "e2e", "boundaries", "merge-frozen");
  const workspace = path.join(snapshot, "workspace");
  const runtime = path.join(snapshot, "runtime", "projects", "PRJ-001", "runs", "RUN-001");
  await put(workspace, scenario, "---\nexecution_status: accepted_local\n---\n");
  await put(workspace, matrix, `| \`PRT-007-task-priority-levels\` | \`SCN-002-workspace-task-core\` | local | local | applicable | accepted_local | pass | accepted_local | CODE | checks | \`${evidence}\` | local only |\n`);
  await put(workspace, evidence, "Criterion AC-001: check CHK-LOCAL passed. Local-only proof; no production claim.\n");
  await put(workspace, plan, JSON.stringify({ acceptance: [{ criterion_id: "AC-001", check_refs: ["CHK-LOCAL"], expected_evidence: ["local check"], proof_limits: ["local only"] }] }));
  await put(runtime, "05-code/checks/RCP-001/receipt.json", JSON.stringify({ id: "RCP-001", declaration_id: "CHK-LOCAL", scope: "aggregate", status: "passed", input_hash: "a", verification_epoch: "epoch", finished_at: "2026-01-01T00:00:00Z" }));
  const result = { state: "candidate_ready", stage: "merge", run_id: "RUN-001", candidate: { manifest: path.join(snapshot, "snapshot.json"), manifest_sha256: null } };
  const sealed = { root, snapshot, workspace, runtime, result };
  await seal(sealed);
  return sealed;
}
async function seal(f) {
  const manifest = JSON.stringify({ schema_id: "dd-flow/eval-run-snapshot@5", purpose: "candidate", stage_entry: null, run_id: "RUN-001", project_id: "PRJ-001", workspace: { sha256: snapshotTreeHash(f.workspace) }, runtime_sha256: snapshotTreeHash(path.join(f.snapshot, "runtime")) });
  await put(f.snapshot, "snapshot.json", manifest);
  f.result.candidate.manifest_sha256 = sha(manifest);
}

test("case acceptance reads only a sealed checkpoint and separates objective gaps from Judge semantics", async () => {
  const f = await fixture();
  try {
    const read = () => checkCaseAcceptance({ evalRoot: f.root, execution: "e2e", result: f.result, policy });
    assert.equal((await read()).status, "passed");
    await put(f.root, scenario, "---\nexecution_status: planned\n---\n");
    assert.equal((await read()).status, "passed", "live tree must not affect the frozen checkpoint");
    await put(f.workspace, scenario, "---\nexecution_status: planned\n---\n");
    await seal(f);
    const planned = await read();
    assert.equal(planned.status, "failed");
    assert.ok(planned.gaps.includes("scenario_not_accepted_local"));
    await put(f.workspace, scenario, "---\nexecution_status: accepted_local\n---\n");
    await put(f.runtime, "05-code/checks/RCP-002/receipt.json", JSON.stringify({ id: "RCP-002", declaration_id: "CHK-LOCAL", scope: "aggregate", status: "failed", input_hash: "b", verification_epoch: "epoch", finished_at: "2026-01-02T00:00:00Z" }));
    await seal(f);
    assert.ok((await read()).gaps.includes("criterion_check_unproven:AC-001:CHK-LOCAL"));
  } finally { await rm(f.root, { recursive: true, force: true }); }
});

test("case acceptance rejects escaped or corrupt candidate evidence without inventing a product failure", async () => {
  const f = await fixture();
  try {
    const read = () => checkCaseAcceptance({ evalRoot: f.root, execution: "e2e", result: f.result, policy });
    f.result.candidate.manifest_sha256 = sha("wrong");
    assert.equal((await read()).status, "unavailable");
    f.result.candidate.manifest_sha256 = sha(await readFile(f.result.candidate.manifest));
    await rm(path.join(f.workspace, evidence));
    await symlink(path.join(f.root, "foreign.md"), path.join(f.workspace, evidence));
    await writeFile(path.join(f.root, "foreign.md"), "outside");
    assert.equal((await read()).status, "unavailable");
    assert.equal((await checkCaseAcceptance({ evalRoot: f.root, execution: "e2e", result: { state: "failed", stage: "specify" }, policy })).status, "not_applicable");
  } finally { await rm(f.root, { recursive: true, force: true }); }
});

test("v2 resolves the accepted protocol and its final MERGE Work receipt", async () => {
  const f = await fixture();
  const v2 = { ...policy, checker: "task-priority@2" };
  const protocol = "PRT-007-task-priority-e2e";
  const candidatePlan = { plan_id: "PLAN-007", protocol_id: protocol, revision: 2,
    acceptance: [{ criterion_id: "AC-001", check_refs: ["CHK-LOCAL"], expected_evidence: ["local check"], proof_limits: ["local only"] }] };
  const planBytes = JSON.stringify(candidatePlan);
  const receiptId = "WRK-001-merge/RCP-002";
  const binding = `${protocol}/CHK-LOCAL`;
  const check = { id: "CHK-LOCAL", canonical_ref: binding, run_at: "merge" };
  const gate = { schema_id: "dd-flow/merge-gate@2", run_id: "RUN-001", protocols: [protocol], checks: [check], acceptance_refs: [], profile_hash: null };
  gate.gate_hash = sha(JSON.stringify({ checks: gate.checks, acceptance_refs: [] }));
  const accepted = { schema_id: "dd-flow/merge-gate-acceptance@2", merge_request_id: "MRG-001", run_id: "RUN-001",
    work_id: "WRK-001-merge", gate_hash: gate.gate_hash, profile_hash: null, accepted_tree: "tree-one",
    receipts: [{ id: receiptId, execution_refs: [binding], binding_refs: [binding], input_hash: "hash-one" }] };
  try {
    await put(f.workspace, `.memory-bank/protocol/${protocol}/plan.json`, planBytes);
    await put(f.workspace, matrix, [
      "| Capability / claim | Primary scenario | Verification contour | gate_status | closure_state | Later passport |",
      "| --- | --- | --- | --- | --- | --- |",
      `| \`${protocol}\`: priority | \`SCN-002-workspace-task-core\` | local | pass | accepted_local_fixed | \`${evidence}\` |`
    ].join("\n"));
    await put(f.runtime, "01-specify/specify.json", JSON.stringify({ acceptance_criteria: [{ id: "AC-001", statement: "local behavior" }] }));
    await put(f.runtime, "02-protocolize/protocolize-result.json", JSON.stringify({ schema_id: "dd-flow/vnext-protocolize-result@3", delivery: { members: [{ key: "primary" }] }, obligation_ownership: [{ obligation_id: "AC-001", member_keys: ["primary"] }] }));
    await put(f.runtime, "02-protocolize/stage-report.json", JSON.stringify({ semantic: { acceptance: [protocol] } }));
    await put(f.runtime, "03-plan/code-work-batch.json", JSON.stringify({ sources: [{ plan_id: "PLAN-007", protocol_id: protocol, revision: 2, sha256: sha(planBytes) }] }));
    await put(f.runtime, "07-merge/stage-report.json", JSON.stringify({ semantic: { merge: { merge_request_id: "MRG-001", work_id: "WRK-001-merge", accepted_tree: "tree-one", protocols: [protocol] } } }));
    await put(f.runtime, "07-merge/merge-gate.json", JSON.stringify(gate));
    await put(f.runtime, "07-merge/merge-gate-acceptance.json", JSON.stringify(accepted));
    await put(f.runtime, "07-merge/works/WRK-001-merge/checks/RCP-002/receipt.json", JSON.stringify({ id: receiptId, status: "passed", scope: "aggregate", input_hash: "hash-one", verification_epoch: "epoch-one", check_refs: [binding], artifacts: [], required_artifacts: [] }));
    await seal(f);
    const read = () => checkCaseAcceptance({ evalRoot: f.root, execution: "e2e", result: f.result, policy: v2 });
    const passed = await read();
    assert.equal(passed.status, "passed", JSON.stringify(passed.evidence_error ?? passed.gaps));
    assert.equal(passed.facts.criteria[0].checks[0].receipt_id, receiptId);
    // V3 uses generated facts, not a second manually copied Markdown passport.
    const v3 = { ...v2, checker: "task-priority@3" };
    const matrixPath = "07-merge/verification/final/verification-matrix.json";
    const mdPath = "07-merge/verification/final/verification-matrix.md";
    const nativeReceipt = JSON.parse(await readFile(path.join(f.runtime, "07-merge/works/WRK-001-merge/checks/RCP-002/receipt.json"), "utf8"));
    const sourceNames = [
      { role: `plan:${protocol}`, root: "run", path: `07-merge/verification/sources/${sha(planBytes)}/plan.json` },
      { role: "merge_acceptance", root: "run", path: "07-merge/merge-gate-acceptance.json" },
      ...["01-specify/specify.json", "02-protocolize/protocolize-result.json", "02-protocolize/stage-report.json", "03-plan/code-work-batch.json", "07-merge/merge-gate.json"].map(path => ({ role: path, root: "run", path })),
      { role: `receipt:${binding}`, root: "run", path: "07-merge/works/WRK-001-merge/checks/RCP-002/receipt.json" }
    ];
    await put(f.runtime, sourceNames[0].path, planBytes);
    const sources = await Promise.all(sourceNames.map(async source => ({ ...source, sha256: sha(await readFile(path.join(source.root === "run" ? f.runtime : f.workspace, source.path))) })));
    sources.sort((a, b) => `${a.role}:${a.root}:${a.path}` < `${b.role}:${b.root}:${b.path}` ? -1 : 1);
    const fact = { id: "CHK-LOCAL", canonical_ref: binding, declaration: check, result: nativeReceipt, disposition: "retained" };
    const header = { project_id: "PRJ-001", run_id: "RUN-001", stage: "merge", stage_attempt: "try-001", role: "output", completeness: "final",
      merge: { merge_request_id: accepted.merge_request_id, work_id: accepted.work_id, gate_hash: accepted.gate_hash, profile_hash: null, accepted_tree: accepted.accepted_tree, acceptance_ref: { root: "run", path: sources.find(item => item.role === "merge_acceptance").path, sha256: sources.find(item => item.role === "merge_acceptance").sha256 } } };
    const canonical = value => JSON.stringify(value, function(key, item) { return item && !Array.isArray(item) && typeof item === "object" ? Object.fromEntries(Object.keys(item).sort().map(key => [key, item[key]])) : item; }, 2) + "\n";
    const projection = { schema_id: "dd-flow/verification-matrix@1", header: { ...header, source_fingerprint: sha(canonical({ header, sources, facts: [fact] })) }, sources, requirements: [],
      criteria: [{ protocol_id: protocol, criterion_id: "AC-001", statement: "local behavior", gate: null, check_refs: ["CHK-LOCAL"], declaration: candidatePlan.acceptance[0], checks: [fact] }], policy_checks: [] };
    const matrixBinding = { contract: projection.schema_id, role: "output", completeness: "final", source_fingerprint: projection.header.source_fingerprint, json: { path: matrixPath, sha256: null }, markdown: { path: mdPath, sha256: sha("Generated matrix\n") } };
    const publish = async () => {
      for (const source of sources) source.sha256 = sha(await readFile(path.join(source.root === "run" ? f.runtime : f.workspace, source.path)));
      const { source_fingerprint, ...owning } = projection.header;
      projection.header.source_fingerprint = sha(canonical({ header: owning, sources, facts: [fact] }));
      matrixBinding.source_fingerprint = projection.header.source_fingerprint;
      const bytes = canonical(projection);
      matrixBinding.json.sha256 = sha(bytes);
      await put(f.runtime, matrixPath, bytes);
      await put(f.runtime, mdPath, "Generated matrix\n");
      await put(f.runtime, "run.json", JSON.stringify({ verification_matrix_contract: projection.schema_id, stage_runs: [{ stage: "merge", attempt: "try-001" }] }));
      await put(f.runtime, "07-merge/stage-report.json", JSON.stringify({ semantic: { merge: { merge_request_id: "MRG-001", work_id: "WRK-001-merge", accepted_tree: "tree-one", protocols: [protocol] }, verification_matrix: matrixBinding } }));
      await seal(f);
    };
    await rm(path.join(f.workspace, matrix));
    await rm(path.join(f.workspace, evidence));
    await publish();
    const generatedRead = () => checkCaseAcceptance({ evalRoot: f.root, execution: "e2e", result: f.result, policy: v3 });
    const generated = await generatedRead();
    assert.equal(generated.status, "passed", JSON.stringify(generated.evidence_error));
    assert.deepEqual(await generatedRead(), generated, "same frozen proof produces identical acceptance receipt");
    await rm(path.join(f.workspace, `.memory-bank/protocol/${protocol}/plan.json`));
    await publish();
    assert.equal((await generatedRead()).status, "passed", "retained PLAN proof survives legitimate workspace cleanup");
    const protocolizeValue = JSON.parse(await readFile(path.join(f.runtime, "02-protocolize/protocolize-result.json"), "utf8"));
    protocolizeValue.obligation_amendments = [{ target_id: "AC-001", replacement: "accepted amended behavior" }];
    await put(f.runtime, "02-protocolize/protocolize-result.json", JSON.stringify(protocolizeValue));
    await publish();
    assert.equal((await generatedRead()).status, "unavailable", "original SPECIFY wording cannot replace an accepted amendment");
    projection.criteria[0].statement = "accepted amended behavior";
    await publish();
    assert.equal((await generatedRead()).status, "passed", "matrix uses effective accepted obligation wording");
    nativeReceipt.status = "failed";
    await put(f.runtime, sourceNames.find(item => item.role === `receipt:${binding}`).path, JSON.stringify(nativeReceipt));
    await publish();
    const negative = await generatedRead();
    assert.equal(negative.status, "failed", JSON.stringify(negative.evidence_error));
    assert.ok(negative.gaps.includes(`final_check_failed:${receiptId}`));
    nativeReceipt.status = "passed";
    await put(f.runtime, sourceNames.find(item => item.role === `receipt:${binding}`).path, JSON.stringify(nativeReceipt));
    fact.result = { ...nativeReceipt, input_hash: "forged" };
    await publish();
    assert.equal((await generatedRead()).status, "unavailable", "forged passed matrix cannot prove native execution");
    fact.result = nativeReceipt;
    projection.header.merge.accepted_tree = "foreign-tree";
    await publish();
    assert.equal((await generatedRead()).status, "unavailable");
    projection.header.merge.accepted_tree = "tree-one";
    projection.header.stage_attempt = "try-old";
    await publish();
    assert.equal((await generatedRead()).status, "unavailable", "stale owning attempt cannot pass");
    projection.header.stage_attempt = "try-001";
    await publish();
    await rm(path.join(f.runtime, mdPath));
    await seal(f);
    assert.equal((await generatedRead()).status, "unavailable", "both generated packets are required");
    await put(f.workspace, `.memory-bank/protocol/${protocol}/plan.json`, planBytes);
    await put(f.workspace, evidence, "Restored legacy curated evidence\n");
    accepted.receipts.push({ ...accepted.receipts[0] });
    await put(f.runtime, "07-merge/merge-gate-acceptance.json", JSON.stringify(accepted));
    await seal(f);
    assert.equal((await read()).status, "unavailable", "duplicate final receipt identity cannot prove the gate");
    accepted.receipts.pop();
    await put(f.runtime, "07-merge/merge-gate-acceptance.json", JSON.stringify(accepted));
    await put(f.workspace, matrix, [
      "| Capability / claim | Primary scenario | Verification contour | gate_status | closure_state | Later passport |",
      "| --- | --- | --- | --- | --- | --- |",
      `| \`${protocol}\`: priority | \`SCN-002-workspace-task-core\` | local | pass | accepted_local_fixed | \`${evidence}\` | extra |`
    ].join("\n"));
    await seal(f);
    assert.equal((await read()).status, "unavailable", "ambiguous matrix columns cannot silently disappear");
    await put(f.workspace, matrix, [
      "| Capability / claim | Primary scenario | Verification contour | gate_status | closure_state | Later passport |",
      "| --- | --- | --- | --- | --- | --- |",
      `| An unrelated claim | \`SCN-002-workspace-task-core\` | local | pass | accepted_local_fixed | \`${evidence}\` and \`${protocol}\` |`
    ].join("\n"));
    await seal(f);
    assert.ok((await read()).gaps.includes(`priority_matrix_row_missing:${protocol}`));
    await put(f.workspace, matrix, [
      "| Capability / claim | Primary scenario | Verification contour | gate_status | closure_state | Later passport |",
      "| --- | --- | --- | --- | --- | --- |",
      `| \`${protocol}\`: priority | \`SCN-002-workspace-task-core\` | local | pass | accepted_local_fixed | \`${evidence}\` |`
    ].join("\n"));
    accepted.receipts = [];
    gate.checks = [];
    gate.gate_hash = sha(JSON.stringify({ checks: [], acceptance_refs: [] }));
    accepted.gate_hash = gate.gate_hash;
    await put(f.runtime, "07-merge/merge-gate.json", JSON.stringify(gate));
    await put(f.runtime, "07-merge/merge-gate-acceptance.json", JSON.stringify(accepted));
    await seal(f);
    assert.ok((await read()).gaps.includes(`criterion_final_binding_missing:${protocol}:AC-001:CHK-LOCAL`));
    await assert.rejects(() => checkCaseAcceptance({ evalRoot: f.root, execution: "e2e", result: f.result, policy: { ...v2, checker: "typo" } }), /unsupported case acceptance policy/);
  } finally { await rm(f.root, { recursive: true, force: true }); }
});
