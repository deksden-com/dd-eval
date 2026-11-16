import path from "node:path";
import { stat } from "node:fs/promises";
import { readJson } from "../json-file.mjs";
import { hashJson } from "../runner-events.mjs";
import { contractProfile } from "../execution-contract.mjs";
import { candidateMatches } from "../evidence/run-candidate.mjs";

const fail = (message, code) => { throw Object.assign(new Error(message), { code }); };
async function exists(file) { try { await stat(file); return true; } catch { return false; } }

/** Locate a Judge cleanup target only when retained evidence proves ownership. */
export async function retainedFinalJudgeCleanup(root, manifest, results) {
  // Interaction, qualification and supplemental attempts retain separate owners;
  // ordinary EVAL cleanup never discovers or starts their runtimes.
  const reportFile = path.join(root, "reports", "report.json");
  if (!manifest.profile?.judge?.enabled || !await exists(reportFile)) return null;
  const report = await readJson(reportFile), candidate = report.candidate;
  if (!candidate) return null;
  const { file, immutable_hash, ...content } = candidate;
  if (report.run_id !== manifest.run_id || hashJson(content) !== immutable_hash || !candidateMatches(candidate, manifest, results)
    || ![path.join(root, "candidate.json"), path.join(root, "candidate-revisions", `${immutable_hash}.json`)].includes(file)) fail("Judge cleanup candidate is not owned by this EVAL", "judge_evidence_mismatch");
  const judgeRoot = file === path.join(root, "candidate.json") ? path.join(root, "judge") : path.join(root, "judge", "revisions", immutable_hash);
  if (!await exists(path.join(judgeRoot, "result.json"))) return null;
  const verdict = await readJson(path.join(judgeRoot, "result.json"));
  // Cleanup is ownership recovery, not admission for a new model call.
  let profile = verdict.profile_snapshot ?? (manifest.execution_contract ? contractProfile(manifest.execution_contract, manifest.profile.judge.profile_id) : null);
  if (!profile) {
    const state = await readJson(path.join(judgeRoot, "daemon", "daemon.json"));
    const adapter = path.basename(state.config?.runtime_owner?.adapter_executable ?? "");
    const harness = { "dd-codex.mjs": "codex-desktop", "dd-zcode.mjs": "zcode-acp", "dd-grok.mjs": "grok-acp", "dd-agy.mjs": "antigravity-cli", "dd-opencode.mjs": "opencode-server", "dd-droid.mjs": "droid-cli" }[adapter];
    if (!harness) fail("Legacy Judge cleanup has no retained adapter identity", "judge_cleanup_ownership_unknown");
    profile = { id: verdict.profile_id, harness };
  }
  if (verdict.profile_id !== profile.id || verdict.candidate_sha256 !== immutable_hash) fail("Judge cleanup verdict differs from its retained candidate/profile", "judge_evidence_mismatch");
  return { root: judgeRoot, verdict, profile };
}
