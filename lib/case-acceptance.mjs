import { createHash } from "node:crypto";
import { lstat, readFile, realpath, readdir, stat } from "node:fs/promises";
import fs from "node:fs";
import path from "node:path";

const digest = bytes => createHash("sha256").update(bytes).digest("hex");
const inside = (root, target) => target === root || target.startsWith(root + path.sep);
export function snapshotTreeHash(root) {
  const hash = createHash("sha256");
  const visit = (dir, relative) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const file = path.join(dir, entry.name), name = path.join(relative, entry.name);
      if (entry.isDirectory()) visit(file, name);
      else if (entry.isFile()) { hash.update(name); hash.update(fs.readFileSync(file)); }
      else if (entry.isSymbolicLink()) { hash.update(name); hash.update("symlink:" + fs.readlinkSync(file)); }
    }
  };
  visit(root, "");
  return hash.digest("hex");
}

async function ownedFile(root, relative) {
  if (typeof relative !== "string" || !relative || path.isAbsolute(relative) || relative.split(/[\\/]/).includes("..")) throw new Error("invalid snapshot-relative evidence path");
  const file = path.resolve(root, relative);
  if ((await lstat(file)).isSymbolicLink()) throw new Error("symlinked evidence file is not a frozen document");
  const actualRoot = await realpath(root), actual = await realpath(file);
  if (!inside(actualRoot, actual) || !(await stat(actual)).isFile()) throw new Error("evidence path escaped the frozen snapshot");
  const bytes = await readFile(actual);
  return { text: bytes.toString("utf8"), sha256: digest(bytes), path: relative };
}

async function optionalFile(root, relative) {
  try { return await ownedFile(root, relative); }
  catch (error) { if (error.code === "ENOENT") return null; throw error; }
}

const scn = ".memory-bank/scenarios/SCN-002-workspace-task-core.md";
const matrix = ".memory-bank/plans/verification-matrix.md";
const plan = ".memory-bank/protocol/PRT-007-task-priority-levels/plan.json";

