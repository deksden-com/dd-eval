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
