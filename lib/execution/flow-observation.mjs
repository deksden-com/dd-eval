import { commandJson } from "../process-json.mjs";
import { runtimeEnv } from "./runtime-environment.mjs";
import { acceptedPackVisit } from "../flow-boundaries.mjs";

/** Reconcile the retained RUN ID and stage status with the dd-flow runtime. */
export async function reconcileFlow({ projectRoot, runtimeRoot, expectedStage, runId, onTechnicalNotes = async () => {} }) {
  const env = runtimeEnv(runtimeRoot); const bin = "dd-flow";
  let resolvedRunId = runId;
  if (!resolvedRunId) {
    const listed = await commandJson(bin, ["run", "list", "--project-root", projectRoot], { cwd: projectRoot, env });
    const runs = listed.runs ?? listed.items ?? listed.data ?? [];
    if (!Array.isArray(runs) || runs.length !== 1 || typeof runs[0]?.id !== "string") throw Object.assign(new Error("bootstrap lifecycle did not yield exactly one RUN"), { code: "flow_reconciliation_failed" });
    resolvedRunId = runs[0].id;
  }
  const status = await commandJson(bin, ["run", "status", resolvedRunId, "--project-root", projectRoot], { cwd: projectRoot, env });
  await onTechnicalNotes(status.technical_notes ?? []);
  delete status.technical_notes;
  const stages = status.index?.stage_runs ?? status.run?.index?.stage_runs ?? [];
  const stage = status.index?.pack_state ? acceptedPackVisit(status, expectedStage) : Array.isArray(stages) ? stages.findLast((item) => item?.stage === expectedStage) : null;
  return { run_id: resolvedRunId, status, stage_status: stage?.status ?? null, ...(status.index?.pack_state && stage ? { stage_visit: { stage:stage.stage, visit:stage.visit, attempt:stage.attempt, outcome:stage.outcome, result:stage.result } } : {}) };
}

/** Collect usage and sessions independently, retaining partial observation failures. */
export async function collectFlowStatistics({ projectRoot, runtimeRoot, runId }) {
  const bin = "dd-flow"; const env = runtimeEnv(runtimeRoot);
  const observed = await Promise.allSettled([
    commandJson(bin, ["stat", "usage", "--run", runId, "--project-root", projectRoot], { cwd: projectRoot, env }),
    commandJson(bin, ["stat", "run", "sessions", "ls", "--run", runId, "--project-root", projectRoot], { cwd: projectRoot, env })
  ]);
  return { collected_at: new Date().toISOString(), usage: observed[0].status === 'fulfilled' ? observed[0].value : null,
    sessions: observed[1].status === 'fulfilled' ? observed[1].value : null,
    ...(observed.some(item => item.status === 'rejected') ? { observation: { unavailable: true, reason: 'statistics_observation_unavailable' } } : {}) };
}

const fail = (message, code = "validation") => { const error = new Error(message); error.code = code; throw error; };

/** Resolve registered workspace and RUN roots from retained flow status. */
export function restoredRoots(lifecycle, projectRoot, runtimeRoot) {
  const run = lifecycle.status?.run ?? lifecycle.status?.index?.run;
  if (!run?.workspace_root || !run?.run_root) fail("flow status does not expose registered workspace roots", "flow_reconciliation_failed");
  return { project: projectRoot, workspace: run.workspace_root, run: run.run_root, runtime: runtimeRoot };
}
/** Read the persisted stage-session policy, defaulting to same-session handoff. */
export function stageSessionMode(lifecycle) {
  // `dd-flow run status` exposes the persisted profile on `index`, whereas
  // the convenience `run` projection contains only its public summary.
  // Read both shapes so the runner obeys the actual run-level handoff policy.
  const profile = lifecycle.status?.index?.execution_profile ?? lifecycle.status?.run?.execution_profile;
  return profile?.settings?.stage_session_mode ?? "same_session";
}

/** Find the retained record for a stage, or null when it was not published. */
export function stageRecord(lifecycle, stage) {
  const records = lifecycle.status?.index?.stage_runs ?? lifecycle.status?.run?.index?.stage_runs ?? [];
  return Array.isArray(records) ? records.find((record) => record?.stage === stage) ?? null : null;
}
