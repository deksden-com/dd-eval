import { mkdir, readdir, stat } from "node:fs/promises";
import path from "node:path";
import { observedCompletionScope } from "../completion-scope.mjs";
import { stages } from "../entry-pack.mjs";
import { readJson } from "../json-file.mjs";
import { hashJson, readEvents, writeJsonAtomic } from "../runner-events.mjs";
import { withRunnerLock } from "../runner-lock.mjs";
import { latestObservedStage } from "./stage-attribution.mjs";
import { isTechnicalNote } from "../technical-notes.mjs";

const fail = (message, code = "validation") => { const error = new Error(message); error.code = code; throw error; };
const now = () => new Date().toISOString();
async function exists(file) { try { await stat(file); return true; } catch { return false; } }

function candidateExecution(result, flowContour = stages) {
  return {
    execution: result.execution,
    stage: result.stage ?? null,
    ...(result.last_completed_stage !== undefined ? { last_completed_stage: result.last_completed_stage, pending_stage_entry: result.pending_stage_entry ?? null } : {}),
    run_id: result.run_id ?? null,
    session_id: result.session_id ?? null,
    outcome: result.state,
    reached_stage: result.lifecycle?.status ? latestObservedStage(result.lifecycle.status, result.stage, flowContour) : result.state === "candidate_ready" ? result.stage ?? null : null,
    execution_operation_id: result.execution_operation_id ?? null,
    failure: result.state === "failed" ? { code: result.code ?? "execution_failed", message: result.error ?? null } : null,
    evidence_completeness: result.candidate?.manifest_sha256 ? "checkpointed" : result.attempt ? "partial" : "missing",
    checkpoint: result.candidate ?? null,
    ...(result.completion_scope ? { completion_scope: result.completion_scope } : {}),
    ...(result.experiment_conformance?.contract_sha256 ? { experiment_conformance: result.experiment_conformance } : {}),
    incomplete_evidence: result.incomplete_evidence ?? null,
    recovery: result.recovery ?? null,
    ...(result.materialization ? { materialization: result.materialization } : {}),
    ...(result.case_acceptance ? { case_acceptance: { file: result.case_acceptance.file, sha256: result.case_acceptance.sha256, status: result.case_acceptance.receipt.status } } : {})
  };
}

/**
 * Build an immutable candidate projection from retained execution results.
 * @param {object} input RUN identity, manifest, results and optional subject-history hash.
 * @returns {Promise<object>} Candidate including its content hash.
 */
export async function buildRunCandidate({ runId, manifest, results, historySha256 = null }) {
  const executions = results.map(result => candidateExecution(result, manifest.flow?.contour ?? stages));
  const candidate = {
    schema_id: "dd-eval/run-candidate@2",
    run_id: runId,
    manifest_sha256: hashJson(manifest),
    outcome: results.every((result) => result.state === "candidate_ready") ? "complete" : "incomplete",
    executions,
    ...(manifest.profile?.schema_id === "dd-eval/run-profile@2" ? { completion_scope: results.map(result => ({ execution: result.execution, ...observedCompletionScope(manifest.executions.find(item => item.id === result.execution), result) })) } : {}),
    ...(historySha256 ? { subject_history_sha256: historySha256 } : {}),
    frozen_at: now()
  };
  if (manifest.profile?.schema_id === "dd-eval/run-profile@2") candidate.schema_id = "dd-eval/run-candidate@3";
  candidate.immutable_hash = hashJson(candidate);
  return candidate;
}

/**
 * Compare candidate identity and projected executions with the retained run.
 * @param {object} candidate Previously frozen candidate.
 * @param {object} manifest EVAL manifest.
 * @param {object[]} results Retained execution results.
 * @returns {boolean} Whether identity and execution projection match.
 */
export function candidateMatches(candidate, manifest, results) {
  if (candidate?.schema_id !== (manifest.profile?.schema_id === "dd-eval/run-profile@2" ? "dd-eval/run-candidate@3" : "dd-eval/run-candidate@2") || candidate.run_id !== manifest.run_id || candidate.manifest_sha256 !== hashJson(manifest)) return false;
  const expected = results.map(result => candidateExecution(result, manifest.flow?.contour ?? stages)).sort((left, right) => left.execution.localeCompare(right.execution));
  const actual = (candidate.executions ?? []).map(value => ({ ...value, execution_operation_id: value.execution_operation_id ?? null })).sort((left, right) => left.execution.localeCompare(right.execution));
  return hashJson(actual) === hashJson(expected);
}

