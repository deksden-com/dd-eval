import { access, stat } from "node:fs/promises";
import { constants as fsConstants } from "node:fs";
import path from "node:path";
import { assertExecutionPolicy, nativePermissionMode } from "../execution-contract.mjs";
import { readJson } from "../json-file.mjs";
import { checkObservedProfile } from "../evidence/model-observations.mjs";

/** Supply the default timeout only for AGY prompts that have no explicit timeout. */
export function boundedPromptArgs(profile, args) {
  return profile.harness === "antigravity-cli" && args[0] === "session" && args[1] === "prompt" && !args.includes("--timeout")
    ? [...args, "--timeout", "600"]
    : args;
}

const fail = (message, code = "validation") => { const error = new Error(message); error.code = code; throw error; };
const isObject = value => Boolean(value) && typeof value === "object" && !Array.isArray(value);
async function exists(file) { try { await stat(file); return true; } catch { return false; } }

/** Select the driver executable for a supported harness profile. */
export function driverFor(profile) { return profile.harness === "codex-desktop" ? "dd-codex.mjs" : profile.harness === "zcode-acp" ? "dd-zcode.mjs" : profile.harness === "grok-acp" ? "dd-grok.mjs" : profile.harness === "opencode-server" ? "dd-opencode.mjs" : profile.harness === "antigravity-cli" ? "dd-agy.mjs" : ["droid-cli", "droid"].includes(profile.harness) ? "dd-droid.mjs" : fail(`unsupported harness: ${profile.harness}`); }

/** Reject observed harness or profile evidence conflicting with the selected profile. */
export function assertObservedProfile(receipt, profile, label) {
  if (receipt?.harness && receipt.harness !== profile.harness) fail(`${label} returned harness ${receipt.harness}, expected ${profile.harness}`, "profile_integrity_violation");
  const observed = receipt?.observed_profile ?? receipt?.evidence?.observed_profile ?? receipt?.profile?.observed;
  if (observed) checkObservedProfile(qualificationJudgeInput(profile), observed);
}

/** Reject runtime compatibility evidence that conflicts with the selected profile. */
export function assertObservedRuntime(receipt, profile, label) {
  if (receipt?.compatible === false) fail(`${label} rejected runtime compatibility: ${receipt.lifecycle_qualification?.reason ?? "incompatible runtime"}`, "harness_runtime_incompatible");
  if (!profile.runtime) return receipt;
  const observed = receipt?.observed_runtime;
  if (!isObject(observed)) fail(`${label} did not report observed_runtime`, "harness_runtime_unobservable");
  const mismatches = Object.entries(profile.runtime).filter(([key, expected]) => observed[key] !== expected);
  if (mismatches.length) {
    const error = new Error(`${label} runtime differs from profile: ${mismatches.map(([key, expected]) => `${key}=${observed[key] ?? "missing"} (expected ${expected})`).join(", ")}`);
    error.code = "harness_runtime_mismatch";
    error.details = { profile_id: profile.id, expected: profile.runtime, observed, next_command: `dd-eval harness compatibility qualify --profile ${profile.id}` };
    throw error;
  }
  return receipt;
}

/** Apply profile-specific driver arguments to a requested operation. */
export function driverProfileArgs(profile, args, operation = args.slice(0, 2).join(".")) {
  if (!['doctor', 'session'].includes(args[0]) && !(args[0] === 'daemon' && args[1] === 'start')) return args;
  if (args[0] === 'doctor' || args[0] === 'daemon' || ['session.create', 'session.start', 'session.prompt', 'session.fork', 'session.resume'].includes(operation)) assertExecutionPolicy(profile);
  const resolved = [...args];
  for (const key of ["provider", "model", "reasoning", "mode"]) {
    if (typeof profile[key] === "string" && profile[key] && !resolved.includes(`--${key}`)) resolved.push(`--${key}`, profile[key]);
  }
  if (typeof profile.permission === "string" && !resolved.includes("--permission")) resolved.push("--permission", profile.permission);
  return resolved;
}

async function absoluteExecutable(command, cwd, env = process.env) {
  if (path.isAbsolute(command)) return command;
  if (command.includes(path.sep)) return path.resolve(cwd, command);
  for (const directory of (env.PATH ?? process.env.PATH ?? "").split(path.delimiter)) {
    const candidate = path.join(directory || ".", command);
    try { await access(candidate, fsConstants.X_OK); return candidate; } catch { /* Continue scanning PATH. */ }
  }
  fail(`Executable is not available on PATH: ${command}`, "executable_not_found");
}

