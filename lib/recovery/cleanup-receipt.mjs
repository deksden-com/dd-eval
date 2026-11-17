import path from "node:path";
import { readFile } from "node:fs/promises";
import { sha256, readEvents } from "../runner-events.mjs";
import { readJson } from "../json-file.mjs";
import { withRunnerLock } from "../runner-lock.mjs";
import { assertEvalAdmission } from "../execution/admission.mjs";
import { runResultRevision, storedExecutionResults } from "../execution/result-projection.mjs";
import { isTerminalRunState } from "../completion-scope.mjs";
import { failureCaptureState } from "./capture-evidence.mjs";
import { observeExecutionCleanup } from "./execution-cleanup.mjs";
import { hasObservedRetirementProof, statusCleanupState } from "./cleanup-observation.mjs";
import { retainedFinalJudgeCleanup } from "../judge/retained-cleanup.mjs";
import { assertJudgeVerdict, assertJudgeCleanup } from "../judge/cleanup.mjs";

const fail = (message, code) => { throw Object.assign(new Error(message), { code }); };

/** Recognition of already coherent terminal cleanup. No writes, control
 * reconciliation, capture ingestion, or paid Judge dispatch. */
export async function runnerCleanupReceipt({ evalRoot, expectedManifestSha256, signal, detailed = false }) {
  const root = path.resolve(evalRoot), eventsFile = path.join(root, "events.jsonl");
  return withRunnerLock(`${root}.lifecycle`, async () => {
    signal?.throwIfAborted();
    const bytes = await readFile(path.join(root, "manifest.json"));
    if (sha256(bytes) !== expectedManifestSha256) fail("Cleanup manifest changed", "runner_definition_drift");
    const manifest = JSON.parse(bytes), events = await readEvents(eventsFile);
    assertEvalAdmission(events);
    const revision = runResultRevision(events, manifest), results = storedExecutionResults(events, manifest);
    const pending = reason => detailed ? { root, run_id: manifest.run_id, cleanup_state: "pending", recognition: "pending", reason } : null;
    const terminal = events.findLast(event => event.runid === manifest.run_id && event.type === "dev.dd.eval.completed" && event.data?.result_revision === revision);
    if (!terminal || !isTerminalRunState(terminal.data.state) || results.some(result => !["candidate_ready", "failed", "cancelled"].includes(result.state))
      || (await Promise.all(results.map(result => failureCaptureState(root, manifest, result, signal)))).some(state => state !== "ready")) return pending("terminal_projection_pending");
    // A late snapshot can become readable before it has been ingested into the
    // retained failure and report. Recognition is read-only and cannot perform
    // that ingestion on behalf of the cleanup owner.
    if (results.some(result => result.state === "failed" && result.recovery?.capture_error)) return pending("capture_ingestion_pending");
    const report = await readJson(path.join(root, "reports", "report.json"));
    if (statusCleanupState({ report, events, manifest, results, revision }) !== "settled") return pending("report_projection_pending");
    const observed = await observeExecutionCleanup(root, manifest, results, { signal });
    const retiredScope = await hasObservedRetirementProof(root, manifest, observed);
    if (observed.pending && !retiredScope) return pending("physical_settlement_unconfirmed");
    const judge = await retainedFinalJudgeCleanup(root, manifest, results);
    if (report.judge_status === "completed" && !judge) return pending("judge_cleanup_unconfirmed");
    if (judge) {
      // A validated all-role physical retirement proof is not a native clean
      // verdict. Keep content custody, without requiring a lost stop ACK.
      if (retiredScope) await assertJudgeVerdict(judge.root, judge.verdict);
      else await assertJudgeCleanup(judge.root, judge.verdict);
    }
    signal?.throwIfAborted();
    // Receipt priority does not revive a spent observer or change a generation.
    if (runResultRevision(await readEvents(eventsFile), manifest) !== revision) return pending("result_revision_changed");
    return { root, run_id: manifest.run_id, state: report.state, execution_state: report.execution_state, cleanup_state: "settled", cleanup_observation: { capture: "ready" }, judge_status: report.judge_status, executions: results };
  }, { signal, timeoutMs: 120_000 });
}
