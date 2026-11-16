import { commandJson } from "../process-json.mjs";
import { runtimeEnv } from "./runtime-environment.mjs";

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
  const stage = Array.isArray(stages) ? stages.find((item) => item?.stage === expectedStage) : null;
  return { run_id: resolvedRunId, status, stage_status: stage?.status ?? null };
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
