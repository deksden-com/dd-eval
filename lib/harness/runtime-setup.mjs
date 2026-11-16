import path from "node:path";
import { chmod, mkdir, stat } from "node:fs/promises";
import { driverFor } from "./driver-bindings.mjs";
import { readJson } from "../json-file.mjs";
import { commandJson } from "../process-json.mjs";
import { writeJsonAtomic } from "../runner-events.mjs";
import { runtimeEnv } from "../execution/runtime-environment.mjs";

const fail = (message, code) => { throw Object.assign(new Error(message), { code }); };
const isObject = value => Boolean(value) && typeof value === "object" && !Array.isArray(value);
async function exists(file) { try { await stat(file); return true; } catch { return false; } }

/** Copy only portable harness configuration into an isolated flow home.
 * Runtime state (database, locks, runs, engines and logs) is never shared. */
export async function prepareRuntimeHarnessConfig(runtimeRoot) {
  const sourceHome = process.env.DD_FLOW_CONFIG_HOME ?? process.env.DD_FLOW_HOME ?? path.join(process.env.HOME ?? ".", ".dd-flow");
  const sourceConfig = path.join(sourceHome, "harnesses.json");
  if (!await exists(sourceConfig)) fail(`Harness configuration is missing: ${sourceConfig}`, "harness_config_missing");
  const config = await readJson(sourceConfig);
  if (config?.schema_id !== "dd-flow/harness-config@1" || !isObject(config.harnesses)) fail(`Harness configuration is invalid: ${sourceConfig}`, "harness_config_invalid");
  await mkdir(runtimeRoot, { recursive: true });
  const targetConfig = path.join(runtimeRoot, "harnesses.json");
  for (const [harness, entry] of Object.entries(config.harnesses)) {
    entry.adapter_command = path.join(runtimeRoot, "harness-runtime", "bin", driverFor({ harness }));
  }
  await writeJsonAtomic(targetConfig, config); await chmod(targetConfig, 0o600);
  // Execution settings belong to the retained contract/RUN, not portable routing.
}

/** Initialize an isolated Codex home using the bound runtime. */
export async function initializeCodexHome({ projectRoot, runtimeRoot, codexHome }) {
  const bin = "dd-flow";
  const initialized = await commandJson(bin, ["codex", "home", "init", "--project-root", projectRoot, "--target-home", codexHome], { cwd: projectRoot, env: runtimeEnv(runtimeRoot) });
  if (initialized.ok === false) fail("could not initialize isolated Codex home", "hook_preflight_failed");
  return initialized;
}
