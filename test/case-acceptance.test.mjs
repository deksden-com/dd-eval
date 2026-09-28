import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, mkdir, readFile, rm, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { checkCaseAcceptance, snapshotTreeHash } from "../lib/case-acceptance.mjs";

const sha = value => createHash("sha256").update(value).digest("hex");
const policy = { checker: "task-priority@1", case_id: "sdlc-eval-2026-summer-task-priority" };
const scenario = ".memory-bank/scenarios/SCN-002-workspace-task-core.md";
const matrix = ".memory-bank/plans/verification-matrix.md";
const plan = ".memory-bank/protocol/PRT-007-task-priority-levels/plan.json";
const evidence = ".memory-bank/protocol/PRT-007-task-priority-levels/evidence/local-proof.md";
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