/** Bind runtime arguments to the selected project and runtime environment. */
export async function driverRuntimeArgs(args, { cwd, env = {}, profile = null } = {}) {
  const daemonStart = args[0] === "daemon" && args[1] === "start";
  const doctor = args[0] === "doctor";
  if (!daemonStart && !doctor) return args;
  const resolved = [...args];
  const launchEnv = { ...process.env, ...env };
  if (daemonStart && typeof env.DD_FLOW_HOME === "string" && path.isAbsolute(env.DD_FLOW_HOME)) {
    if (!resolved.includes("--dd-flow-bin")) resolved.push("--dd-flow-bin", await absoluteExecutable(env.DD_FLOW_BIN ?? process.env.DD_FLOW_BIN ?? "dd-flow", cwd, launchEnv));
    if (!resolved.includes("--dd-flow-home")) resolved.push("--dd-flow-home", env.DD_FLOW_HOME);
    if (!resolved.includes("--project-root")) resolved.push("--project-root", cwd);
  }
  // Daemons survive their launcher. Resolve their exact native executable
  // from the copied harness configuration while the runner owns the setup.
  const configHome = env.DD_FLOW_CONFIG_HOME ?? env.DD_FLOW_HOME;
  if (profile?.harness && typeof configHome === "string" && path.isAbsolute(configHome)) {
    const config = await readJson(path.join(configHome, "harnesses.json"));
    const key = harnessConfigKey(profile.harness); const entry = config?.harnesses?.[key];
    if (!entry || typeof entry.runtime_command !== "string") fail(`Harness ${key} is not configured`, "harness_config_missing");
    const option = harnessRuntimeOption(profile.harness);
    if (!resolved.includes(option)) resolved.push(option, await absoluteExecutable(entry.runtime_command, cwd, launchEnv));
  }
  return resolved;
}

/** Normalize a supported harness alias to its configuration key. */
export function harnessConfigKey(harness) { return ({ codex: "codex-desktop", zcode: "zcode-acp", grok: "grok-acp", agy: "antigravity-cli", opencode: "opencode-server", "codex-desktop": "codex-desktop", "zcode-acp": "zcode-acp", "grok-acp": "grok-acp", "antigravity-cli": "antigravity-cli", "opencode-server": "opencode-server", "droid-cli": "droid-cli", "droid": "droid-cli" })[harness] ?? fail(`Unsupported harness: ${harness}`, "harness_config_invalid"); }

function harnessRuntimeOption(harness) { return ({ "codex-desktop": "--codex-bin", "zcode-acp": "--zcode-acp-bin", "grok-acp": "--grok-bin", "antigravity-cli": "--agy-bin", "opencode-server": "--opencode-bin", "droid-cli": "--droid-bin", "droid": "--droid-bin" })[harness] ?? fail(`Unsupported harness: ${harness}`, "harness_config_invalid"); }

/** Resolve the installed driver invocation for a selected harness profile. */
export async function driverAdapterInvocation(profile, { env = {} } = {}) {
  const configHome = env.DD_FLOW_CONFIG_HOME ?? env.DD_FLOW_HOME;
  if (typeof configHome !== "string" || !path.isAbsolute(configHome)) fail("Harness adapter requires an absolute retained runtime home", "harness_config_missing");
  const bundled = path.join(configHome, "harness-runtime", "bin", driverFor(profile));
  if (!(await exists(bundled))) fail("Selected runtime is missing its bundled harness adapter", "canonical_engine_missing");
  return { executable: process.execPath, prefix: [bundled] };
}

/** Verify that a driver receipt belongs to the requested native session. */
export function assertTargetSession(receipt, profile, args) {
  const expected = argValue(args, "--session-id");
  if (args[0] !== "session" || !["prompt", "inspect", "cancel", "resume", "status"].includes(args[1]) || !expected) return;
  const observed = receipt?.provider_session_id ?? receipt?.session_id;
  if (observed !== expected || (receipt?.harness && receipt.harness !== profile.harness)) {
    throw Object.assign(new Error("adapter response belongs to a different or unidentified Session"), { code: "session_identity_mismatch", details: { harness: profile.harness, expected_session_id: expected, observed_session_id: observed ?? null } });
  }
}

/** Read an option value from an argument list, returning null when absent. */
export function argValue(args, name) { const index = args.indexOf(name); return index < 0 ? null : args[index + 1] ?? null; }

/** Build the profile evidence used to validate a qualification Judge. */
export function qualificationJudgeInput(profile) {
  // Version, notes, capacity, hooks and transport are provenance, not Judge tasks.
  return { harness: profile.harness, model: profile.model, reasoning: profile.reasoning,
    ...Object.fromEntries(["provider", "mode"].filter(key => profile[key] !== undefined).map(key => [key, profile[key]])),
    ...(nativePermissionMode(profile) === undefined ? {} : { permission_mode: nativePermissionMode(profile) }) };
}