/** Mechanical, case-local facts only. Semantic adequacy remains with Final Judge. */
export async function checkCaseAcceptance({ evalRoot, execution, result, policy }) {
  const base = { schema_id: "dd-eval/case-acceptance@1", checker: "task-priority@1", definition: policy };
  if (policy?.checker !== "task-priority@1" || policy?.case_id !== "sdlc-eval-2026-summer-task-priority" || result.state !== "candidate_ready" || result.stage !== "merge") {
    return { ...base, execution, status: "not_applicable", facts: {}, gaps: [] };
  }
  const checkpoint = result.candidate;
  try {
    const boundaries = await realpath(path.join(evalRoot, "executions", execution, "boundaries"));
    const snapshot = await realpath(path.dirname(checkpoint.manifest));
    if (!inside(boundaries, snapshot) || path.basename(checkpoint.manifest) !== "snapshot.json") throw new Error("candidate checkpoint is outside owned boundaries");
    const manifest = await ownedFile(snapshot, "snapshot.json");
    if (manifest.sha256 !== checkpoint.manifest_sha256) throw new Error("candidate snapshot manifest checksum differs");
    const data = JSON.parse(manifest.text);
    if (data.schema_id !== "dd-flow/eval-run-snapshot@5" || data.purpose !== "candidate" || data.stage_entry !== null || data.run_id !== result.run_id) throw new Error("candidate snapshot identity differs");
    const workspace = path.join(snapshot, "workspace");
    if (!data.workspace?.sha256 || snapshotTreeHash(workspace) !== data.workspace.sha256 || !data.runtime_sha256 || snapshotTreeHash(path.join(snapshot, "runtime")) !== data.runtime_sha256) throw new Error("candidate snapshot payload checksum differs");
    const runtime = path.join(snapshot, "runtime", "projects", data.project_id, "runs", data.run_id);
    const gaps = [], consumed = [manifest];
    const scenario = await optionalFile(workspace, scn);
    if (!scenario) gaps.push("scenario_missing");
    else consumed.push(scenario);
    const status = scenario?.text.match(/^execution_status:\s*['"]?([a-z_]+)['"]?\s*$/m)?.[1] ?? null;
    if (status !== "accepted_local") gaps.push("scenario_not_accepted_local");
    const verification = await optionalFile(workspace, matrix);
    if (!verification) gaps.push("verification_matrix_missing");
    else consumed.push(verification);
    const row = verification?.text.split(/\r?\n/).find(line => line.startsWith("|") && line.includes("PRT-007-task-priority-levels") && line.includes("SCN-002-workspace-task-core"));
    if (!row) gaps.push("priority_matrix_row_missing");
    const columns = row?.split("|").slice(1, -1).map(value => value.trim()) ?? [];
    if (row && (columns.length < 12 || !/\bpass\b/.test(columns[6]) || !/accepted_local/.test(columns[7]))) gaps.push("priority_matrix_not_accepted");
    const evidenceRef = columns[10]?.match(/\.?memory-bank\/[^\s`|)]+\.md/)?.[0] ?? null;
    let curated = null;
    if (!evidenceRef) gaps.push("curated_evidence_ref_missing");
    else {
      curated = await optionalFile(workspace, evidenceRef);
      if (!curated) gaps.push("curated_evidence_missing");
      else consumed.push(curated);
    }
    const planned = await optionalFile(workspace, plan);
    if (!planned) gaps.push("priority_plan_missing");
    else consumed.push(planned);
    const declared = planned ? JSON.parse(planned.text).acceptance : null;
    if (!Array.isArray(declared) || !declared.length) gaps.push("priority_acceptance_missing");
    const receipts = [];
    for (const stage of ["05-code", "06-code-review"]) {
      const checks = path.join(runtime, stage, "checks");
      for (const name of await readdir(checks).catch(error => error.code === "ENOENT" ? [] : Promise.reject(error))) {
        if (!/^RCP-\d+$/.test(name)) continue;
        const relative = path.join(stage, "checks", name, "receipt.json");
        const item = await optionalFile(runtime, relative);
        if (item) { consumed.push({ ...item, path: path.join("runtime", relative) }); receipts.push(JSON.parse(item.text)); }
      }
    }
    const byCheck = new Map();
    for (const receipt of receipts.sort((a, b) => String(a.finished_at ?? "").localeCompare(String(b.finished_at ?? "")))) {
      if (receipt.scope === "aggregate" && typeof receipt.declaration_id === "string") byCheck.set(receipt.declaration_id, receipt);
    }
    const criteria = [];
    for (const item of Array.isArray(declared) ? declared : []) {
      const refs = Array.isArray(item.check_refs) ? item.check_refs : [];
      const proof = Array.isArray(item.proof_limits) ? item.proof_limits : [];
      if (!item.criterion_id || !refs.length || !proof.length || !Array.isArray(item.expected_evidence) || !item.expected_evidence.length) gaps.push(`criterion_contract_incomplete:${item.criterion_id ?? "unknown"}`);
      const checks = refs.map(id => {
        const receipt = byCheck.get(id);
        if (!receipt || receipt.status !== "passed" || !receipt.input_hash || !receipt.verification_epoch) gaps.push(`criterion_check_unproven:${item.criterion_id ?? "unknown"}:${id}`);
        return { id, receipt_id: receipt?.id ?? null, status: receipt?.status ?? "missing", input_hash: receipt?.input_hash ?? null };
      });
      criteria.push({ id: item.criterion_id, checks, proof_limits: proof, expected_evidence: item.expected_evidence });
    }
    const content = Object.fromEntries(consumed.map(item => [item.path, item.sha256]));
    return { ...base, execution, status: gaps.length ? "failed" : "passed", checkpoint_manifest_sha256: manifest.sha256, facts: { scenario_status: status, matrix_row: row ?? null, curated_evidence_ref: evidenceRef, criteria, consumed_sha256: content }, gaps };
  } catch (error) {
    return { ...base, execution, status: "unavailable", checkpoint_manifest_sha256: checkpoint?.manifest_sha256 ?? null, facts: {}, gaps: [], evidence_error: { code: error.code ?? "checkpoint_invalid", message: error.message } };
  }
}
