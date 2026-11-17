import path from "node:path";
import { stat } from "node:fs/promises";
import { readJson } from "../json-file.mjs";
import { hashJson } from "../execution/journal-hash.mjs";
import { errorRecord } from "../operation-errors.mjs";
import { contractProfile } from "../execution-contract.mjs";
import { candidateMatches } from "../evidence/run-candidate.mjs";
import { finalJudge } from "./final-assessment.mjs";
import { judgeRootForCandidate } from "./verdict-path.mjs";
import { assertJudgeProfileBinding } from "./judge-receipt.mjs";
import { observeJudgeCleanup } from "./cleanup.mjs";

async function exists(file) { try { await stat(file); return true; } catch { return false; } }
const cleanupFailure = (error, diagnostic) => ({
  ...error.details?.cleanup, status: error.details?.cleanup?.status === "failed" ? "failed" : "unknown", error: diagnostic,
});

/** Reuse only report-bound evidence; this path cannot dispatch a Judge. */
export async function observeRetainedFinalVerdict({ root, manifest, results, judgeNativeContracts }) {
  const file = path.join(root, "reports", "report.json");
  if (!(await exists(file))) return null;
  const previous = await readJson(file);
  const { file: _file, immutable_hash, ...content } = previous.candidate ?? {};
  if (previous.run_id !== manifest.run_id || !immutable_hash || hashJson(content) !== immutable_hash || !candidateMatches(previous.candidate, manifest, results)) return null;
  const candidate = previous.candidate;
  let judge = previous.judge?.candidate_sha256 === immutable_hash ? previous.judge : null;
  let judgeError, judgeCleanup = null, retainedJudgeStatus = previous.judge_status;
  if (judge && manifest.execution_contract) {
    try { assertJudgeProfileBinding(judge, contractProfile(manifest.execution_contract, manifest.profile.judge.profile_id)); }
    catch (error) { judge = null; judgeError = errorRecord(error); }
  }
  judgeError ??= previous.judge_error ?? null;
  if (judge) {
    try {
      judgeCleanup = await observeJudgeCleanup(judgeRootForCandidate(root, candidate), judge, { nativeContracts: judgeNativeContracts });
      judgeError = null; retainedJudgeStatus = "completed";
    } catch (error) {
      judgeError = errorRecord(error); retainedJudgeStatus = "failed";
      judgeCleanup = cleanupFailure(error, judgeError);
    }
  }
  return { candidate, judge, judgeError, judgeCleanup, retainedJudgeStatus };
}

/** Resolve the scored verdict; a missing result can require fresh dispatch authority. */
export async function resolveFinalVerdict({ root, manifest, loaded, candidate, permits, results, historyEvents, authorizeFinalization, judgeNativeContracts }) {
  const judgeRoot = judgeRootForCandidate(root, candidate);
  const file = path.join(judgeRoot, "result.json"), profileId = manifest.profile.judge.profile_id;
  if (authorizeFinalization && !(await exists(file))) await authorizeFinalization();
  let judge = null, judgeError = null, judgeCleanup = null;
  try {
    judge = await (await exists(file) ? readJson(file) : finalJudge({ root, runId: manifest.run_id, manifest, loaded, profileId, candidate, permits, results, historyEvents }));
    if (manifest.execution_contract) assertJudgeProfileBinding(judge, contractProfile(manifest.execution_contract, profileId));
    if (judge.candidate_sha256 !== candidate.immutable_hash || judge.profile_id !== profileId) throw Object.assign(new Error("Retained Judge differs from this candidate/profile"), { code: "judge_evidence_mismatch" });
    judgeCleanup = await observeJudgeCleanup(judgeRoot, judge, { nativeContracts: judgeNativeContracts });
  } catch (error) {
    judgeError = errorRecord(error);
    judge ??= error.details?.retained_verdict?.verdict ?? null;
    judgeCleanup = cleanupFailure(error, judgeError);
  }
  return { judge, judgeError, judgeCleanup };
}
