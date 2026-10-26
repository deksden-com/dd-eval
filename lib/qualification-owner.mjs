import path from "node:path";
import { randomUUID } from "node:crypto";
import { mkdir } from "node:fs/promises";
import { registerRunHome } from "./homes.mjs";
import { appendEvent, sha256, writeJsonAtomic } from "./runner-events.mjs";
import { withPriorEvalRetirement } from "./eval-retirement.mjs";
import { recordTechnicalNote } from './technical-notes.mjs';

// Runtime ownership is deliberately independent of semantic qualification keys:
// an operational retry must neither invalidate nor reissue a retained verdict.
export async function prepareQualificationOwner({ home, caseId, runtimeRoot, resourceHome, registryFile, engine, perHarness }, dependencies = {}) {
  const runId = `QUAL-${randomUUID()}`, root = path.join(home, "runs", runId);
  const manifest = { schema_id: "dd-eval/runner-manifest@1", kind: "qualification-owner", run_id: runId, case_id: caseId,
    executions: [], runtime_resource_home: resourceHome, runtime_control_bin: path.join(runtimeRoot, "bin", "dd-flow"),
    runtime_control_home: runtimeRoot, eval_registry_file: registryFile, runtime_engine: engine };
  await mkdir(root, { recursive: true, mode: 0o700 });
  await writeJsonAtomic(path.join(root, "manifest.json"), manifest);
  await registerRunHome(root, { DD_EVAL_REGISTRY_FILE: registryFile });
  await appendEvent(path.join(root, "events.jsonl"), { source: "dd-eval://qualification", runId, type: "dev.dd.eval.planned", data: { state: "planned", executions: [] } });
  await (dependencies.retirement ?? withPriorEvalRetirement)({ caseId, resourceHome, excludeRoot: root,
    env: { DD_EVAL_REGISTRY_FILE: registryFile }, maintenanceHome: runtimeRoot, maintenanceBin: manifest.runtime_control_bin }, async () => {
    await writeJsonAtomic(path.join(root, "launch-reservation.json"), { schema_id: "dd-eval/launch-reservation@1", run_id: runId, root, resource_home: resourceHome, admitted_at: new Date().toISOString() });
  });
  return { root, runId, resourceHome, budget: { schema_id: "dd-flow/runtime-budget@1", scope_id: runId, per_harness: perHarness } };
}

export async function finishQualificationOwner(owner, primaryError = null, dependencies = {}) {
  let publicationError;
  try {
    await appendEvent(path.join(owner.root, "events.jsonl"), { source: "dd-eval://qualification", runId: owner.runId,
      type: "dev.dd.eval.completed", data: { state: primaryError ? "failed" : "completed", ...(primaryError ? { error: { code: primaryError.code ?? "qualification_failed", message: primaryError.message } } : {}) } });
  } catch (error) { publicationError = error; }
  const cleanup = dependencies.cleanup ?? (await import("./eval-resume-worker.mjs")).requestRunnerContinuation;
  let result;
  try { result = await cleanup({ evalRoot: owner.root, kind: "cleanup", requestId: `qualification-retire:${owner.runId}`, inlineCleanup: true, cleanupOrigin: "automatic" }); }
  catch { result = { result: { cleanup_state: 'pending', physical_stopped: null, native_settled: null } }; }
  if (publicationError || result.result?.physical_stopped !== true || result.result?.native_settled !== true) await recordTechnicalNote(path.join(owner.root, 'events.jsonl'), owner.runId,
    { code: 'qualification_cleanup_pending', message: 'Qualification result retained; scoped resource retirement remains unconfirmed', phase: 'cleanup', resource_identity: owner.root, consequence: 'cleanup_pending' });
  return result;
}

// A scoped technical probe owns its processes without enabling flow hooks or
// manufacturing a RUN. callDriver binds the selected adapter before dispatch.
export function qualificationProbeEnvironment({ owner, runtimeRoot, stateDir }) {
  return { DD_FLOW_CONFIG_HOME: runtimeRoot, DD_FLOW_RESOURCE_HOME: owner.resourceHome,
    DD_FLOW_RUNTIME_OWNER: JSON.stringify({ schema_id: "dd-flow/runtime-owner@1", owner_id: `probe:${sha256(stateDir)}`, role: "probe",
      operation_id: `probe:${sha256(stateDir)}`, state_dir: stateDir, dd_flow_home: runtimeRoot,
      dd_flow_bin: path.join(runtimeRoot, "bin", "dd-flow"), resource_home: owner.resourceHome, budget: owner.budget }) };
}
