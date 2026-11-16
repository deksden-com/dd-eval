import path from "node:path";
import { readdir, stat } from "node:fs/promises";
import { loadProfile } from "../cases/profile-loading.mjs";
import { contractProfile } from "../execution-contract.mjs";
import { runtimeBin, runtimeEnv } from "../execution/runtime-environment.mjs";
import { sha256 } from "../runner-events.mjs";

const fail = (message, code) => { throw Object.assign(new Error(message), { code }); };
async function exists(file) { try { await stat(file); return true; } catch { return false; } }

/** Locate an execution workspace and runtime for the Judge's harness. */
export async function judgeHarnessRoots(root, results) {
  const attempts = (results ?? []).map((result) => result?.attempt).filter((attempt) => typeof attempt === "string");
  if (attempts.length === 0) for (const name of await readdir(path.join(root, "executions")).catch(() => [])) attempts.push(path.join(root, "executions", name));
  for (const attempt of attempts) {
    const projectRoot = path.join(attempt, "project"); const runtimeRoot = path.join(attempt, "dd-flow-home");
    if (await exists(projectRoot) && await exists(runtimeRoot)) return { projectRoot, runtimeRoot };
  }
  fail("Judge cannot resolve its harness configuration without an execution runtime", "judge_runtime_missing");
}

/** Select the frozen Judge profile; standalone qualification may load its profile. */
export async function frozenJudgeProfile(contract, id, { standalone = false } = {}) {
  if (contract) return contractProfile(contract, id);
  if (standalone) return (await loadProfile(id)).value;
  fail("Judge dispatch requires retained execution settings; historical EVAL is not automatically rejudged", "judge_profile_contract_missing");
}

/** Bind Judge subprocesses to the retained runtime owner, budget and resources. */
export function judgeRuntimeEnvironment({ runtimeRoot, daemonState, profile, codexHome, budget = null, controller = null, resourceHome = null }) {
  if (budget && (typeof resourceHome !== "string" || !path.isAbsolute(resourceHome))) fail("EVAL Judge requires its retained resource registry home", "runtime_scope_identity_missing");
  resourceHome ??= runtimeEnv(runtimeRoot).DD_FLOW_RESOURCE_HOME;
  const owner = { schema_id: "dd-flow/runtime-owner@1", owner_id: `judge:${sha256(daemonState)}`, role: "judge", operation_id: `judge:${sha256(daemonState)}`, state_dir: daemonState,
    dd_flow_home: runtimeRoot, dd_flow_bin: runtimeBin(runtimeRoot), resource_home: resourceHome,
    ...(controller?.project_id && controller?.run_id ? { project_id: controller.project_id, run_id: controller.run_id } : {}), ...(budget ? { budget } : {}) };
  return { DD_FLOW_CONFIG_HOME: runtimeRoot, DD_FLOW_RESOURCE_HOME: resourceHome, DD_FLOW_RUNTIME_OWNER: JSON.stringify(owner), ...(profile.harness === "codex-desktop" ? { CODEX_HOME: codexHome } : {}) };
}
