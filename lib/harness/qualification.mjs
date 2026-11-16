import path from "node:path";
import { createHash } from "node:crypto";
import { mkdir, readFile, realpath } from "node:fs/promises";
import { homesFile } from "../homes.mjs";
import { errorRecord } from "../operation-errors.mjs";
import { loadCapacityPolicy, loadNativeContracts } from "../capacity-policy.mjs";
import { loadDelegationInstructions } from "../delegation-instructions.mjs";
import { verifyEngineArtifact } from "../engine-admission.mjs";
import { readJson } from "../json-file.mjs";
import { writeJsonAtomic } from "../runner-events.mjs";
import { evalHome, runtimeEnv } from "../execution/runtime-environment.mjs";
import { runtimeEngineIdentity } from "../execution/engine-snapshot.mjs";
import { provisionRuntimeEngine } from "../execution/runtime-provision.mjs";
import { loadProfile } from "../cases/profile-loading.mjs";
import { argValue, harnessConfigKey } from "./driver-bindings.mjs";
import { callDriver, providerTurn } from "./driver-call.mjs";
import { recoverDriverReply, driverObservationClock } from "./driver-recovery.mjs";
import { prepareQualificationOwner, finishQualificationOwner, qualificationProbeEnvironment } from "./qualification-owner.mjs";
import { provisionCapacityCodexHome } from "./capacity-codex-home.mjs";
import { setTimeout as delay } from "node:timers/promises";
import { promptJudgeWithCapacity } from "../judge/capacity.mjs";
import { directNativeChildren, capacityCodexChildren } from "./native-children.mjs";

const now = () => new Date().toISOString();
const sha256 = value => createHash("sha256").update(value).digest("hex");
const isObject = value => Boolean(value) && typeof value === "object" && !Array.isArray(value);
const fail = (message, code) => { throw Object.assign(new Error(message), { code }); };

/** Qualify one changed harness profile by observing it and exercising its native child path once. */
export async function harnessCompatibilityQualify({ profileId, projectRoot = process.cwd() }) {
  const loaded = await loadProfile(profileId); const profile = loaded.value; const project = path.resolve(projectRoot);
  const original = await readFile(loaded.file); const beforeSha256 = sha256(original);
  const receiptRoot = path.join(evalHome(), "conformance", "harness-compatibility", new Date().toISOString().replace(/[-:.TZ]/g, ""), profile.id);
  const runtimeRoot = path.join(receiptRoot, "runtime");
  await provisionRuntimeEngine(project, runtimeRoot);
  const options = { cwd: project, env: { DD_FLOW_CONFIG_HOME: runtimeRoot }, validateRuntime: false };
  const observedReceipt = await callDriver(profile, ["doctor", "--cwd", project, "--model", profile.model, "--reasoning", profile.reasoning], options);
  const observed = observedReceipt?.observed_runtime;
  if (!isObject(observed)) fail("harness doctor did not report observed_runtime", "harness_runtime_unobservable");
  if (JSON.stringify(profile.runtime ?? null) === JSON.stringify(observed)) return { profile_id: profile.id, status: "already_qualified", observed_runtime: observed };
  // Reuse the native-child conformance path. It is a small real smoke, not a
  // second launcher protocol with subtly different lifecycle semantics.
  const smoke = await harnessCapacityCheck({ profileId, maximum: 1, projectRoot: project, writeProfile: false, runtimeRoot });
  if (!smoke.qualified) {
    const error = new Error("harness compatibility smoke did not qualify the changed runtime");
    error.code = "harness_compatibility_smoke_failed";
    error.details = { profile_id: profile.id, observed_runtime: observed, smoke_receipt: smoke.receipt_file, failure: smoke.failure ?? null };
    throw error;
  }
  const afterReceipt = await callDriver({ ...profile, runtime: null }, ["doctor", "--cwd", project, "--model", profile.model, "--reasoning", profile.reasoning], options);
  if (JSON.stringify(afterReceipt?.observed_runtime ?? null) !== JSON.stringify(observed)) fail("harness runtime changed during qualification", "harness_runtime_changed");
  const current = await readFile(loaded.file);
  if (sha256(current) !== beforeSha256) fail("harness profile changed during qualification; inspect and retry", "harness_profile_changed");
  const next = { ...profile, runtime: observed };
  delete next.subagent_capacity;
  await writeJsonAtomic(loaded.file, next);
  await mkdir(receiptRoot, { recursive: true });
  await writeJsonAtomic(path.join(receiptRoot, "receipt.json"), { schema_id: "dd-eval/harness-compatibility@1", profile_id: profile.id, previous_runtime: profile.runtime ?? null, observed_runtime: observed, smoke, qualified_at: now() });
  return { profile_id: profile.id, status: "qualified", previous_runtime: profile.runtime ?? null, observed_runtime: observed, smoke_receipt: path.join(receiptRoot, "receipt.json") };
}

