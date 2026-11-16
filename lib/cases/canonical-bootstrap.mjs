import path from "node:path";
import { rm } from "node:fs/promises";
import { assertCheckpointEngine } from "../engine-admission.mjs";
import { captureEngineSnapshot } from "../execution/engine-snapshot.mjs";
import { runtimeBin, runtimeEnv } from "../execution/runtime-environment.mjs";
import { provisionRuntimeEngine } from "../execution/runtime-provision.mjs";
import { initialFlowBoundary } from "../flow-boundaries.mjs";
import { isInstalledFlow } from "../installed-flows.mjs";
import { setupMemoryFlowRuntime } from "../memory-runtime-setup.mjs";
import { commandJson } from "../process-json.mjs";
import { sha256, writeJsonAtomic } from "../runner-events.mjs";
import { canonicalEntry, canonicalLocator, manifestHash } from "./canonical-state.mjs";

/** Create a canonical bootstrap snapshot in a temporary isolated runtime. */
export async function createBootstrapEntry({ root, home, loaded, revision, blueprint, sourceProjectRoot, runProfile }) {
  const initial = initialFlowBoundary(loaded);
  const snapshotRoot = path.join(root, "stages", initial.stage, "bootstrap");
  const transientHome = path.join(root, "bootstrap-dd-flow-home");
  try {
    const selected = await provisionRuntimeEngine(sourceProjectRoot, transientHome);
    await assertCheckpointEngine(loaded.inputCheckpoint, selected, loaded.value.case_acceptance);
    if (isInstalledFlow(initial.flow)) await setupMemoryFlowRuntime(initial.flow,{ bin: runtimeBin(transientHome), env: runtimeEnv(transientHome), projectRoot: sourceProjectRoot,
      runtimeRoot: transientHome, declaration: runProfile.value.subject.memory_setup, checkpoint: loaded.inputCheckpoint.value, requestId: `setup-${sha256(root)}` });
    const engine = await captureEngineSnapshot({ root, home, selected });
    await commandJson("dd-flow", ["run", "snapshot", "bootstrap", "create", "--project-root", sourceProjectRoot, "--output", snapshotRoot, ...(initial.flow === "sdlc" ? [] : ["--flow", initial.flow])], { cwd: sourceProjectRoot, env: runtimeEnv(transientHome) });
    const snapshot = { kind: "bootstrap", locator: canonicalLocator(home, snapshotRoot), manifest_sha256: await manifestHash(path.join(snapshotRoot, "bootstrap.json")), run_id: null };
    const entry = canonicalEntry({ caseId: loaded.value.id, revision, stage: initial.stage, snapshot, blueprint, flowContour: loaded.value.flow.contour });
    await writeJsonAtomic(path.join(root, "entries", `${initial.stage}.json`), entry);
    return { entry, engine };
  }
  finally { await rm(transientHome, { recursive: true, force: true }); }
}
