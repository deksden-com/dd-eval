import path from "node:path";
import { createHash } from "node:crypto";
import { readJson } from "../json-file.mjs";
import { writeJsonAtomic } from "../runner-events.mjs";
import { commandJson } from "../process-json.mjs";
import { runtimeEnv } from "../execution/runtime-environment.mjs";
import { driverAdapterInvocation } from "./driver-bindings.mjs";

const fail = (message, code) => { throw Object.assign(new Error(message), { code }); };
const sha256 = value => createHash("sha256").update(value).digest("hex");

/** Qualify selected AGY workspace hooks, optionally installing them first. */
export async function qualifyWorkspaceHooks(profile, projectRoot, runtimeRoot, { install = false, execution } = {}) {
  // Inspect only selected routes, not every installed profile. Cross-harness
  // reviewers inherit qualified hooks from this source workspace snapshot.
  const selected = [];
  for (const route of [execution, ...Object.values(execution?.stage_overrides ?? {})].filter(Boolean)) {
    for (const id of [route.agent_profile_id, route.delegation?.agent_profile_id].filter(Boolean)) {
      if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(id)) fail("Invalid execution hook profile id", "agent_profile_invalid");
      const value = await readJson(path.join(runtimeRoot, "agent-profiles", `${id}.json`));
      if (value.schema_id !== "dd-flow/agent-profile@1" || value.id !== id) fail("Execution hook profile identity mismatch", "agent_profile_invalid");
      selected.push(value);
    }
  }
  const agy = selected.find(value => value.harness === "agy");
  if (profile.harness !== "antigravity-cli" && !agy) return null;
  if (agy) profile = { ...agy, harness: "antigravity-cli" };
  const env = runtimeEnv(runtimeRoot), adapter = await driverAdapterInvocation(profile, { env });
  const invoke = action => commandJson(adapter.executable, [...adapter.prefix, "hooks", action, "--project-root", projectRoot], { cwd: projectRoot, env });
  const installation = install ? await invoke("install") : null;
  const qualification = await invoke("check");
  if (qualification.ok !== true || qualification.workspaceHooksPath !== path.join(path.resolve(projectRoot), ".agents", "hooks.json") || !/^[a-f0-9]{64}$/.test(qualification.workspaceHooksSha256 ?? "") || installation && (installation.ok !== true || installation.workspaceHooksSha256 !== qualification.workspaceHooksSha256)) fail("AGY workspace hooks did not retain their qualified identity", "workspace_hooks_unqualified");
  const receipt = { schema_id: "dd-eval/workspace-hook-qualification@1", project_root: projectRoot, profile_id: profile.id, installation, qualification };
  if (install) await writeJsonAtomic(path.join(runtimeRoot, "workspace-hook-qualification", `${sha256(projectRoot)}.json`), receipt);
  return receipt;
}