/**
 * Freeze or reuse a candidate while holding the candidate lock.
 * @param {object} input EVAL root, manifest and retained results.
 * @returns {Promise<object>} Candidate and creation/revision status.
 */
export async function frozenCandidate({ root, manifest, results }) {
  return withRunnerLock(`${root}.candidate`, () => freezeCandidateLocked({ root, manifest, results }));
}

/**
 * Freeze or reuse a candidate; the caller must already hold the candidate lock.
 * @param {object} input EVAL root, manifest, retained results and optional events read under the journal lock.
 * @returns {Promise<object>} Candidate and creation/revision status.
 */
export async function freezeCandidateLocked({ root, manifest, results, events: lockedEvents }) {
  const file = path.join(root, "candidate.json");
  const existsAlready = await exists(file);
  const events = lockedEvents ?? await readEvents(path.join(root, "events.jsonl"));
  const historySha256 = manifest.evidence_contract === "dd-eval/evaluator-evidence@2" ? hashJson(subjectHistoryEvents(events, manifest)) : null;
  const matches = candidate => candidateMatches(candidate, manifest, results) && (!historySha256 || candidate.subject_history_sha256 === historySha256);
  if (existsAlready) {
    const candidate = await readJson(file);
    const { immutable_hash, ...content } = candidate;
    if (hashJson(content) !== immutable_hash) fail("candidate checksum mismatch", "candidate_revision_invalid");
    if (!matches(candidate)) {
      const retained = [candidate];
      const revisionsRoot = path.join(root, "candidate-revisions");
      const revisions = await readdir(revisionsRoot).catch(error => { if (error.code === "ENOENT") return []; throw error; });
      for (const name of revisions.filter(name => /^[a-f0-9]{64}\.json$/.test(name))) {
        const revision = await readJson(path.join(revisionsRoot, name));
        const { immutable_hash, ...content } = revision;
        if (hashJson(content) !== immutable_hash || name !== `${immutable_hash}.json`) fail("candidate revision checksum mismatch", "candidate_revision_invalid");
        if (matches(revision)) return { candidate: { file: path.join(revisionsRoot, name), ...revision }, created: false, revised: true };
        retained.push(revision);
      }
      if (!events.some(event => ["dev.dd.eval.operation.completed", "dev.dd.eval.operation.failed"].includes(event.type) && /:launch:(recover:|reconcile$)/.test(event.data?.operation_id ?? ""))) fail("existing candidate does not match completed executions", "candidate_revision_unauthorized");
      const next = await buildRunCandidate({ runId: manifest.run_id, manifest, results, historySha256 });
      const lastPublished = events.findLast(event => event.type === "dev.dd.eval.candidate.frozen" && retained.some(value => value.immutable_hash === event.data?.candidate_sha256));
      next.parent_candidate_sha256 = lastPublished?.data.candidate_sha256 ?? retained.sort((a, b) => a.frozen_at.localeCompare(b.frozen_at)).at(-1).immutable_hash;
      delete next.immutable_hash;
      next.immutable_hash = hashJson(next);
      const revision = path.join(root, "candidate-revisions", `${next.immutable_hash}.json`);
      await mkdir(path.dirname(revision), { recursive: true });
      if (!(await exists(revision))) await writeJsonAtomic(revision, next);
      return { candidate: { file: revision, ...next }, created: true, revised: true };
    }
    return { candidate: { file, ...candidate }, created: false };
  }
  const candidate = await buildRunCandidate({ runId: manifest.run_id, manifest, results, historySha256 });
  await writeJsonAtomic(file, candidate);
  return { candidate: { file, ...candidate }, created: true };
}

/**
 * Select subject execution history without technical notes or unrelated operations.
 * @param {object[]} events Retained EVAL events.
 * @param {object} manifest EVAL identity and executions.
 * @returns {object[]} Events included in the candidate's subject-history hash.
 */
export function subjectHistoryEvents(events, manifest) {
  const prefixes = manifest.executions.map(({ id }) => `${manifest.run_id}:${id}:launch`);
  return events.filter(event => !isTechnicalNote(event) && (event.type === "dev.dd.eval.execution.failed" && manifest.executions.some(({ id }) => id === event.executionid)
    || prefixes.some(prefix => event.data?.operation_id === prefix || event.data?.operation_id?.startsWith(`${prefix}:recover:`))));
}
