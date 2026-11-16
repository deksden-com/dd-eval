import path from "node:path";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { readRegularFile } from "../regular-file.mjs";
import { readJson } from "../json-file.mjs";
import { writeJsonAtomic } from "../runner-events.mjs";
import { commandJson } from "../process-json.mjs";
import { continuationStage } from "../flow-boundaries.mjs";
import { reconcileFlow } from "../execution/flow-observation.mjs";
import { evalHome, runtimeBin, runtimeEnv } from "../execution/runtime-environment.mjs";
import { verifySnapshot } from "../recovery/entry-snapshot.mjs";
import { canonicalState, assertCanonicalDefinition } from "./canonical-recovery.mjs";
import { canonicalLocator, manifestHash, writeCanonicalState, canonicalEntry } from "./canonical-state.mjs";

const fail = (message, code) => { throw Object.assign(new Error(message), { code }); };
const now = () => new Date().toISOString();
const sha256 = value => createHash("sha256").update(value).digest("hex");

/** Accept a reviewed, still-consistent reference-stage boundary. */
export async function canonicalBoundaryAccept({ buildRoot, stage, reviewFile }) {
  const { root, state, loaded, blueprint } = await canonicalState(buildRoot);
  await assertCanonicalDefinition(state);
  if (state.status !== "waiting_for_reference_review" || state.completed_stage !== stage || state.current_stage !== stage) fail("canonical build is not waiting for this stage review", "canonical_transition_invalid");
  const review = path.resolve(reviewFile), reviewBytes = await readRegularFile(review);
  if (!reviewBytes.toString("utf8").trim()) fail("canonical boundary review must be a non-empty file", "canonical_review_required");
  const reviewHash = sha256(reviewBytes);
  const projectRoot = path.join(root, "reference", "project"); const runtimeRoot = path.join(root, "reference", "dd-flow-home");
  const lifecycle = await reconcileFlow({ projectRoot, runtimeRoot, expectedStage: stage, runId: state.reference.run_id });
  if (lifecycle.stage_status !== "done") fail("Reference stage is no longer complete", "reference_boundary_changed");
  const successor = continuationStage(lifecycle, stage, loaded.value.flow.contour);
  if (!state.reference.managed || !state.reference.controller_id) fail("Legacy reference boundaries require explicit migration", "reference_migration_required");
  const boundary = state.reference.boundary;
  if (boundary?.stage !== stage || typeof boundary.manifest !== "string" || sha256(await readFile(boundary.manifest)) !== boundary.manifest_sha256) fail("Reference boundary receipt changed", "snapshot_checksum_mismatch");
  const captured = await readJson(boundary.manifest);
  if (captured.run_id !== state.reference.run_id || captured.boundary_capture?.controller_id !== state.reference.controller_id || captured.boundary_capture?.operation_id !== boundary.operation_id || captured.boundary_capture?.boundary_key !== boundary.boundary_key || captured.stage_entry !== (successor ?? null)) fail("Reference capture belongs to another boundary", "snapshot_contract_mismatch");
  const status = await commandJson(runtimeBin(runtimeRoot), ["run", "drive", "status", "--run", state.reference.run_id, "--project-root", projectRoot], { cwd: projectRoot, env: runtimeEnv(runtimeRoot) });
  if (status.controller?.controller_id !== state.reference.controller_id || !(successor ? status.controller.status === "waiting_for_context" : ["completed", "stop_target_reached"].includes(status.controller.status))) fail("Reference controller no longer holds the review boundary", "reference_boundary_changed");
  if (!successor) {
    state.status = "entries_captured";
    state.accepted_boundaries = [...(state.accepted_boundaries ?? []), { stage, review: review, sha256: reviewHash, at: now() }];
    await writeCanonicalState(root, state, { source: "dd-eval://runner", runId: state.revision, type: "dev.dd.eval.reference.boundary_accepted", data: { state: state.status, stage } });
    return { build: root, state, next: { kind: "canonical_qualify", command: `dd-eval runner canonical qualify --build ${JSON.stringify(root)}` } };
  }
  const snapshotRoot = path.dirname(boundary.manifest);
  const snapshot = { kind: "run", locator: canonicalLocator(evalHome(), snapshotRoot), manifest_sha256: await manifestHash(path.join(snapshotRoot, "snapshot.json")), run_id: state.reference.run_id };
  await verifySnapshot(evalHome(), { snapshot }, successor);
  const entry = canonicalEntry({ caseId: loaded.value.id, revision: state.revision, stage: successor, snapshot, blueprint, flowContour: loaded.value.flow.contour });
  const entryPath = path.join(root, "entries", `${successor}.json`); await writeJsonAtomic(entryPath, entry);
  // The prior turn is terminal before a boundary may be accepted.  Its marker
  // must not leak into the successor: a fresh-session handoff otherwise looks
  // like an interrupted in-flight turn and the runner safely refuses to send
  // the successor launcher.
  state.entries[successor] = path.relative(root, entryPath); state.accepted_boundaries = [...(state.accepted_boundaries ?? []), { stage, review, sha256: reviewHash, at: now() }]; state.current_stage = successor; state.completed_stage = null; state.status = "awaiting_reference_resume"; state.reference = { ...state.reference, active_turn: null, pending_pause_id: null };
  await writeCanonicalState(root, state, { source: "dd-eval://runner", runId: state.revision, type: "dev.dd.eval.reference.boundary_accepted", data: { state: state.status, stage, successor, snapshot: snapshot.locator } });
  return { build: root, state, next: { kind: "canonical_resume", command: `dd-eval runner canonical resume --build ${JSON.stringify(root)}` } };
}
