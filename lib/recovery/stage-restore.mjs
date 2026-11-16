import path from "node:path";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { materializeExecutionContract } from "../execution-contract.mjs";
import { runtimeEngineIdentity } from "../execution/engine-snapshot.mjs";
import { runtimeBin, runtimeEnv } from "../execution/runtime-environment.mjs";
import { materializeRuntimeEngine, provisionRuntimeEngine } from "../execution/runtime-provision.mjs";
import { readJson } from "../json-file.mjs";
import { requireSnapshotPolicyCapability } from "../managed-flow-client.mjs";
import { materializeOperationalDecision } from "../operational-decision.mjs";
import { commandJson } from "../process-json.mjs";
import { canonicalJson } from "../runner-events.mjs";
import { verifySnapshot } from "./entry-snapshot.mjs";

const fail = (message, code) => { throw Object.assign(new Error(message), { code }); };

/** Restore a verified stage entry into an isolated project and runtime. */
export async function restoreStageSnapshot({ home, entry, stage, projectRoot, runtimeRoot, authoringEngine = null, executionRoutingFile = null, operational = null, executionContract = null, resourceHome = runtimeEnv(runtimeRoot).DD_FLOW_RESOURCE_HOME,flowId=null }) {
  const selected=executionContract?.generic_execution?.settings;
  const expectedId=flowId??selected?.flow_id;
  const snapshot = await verifySnapshot(home, entry, stage, expectedId ? {id:expectedId,...(selected?{descriptor_sha256:selected.descriptor_sha256}:{})}:null);
  // The bootstrap restore owns project contents, but engine resolution needs
  // an existing cwd before restore starts.
  await mkdir(projectRoot, { recursive: true });
  const install = (destination) => authoringEngine
    ? materializeRuntimeEngine({ home, engine: authoringEngine, runtimeRoot: destination, projectRoot, resourceHome })
    : provisionRuntimeEngine(projectRoot, destination, { resourceHome });
  if (entry.snapshot.kind === "bootstrap") {
    const engine = await install(runtimeRoot);
    const bin = runtimeBin(runtimeRoot); const env = runtimeEnv(runtimeRoot);
    const restored = await commandJson(bin, ["run", "snapshot", "bootstrap", "restore", "--snapshot", snapshot.root, "--project-root", projectRoot], { cwd: projectRoot, env });
    if (restored.target_stage !== stage) fail("restored bootstrap does not target its selected stage", "snapshot_restore_mismatch");
    await mkdir(runtimeRoot, { recursive: true });
    // A bootstrap snapshot has no runtime project record by design. Register
    // the restored root before harness preparation: Codex-home initialization
    // needs that record, while the later bootstrap stage start remains the
    // sole operation that creates the RUN and starts SPECIFY.
    await commandJson("dd-flow", ["project", "register", "--root", projectRoot], { cwd: projectRoot, env: runtimeEnv(runtimeRoot) });
    if (operational) {
      const decision = await materializeOperationalDecision({ ...operational, projectRoot, runtimeRoot, commitOwnedProfile: true });
      if (decision?.materialized_commit) restored.materialized_commit = decision.materialized_commit;
    }
    return { project_root: projectRoot, workspace_root: projectRoot, run_id: null, run_home: null, snapshot: snapshot.root, engine, materialized_commit: restored.materialized_commit ?? null };
  }
  // The import owns an empty destination. Its executable must live outside
  // that destination, which the CLI replaces with the captured runtime.
  await mkdir(path.dirname(runtimeRoot), { recursive: true });
  const toolsHome = await mkdtemp(path.join(path.dirname(runtimeRoot), ".restore-engine-"));
  try {
    const importer = await install(toolsHome);
    const importerBin=path.join(importer.snapshot_root,importer.entrypoint),importEnv=runtimeEnv(runtimeRoot,{DD_FLOW_ENGINE_MODE:"1",DD_FLOW_ENGINE_HOME:importer.snapshot_root});
    if (expectedId==="sdlc") await requireSnapshotPolicyCapability({bin:importerBin,env:runtimeEnv(toolsHome,{DD_FLOW_ENGINE_MODE:"1",DD_FLOW_ENGINE_HOME:importer.snapshot_root}),projectRoot,command:["run","snapshot","restore"]});
    if (executionContract) await materializeExecutionContract(runtimeRoot, executionContract);
    const decisionFile = operational?.declaration ? path.join(toolsHome, "operational-decision.json") : null;
    if (operational) await materializeOperationalDecision({ ...operational, projectRoot, runtimeRoot: toolsHome, sourceRoot: path.join(snapshot.root, "project"), output: decisionFile });
    const restored = await commandJson(importerBin, ["run", "snapshot", "restore", "--snapshot", snapshot.root, "--project-root", projectRoot, ...(executionRoutingFile ? ["--execution-routing-file", executionRoutingFile] : []), ...(decisionFile ? ["--operational-decision-file", decisionFile] : []),...(expectedId==="sdlc"?["--snapshot-policy","required"]:[])], { cwd: projectRoot, env: importEnv });
    if (restored.run_id !== entry.snapshot.run_id || restored.target_stage !== stage) fail("restored RUN does not match its stage entry", "snapshot_restore_mismatch");
    if (expectedId==="sdlc" && restored.snapshot_policy!=="required") fail("Restored RUN did not confirm required snapshot policy","snapshot_policy_unconfirmed",{effect:"partial",run_id:restored.run_id,next_action:"inspect_retained_run"});
    const binding = await readJson(path.join(restored.run_home, "engine-binding.json"));
    const bound = binding.engine;
    if (bound?.package_name !== importer.package_name || bound?.package_version !== importer.package_version || bound?.engine_version !== importer.engine_version || bound?.integrity_checksum !== importer.integrity?.checksum) fail("stage-entry RUN is pinned to a different engine; create a compatible entry pack", "snapshot_engine_mismatch");
    const engine = await install(runtimeRoot);
    if (canonicalJson(runtimeEngineIdentity(engine)) !== canonicalJson(runtimeEngineIdentity(importer))) fail("selected engine changed during snapshot import", "snapshot_engine_mismatch");
    return { ...restored, snapshot: snapshot.root, engine };
  } finally { await rm(toolsHome, { recursive: true, force: true }); }
}