async function stopCapacityDaemon({ profile, daemon, projectRoot, nativeContracts }) {
  try { return await callDriver(profile, ["daemon", "stop", ...daemon.daemonArgs], { cwd: projectRoot, env: daemon.env, nativeContracts }); }
  catch (error) {
    if (error?.code !== "tree_not_settled") throw error;
    return await callDriver(profile, ["daemon", "stop", ...daemon.daemonArgs, "--cancel-tree"], { cwd: projectRoot, env: daemon.env, nativeContracts });
  }
}

/** Qualify capacity using the owned native probe and its cleanup evidence. */
export async function harnessCapacityCheck({ profileId, maximum, projectRoot = null, writeProfile = true, runtimeRoot: suppliedRuntimeRoot = null }) {
  const max = Number(maximum);
  if (!Number.isInteger(max) || max < 1 || max > 15) fail("--max must be an integer from 1 through 15", "capacity_check_invalid");
  const loaded = await loadProfile(profileId); const profile = loaded.value;
  const root = path.join(evalHome(), "conformance", "native-subagents", new Date().toISOString().replace(/[-:.TZ]/g, ""), profile.id);
  const attempt = path.join(root, "attempt");
  await mkdir(attempt, { recursive: true });
  // A technical probe must not leave provider service files in the definition checkout.
  const project = path.resolve(projectRoot ?? path.join(attempt, "project"));
  if (projectRoot === null) await mkdir(project, { recursive: true });
  const runtimeRoot = suppliedRuntimeRoot ?? path.join(root, "runtime");
  if (!path.isAbsolute(runtimeRoot)) fail("Qualification runtime must be absolute", "harness_config_missing");
  if (suppliedRuntimeRoot === null) await provisionRuntimeEngine(project, runtimeRoot);
  const runtimeArtifact = path.dirname(path.dirname(await realpath(path.join(runtimeRoot, "harness-runtime"))));
  const engine = await readJson(path.join(runtimeArtifact, "engine.json"));
  await verifyEngineArtifact(engine, runtimeArtifact);
  const renderer = await loadDelegationInstructions(runtimeRoot);
  const nativeContracts = await loadNativeContracts(runtimeRoot, { requireProgress: true, requireTreeSettlement: true });
  const capacityPolicy = await loadCapacityPolicy(runtimeRoot);
  const capacityPrompt = renderer.renderCapacityInstructions({ maximum: max, harness: profile.harness });
  const continuationPrompt = "Continue the previously started capacity probe in this same Session. Do not restart fanout or create another child wave. Report the native direct children accepted by that probe.";
  // Qualification is intentionally outside dd-flow. Supplying a flow home
  // would activate adapter lifecycle forwarding and turn a technical child
  // probe into a synthetic RUN/Work interaction.
  const journal = path.join(attempt, "events.jsonl"); const daemon = { daemonArgs: ["--state-dir", path.join(attempt, "daemon"), ...(["grok-acp", "antigravity-cli", "opencode-server", "droid-cli", "droid"].includes(profile.harness) ? ["--no-flow"] : [])], journal, env: { DD_FLOW_CONFIG_HOME: runtimeRoot, ...(profile.harness === "codex-desktop" ? { CODEX_HOME: path.join(attempt, "codex-home") } : {}) } };
  const runtimeOwner = await prepareQualificationOwner({ home: evalHome(), caseId: `conformance:${profile.id}`, runtimeRoot,
    resourceHome: path.resolve(runtimeEnv(runtimeRoot).DD_FLOW_RESOURCE_HOME), registryFile: homesFile(),
    engine: runtimeEngineIdentity(engine), perHarness: { [harnessConfigKey(profile.harness)]: max + 1 } });
  Object.assign(daemon.env, qualificationProbeEnvironment({ owner: runtimeOwner, runtimeRoot, stateDir: argValue(daemon.daemonArgs, "--state-dir") }));
  let rootSessionId = null; let promptReceipt = null; let inspected = null; let cleanup = null; let failure = null;
  const driverOptions = { cwd: project, env: daemon.env, nativeContracts };
  try {
    if (profile.harness === "codex-desktop") await provisionCapacityCodexHome(daemon.env.CODEX_HOME);
    await callDriver(profile, ["daemon", "start", ...daemon.daemonArgs, "--cwd", project, "--journal", journal], driverOptions);
    const created = await providerTurn(profile, ["session", "create", ...daemon.daemonArgs, "--cwd", project, "--model", profile.model, "--reasoning", profile.reasoning, "--journal", journal], driverOptions);
    rootSessionId = created.provider_session_id ?? created.session_id;
    if (typeof rootSessionId !== "string") fail("capacity root has no provider session ID", "driver_protocol");
    const probe = async (ordinal = 0, capacity = null, beforeDispatch = async () => {}, text = ordinal === 0 ? capacityPrompt : continuationPrompt) => {
      await beforeDispatch();
      return providerTurn(profile, ["session", "prompt", ...daemon.daemonArgs, "--session-id", rootSessionId, "--cwd", project, "--model", profile.model, "--reasoning", profile.reasoning, "--prompt", text, "--journal", journal], { ...driverOptions, ...(capacity ? { operationId: capacity.operation_id, capacityContinuation: capacity } : {}) });
    };
    const inspect = turnId => callDriver(profile, ["session", "inspect", ...daemon.daemonArgs, "--session-id", rootSessionId, ...(turnId ? ["--turn-id", turnId] : []), "--cwd", project, "--model", profile.model, "--reasoning", profile.reasoning, "--journal", journal], driverOptions);
    promptReceipt = await boundedCapacityContinuation({ policy: capacityPolicy, nativeContracts, ownerIdentity: { profile, maximum: max, runtimeRoot }, originalPrompt: capacityPrompt, continuationPrompt, sessionId: rootSessionId, attempt: probe, inspect,
        stateFile: path.join(attempt, "capacity-chain.json"), recover: operationId => recoverDriverReply(argValue(daemon.daemonArgs, "--state-dir"), operationId, { nativeContracts }),
        observationClock: operationId => driverObservationClock(argValue(daemon.daemonArgs, "--state-dir"), operationId),
        children: async observed => [...directNativeChildren(observed, rootSessionId, nativeContracts), ...(profile.harness === "codex-desktop" ? await capacityCodexChildren(daemon.env.CODEX_HOME, rootSessionId, nativeContracts) : [])] });
    inspected = await inspect().catch(() => null);
  } catch (error) {
    failure = errorRecord(error);
  } finally {
    cleanup = await stopCapacityDaemon({ profile, daemon, projectRoot: project, nativeContracts }).catch((error) => ({ stopped: false, error: errorRecord(error) }));
    try {
      const retired = await finishQualificationOwner(runtimeOwner, failure ?? (cleanup.stopped === true ? null : { code: "capacity_cleanup_unconfirmed", message: "Capacity daemon stop was not confirmed" }));
      cleanup.scope_retirement = { owner: runtimeOwner.root, physical_stopped: retired.result.physical_stopped, native_settled: retired.result.native_settled };
    } catch (error) { cleanup.scope_retirement = { owner: runtimeOwner.root, error: errorRecord(error) }; failure ??= errorRecord(error); }
  }
  const observedChildren = directNativeChildren(inspected ?? promptReceipt, rootSessionId, nativeContracts);
  const children = profile.harness === "codex-desktop" ? await capacityCodexChildren(daemon.env.CODEX_HOME, rootSessionId, nativeContracts) : observedChildren;
  if (children.some(child => child.provenance === "parent_mismatch")) failure ??= { code: "native_child_parent_mismatch", message: "Capacity evidence contains foreign parentage" };
  const count = (status) => children.filter((child) => child.parent_session_id === rootSessionId && child.status === status).length;
  const receipt = {
    schema_id: "dd-eval/subagent-capacity@1", profile_id: profile.id, harness: profile.harness,
    requested: max, started: children.filter(child => child.parent_session_id === rootSessionId).length, completed: count("completed"), failed_after_start: count("failed"), cancelled_after_start: count("cancelled"), capacity: children.filter(child => child.parent_session_id === rootSessionId).length,
    root_session_id: rootSessionId, children, cleanup, ...(failure ? { failure } : {}), recorded_at: now()
  };
  const receiptFile = path.join(root, "capacity.json"); await writeJsonAtomic(receiptFile, receipt);
  const qualified = qualifiedCapacityProbe(receipt);
  if (writeProfile && qualified) await writeJsonAtomic(loaded.file, { ...profile, subagent_capacity: receipt.capacity });
  return { root, receipt_file: receiptFile, ...receipt, qualified, profile_updated: writeProfile && qualified };
}

