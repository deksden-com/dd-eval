import { createHash } from "node:crypto";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { cleanupSidecars } from "../eval-retirement.mjs";
import { appendEvent, readEvents } from "../runner-events.mjs";
import { commandJson } from "../process-json.mjs";
import { errorRecord, isConclusiveManagedFailure, isObservationLoss } from "../operation-errors.mjs";
import { assertJudgeCleanup, assertJudgeVerdict } from "../judge/cleanup.mjs";
import { retainedFinalJudgeCleanup, retryFinalJudgeCleanup } from "../judge/retained-cleanup.mjs";
import { withRunnerLock } from "../runner-lock.mjs";
import { loadCase } from "../cases/load-case.mjs";
import { evalRuntimeEnv, runtimeBin } from "../execution/runtime-environment.mjs";
import { storedExecutionResults } from "../execution/result-projection.mjs";
import { assertEvalAdmission, validateControlResumeInput } from "../execution/admission.mjs";
import { finalizeRunProjection } from "../evidence/finalization.mjs";
import { observeExecutionCleanup } from "./execution-cleanup.mjs";
import { hasRetainedRetirementProof } from "./cleanup-observation.mjs";
import { executionSnapshotBinding } from "./snapshot-observation.mjs";
import { recoverExecution } from "./execution-recovery.mjs";

const fail = (message, code = "validation") => { throw Object.assign(new Error(message), { code }); };
const sha256 = value => createHash("sha256").update(value).digest("hex");
const now = () => new Date().toISOString();
async function exists(file) { try { await stat(file); return true; } catch { return false; } }

/** Reconcile retained failed execution and Judge cleanup without launching work. */
export async function runnerCleanup({ evalRoot, requestId = null, expectedManifestSha256 = null }) {
  const root = path.resolve(evalRoot);
  return withRunnerLock(`${root}.lifecycle`, async () => {
    const bytes = await readFile(path.join(root, "manifest.json"));
    if (expectedManifestSha256 !== null && sha256(bytes) !== expectedManifestSha256) fail("Cleanup manifest changed", "runner_definition_drift");
    const events = await readEvents(path.join(root, "events.jsonl"));
    assertEvalAdmission(events); // A captured operator journal remains frozen; reconcile its runtime scope separately.
    const manifest = JSON.parse(bytes);
    let results = storedExecutionResults(events, manifest);
    const stranded = requestId === null ? [] : (await Promise.all(results.filter(result => result.state === "awaiting_provider").map(async result =>
      await exists(path.join(root, "executions", result.execution, "managed-runtime.json")) ? result : null))).filter(Boolean);
    if (stranded.length) {
      validateControlResumeInput({ requestId, waitMs: 0 });
      const loaded = await loadCase(manifest.case_id);
      for (const result of stranded) {
        const execution = manifest.executions.find(item => item.id === result.execution);
        // Reuse the retained engine/baseline/controller ownership checks and
        // terminal-only dispatch fence. A live unknown outcome is not failure.
        try { await recoverExecution({ root, events, manifest, execution, loaded, blueprint: {}, profile: manifest.subject_profile, terminalOnly: true }); }
        catch (error) {
          if (error.code === "reconcile_not_terminal" || isObservationLoss(error)) continue;
          if (!isConclusiveManagedFailure(error)) throw error;
          await appendEvent(path.join(root, "events.jsonl"), { source: "dd-eval://runner", runId: manifest.run_id, executionId: execution.id, traceId: manifest.run_id,
            type: "dev.dd.eval.execution.failed", data: { ...result, ...errorRecord(error), state: "failed", error: error.message, driver: { controller: error.details.controller }, finished_at: now() } });
        }
      }
      results = storedExecutionResults(await readEvents(path.join(root, "events.jsonl")), manifest);
    }
    const judgeTarget = await retainedFinalJudgeCleanup(root, manifest, results);
    let judgeNativeContracts;
    if (!results.some(result => result.state === "failed") && !judgeTarget) fail("Cleanup requires a retained failed execution or Judge attempt", "cleanup_not_required");
    if (requestId !== null) {
      validateControlResumeInput({ requestId, waitMs: 0 });
      if (judgeTarget) {
        const { inventory, physical } = await observeExecutionCleanup(root, manifest, results);
        const retiredScope = inventory && !physical?.binding_unconfirmed
          && await hasRetainedRetirementProof({ root, manifest, live: { inventory }, maintenance: await cleanupSidecars(root) });
        try {
          if (retiredScope) await assertJudgeVerdict(judgeTarget.root, judgeTarget.verdict);
          else await assertJudgeCleanup(judgeTarget.root, judgeTarget.verdict);
        }
        catch (error) {
          if (error.code !== "judge_cleanup_unconfirmed") throw error;
          const cleanup = await retryFinalJudgeCleanup({ target: judgeTarget, root, manifest, results });
          judgeNativeContracts = { nativeShutdownConfirmed: cleanup.validateShutdown };
        }
      }
      for (const result of results.filter(item => item.state === "failed")) {
        const attempt = path.join(root, "executions", result.execution), project = path.join(attempt, "project"), home = path.join(attempt, "dd-flow-home");
        const bindingFile = path.join(attempt, "managed-runtime.json");
        if (!(await exists(bindingFile))) continue;
        const { binding: managed } = await executionSnapshotBinding(root, result.execution, result);
        const scope = ["--run", managed.run_id, "--project-root", project], options = { cwd: project, env: evalRuntimeEnv(home, manifest) };
        const status = await commandJson(runtimeBin(home), ["run", "control", "status", ...scope], options);
        if (status.settled === true) continue;
        if (!status.control?.current || !status.control.control_id) fail("Cleanup requires an existing RUN control", "run_control_missing");
        await commandJson(runtimeBin(home), ["run", "control", "reconcile", ...scope, "--control-id", status.control.control_id, "--request-id", sha256(JSON.stringify([manifest.run_id, result.execution, requestId]))], options);
      }
    }
    const finalized = await finalizeRunProjection({ root, manifest, loaded: null, cleanupOnly: true, judgeNativeContracts });
    return { root, run_id: manifest.run_id, execution_state: finalized.execution_state, cleanup_state: finalized.cleanup_state, cleanup_observation: finalized.cleanup_observation, state: finalized.state, judge_status: finalized.report.judge_status, executions: finalized.results };
  });
}
