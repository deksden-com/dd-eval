import path from "node:path";
import { homesFile, registryEnvironment } from "../homes.mjs";
import { checkResourceEnvironment } from "../check-resources.mjs";
import { hashJson } from "../runner-events.mjs";
import { validateCoveragePolicy } from "../hitl-coverage.mjs";

const fail = (message, code = "validation") => { const error = new Error(message); error.code = code; throw error; };

/** Resolve the EVAL home, rejecting relative paths. */
export function evalHome(value = process.env.DD_EVAL_HOME) {
  const home = value ?? path.join(process.env.HOME ?? ".", ".dd-eval");
  if (!path.isAbsolute(home)) fail("DD_EVAL_HOME must be absolute");
  return path.resolve(home);
}

/** Locate the dd-flow entry point in the selected runtime. */
export const runtimeBin = (runtimeRoot) => path.join(runtimeRoot, "bin", "dd-flow");

/** Construct a runtime-scoped environment, with explicit overrides last. */
export const runtimeEnv = (runtimeRoot, extra = {}) => ({ DD_FLOW_HOME: runtimeRoot, DD_FLOW_BIN: runtimeBin(runtimeRoot), DD_FLOW_RESOURCE_HOME: process.env.DD_FLOW_RESOURCE_HOME ?? path.join(evalHome(), "resources"), PATH: `${path.join(runtimeRoot, "bin")}${path.delimiter}${process.env.PATH ?? ""}`, ...extra });

/** Reconstruct an EVAL's retained resource, recovery, registry and check bindings. */
export function evalRuntimeEnv(runtimeRoot, manifest, extra = {}) {
  if (manifest.profile?.interaction_judge?.coverage_policy && (!manifest.hitl_coverage_policy
    || hashJson(validateCoveragePolicy(manifest.hitl_coverage_policy)) !== manifest.hitl_coverage_policy_sha256)) fail("EVAL coverage policy lacks its frozen identity", "coverage_policy_invalid");
  if (typeof manifest.runtime_resource_home !== "string" || !path.isAbsolute(manifest.runtime_resource_home)) fail("EVAL manifest must retain its absolute resource registry home", "runtime_scope_identity_missing");
  if (manifest.runtime_recovery_home !== undefined && (!path.isAbsolute(manifest.runtime_control_bin ?? "") || !path.isAbsolute(manifest.runtime_recovery_home)
    || manifest.runtime_recovery_home !== path.join(path.dirname(path.dirname(path.dirname(manifest.runtime_control_bin))), "recovery"))) fail("EVAL manifest has an invalid owned recovery home", "runtime_scope_identity_missing");
  const checkEnv = checkResourceEnvironment(manifest.check_resources);
  if (extra.PLAYWRIGHT_BROWSERS_PATH !== undefined && checkEnv.PLAYWRIGHT_BROWSERS_PATH !== undefined && extra.PLAYWRIGHT_BROWSERS_PATH !== checkEnv.PLAYWRIGHT_BROWSERS_PATH) fail("Check resources differ from the retained selection", "check_resources_mismatch");
  return runtimeEnv(runtimeRoot, { ...extra, ...checkEnv, DD_FLOW_RESOURCE_HOME: manifest.runtime_resource_home, DD_EVAL_REGISTRY_FILE: homesFile(registryEnvironment(manifest)),
    ...(manifest.runtime_recovery_home ? { DD_FLOW_RECOVERY_HOME: manifest.runtime_recovery_home } : {}) });
}