/**
 * A bounded technical qualification. It intentionally creates no RUN, Stage
 * or Work: the only measured fact is an accepted native direct-child ID.
 */
export async function boundedCapacityContinuation({ policy, nativeContracts, observationClock, ownerIdentity = null, originalPrompt, continuationPrompt, sessionId, attempt, inspect, children, pause = delay, clock = Date.now, random = Math.random, stateFile, recover, deadline = null, admit = async () => {} }) {
  if (typeof originalPrompt !== "string" || !originalPrompt || typeof continuationPrompt !== "string" || !continuationPrompt) fail("Capacity probe must retain its actual prompts", "capacity_chain_conflict");
  let lastFailure;
  return promptJudgeWithCapacity({ policy, nativeContracts, observationClock, ownerIdentity, sessionId, originalPrompt, continuationPrompt,
    inspect, wait: pause, clock, random, stateFile, recover, deadline, admit,
    validateInspection: async observed => {
      // Qualification owns no Flow budget, but accepted children must remain
      // absent immediately before dispatch, not just before the backoff.
      if ((observed.provider_session_id ?? observed.session_id) !== sessionId || observed.settled !== true || observed.settlement?.state === "pending" || (await children(observed)).length) throw lastFailure ?? Object.assign(new Error("Capacity native tree changed"), { code: "capacity_tree_changed" });
      return true;
    },
    dispatch: async (text, capacity, beforeDispatch) => {
      try { return await attempt(capacity.ordinal, capacity, beforeDispatch, text); }
      catch (error) { lastFailure = error; throw error; }
    } });
}

/** Accept only settled capacity evidence belonging to the measured root session. */
export function qualifiedCapacityProbe(receipt) {
  return receipt?.schema_id === "dd-eval/subagent-capacity@1" && !receipt.failure && receipt.cleanup?.stopped === true
    && (!receipt.cleanup.scope_retirement || receipt.cleanup.scope_retirement.physical_stopped === true && receipt.cleanup.scope_retirement.native_settled === true)
    && Number.isInteger(receipt.requested) && receipt.requested >= 1 && receipt.requested <= 15
    && Number.isInteger(receipt.capacity) && receipt.capacity >= 1 && receipt.capacity <= receipt.requested
    && typeof receipt.root_session_id === "string" && receipt.root_session_id.length > 0
    && Array.isArray(receipt.children) && receipt.children.length === receipt.capacity
    && new Set(receipt.children.map(child => child?.session_id)).size === receipt.capacity
    && receipt.children.every(child => typeof child?.session_id === "string" && child.session_id.length > 0
      && child.session_id !== receipt.root_session_id && child.parent_session_id === receipt.root_session_id
      && child.provenance !== "parent_mismatch");
}
