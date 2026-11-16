import path from "node:path";
import { randomUUID, createHash } from "node:crypto";
import { appendFile, mkdir } from "node:fs/promises";
import { validateObservationDuration } from "../observation-clock.mjs";
import { contractProfile } from "../execution-contract.mjs";
import { runtimeEnv } from "../execution/runtime-environment.mjs";
import { loadNativeContracts } from "../capacity-policy.mjs";
import { executionDispatchBarrier } from "../execution/dispatch-barrier.mjs";
import { driverProfileArgs, driverRuntimeArgs, driverAdapterInvocation, argValue, assertObservedRuntime, assertObservedProfile, assertTargetSession, boundedPromptArgs } from "./driver-bindings.mjs";
import { readJson } from "../json-file.mjs";
import { writeJsonAtomic, hashJson } from "../runner-events.mjs";
import { withRunnerLock } from "../runner-lock.mjs";
import { operationContext } from "../operation-context.mjs";
import { reconcileDriverReplies, recoverDriverReply } from "./driver-recovery.mjs";
import { modelProgressPump } from "./model-progress.mjs";
import { commandJson } from "../process-json.mjs";
import { inspectDaemonOperation } from "../daemon-operations.mjs";
import { withSleepInhibitor } from "../sleep-inhibitor.mjs";
import { isObservationLoss, errorRecord } from "../operation-errors.mjs";

const fail = (message, code) => { throw Object.assign(new Error(message), { code }); };
const sha256 = value => createHash("sha256").update(value).digest("hex");
const now = () => new Date().toISOString();

const deliveredModelProgress = new Map();
/** Invoke the bound native driver while retaining observation and replay evidence. */
export async function callDriver(profile, args, options) {
  if (options.timeoutMs !== undefined && options.timeoutMs !== null) validateObservationDuration(options.timeoutMs);
  const requestedOperation = args[1] && !args[1].startsWith("--") ? args.slice(0, 2).join(".") : args[0];
  let nativeContracts = options.nativeContracts;
  // A materializing resume and an observational alias have different launch
  // authority. Resolve that distinction from the selected engine before gates.
  if (requestedOperation === "session.resume" && !nativeContracts?.canonicalNativeOperation
    || requestedOperation === "session.start" && !nativeContracts?.nativeOperationWait) {
    nativeContracts = await loadNativeContracts(options.env?.DD_FLOW_CONFIG_HOME ?? options.env?.DD_FLOW_HOME, { requireProgress: true });
  }
  if (nativeContracts?.canonicalNativeOperation !== undefined && typeof nativeContracts.canonicalNativeOperation !== "function") fail("Selected native operation contract is incompatible", "native_contract_unsupported");
  const operation = nativeContracts?.canonicalNativeOperation ? nativeContracts.canonicalNativeOperation(profile.harness, requestedOperation) : requestedOperation;
  if (typeof operation !== "string" || !/^[a-z][a-z0-9_-]*(?:\.[a-z][a-z0-9_-]*)?$/.test(operation)) fail("Selected native contract returned an invalid operation", "native_contract_unsupported");
  const materializing = ["session.create", "session.start", "session.prompt", "session.fork", "session.resume"].includes(operation);
  if (materializing && options.env?.DD_FLOW_CONFIG_HOME && (nativeContracts?.native_tree_settlement_contract !== "native-tree-settlement@2" || typeof nativeContracts.nativeTreeReadiness !== "function")) {
    nativeContracts = await loadNativeContracts(options.env.DD_FLOW_CONFIG_HOME, { requireTreeSettlement: true });
  }
  if (materializing || operation === "daemon.start") await executionDispatchBarrier(operation);
  const adapter = await driverAdapterInvocation(profile, options);
  // Historical control reads keep their pinned semantics. Productive start
  // needs the selected native wait ABI: Droid waits for work, Codex for ACK.
  const phase = nativeContracts?.nativeOperationWait ? nativeContracts.nativeOperationWait(profile.harness, operation)
    : operation === "session.prompt" ? "native-work" : "control";
  if (!["native-work", "control"].includes(phase)) fail("Selected native wait contract returned an invalid phase", "native_contract_unsupported");
  const command = driverProfileArgs(profile, await driverRuntimeArgs(args, { ...options, profile }), operation);
  let ownedEnv = options.env;
  if (options.env?.DD_FLOW_RUNTIME_OWNER) {
    const owner = JSON.parse(options.env.DD_FLOW_RUNTIME_OWNER);
    const executable = adapter.prefix[0] ?? adapter.executable;
    if (owner.adapter_executable && owner.adapter_executable !== executable) fail("Judge adapter differs from its frozen runtime owner", "harness_runtime_binding_conflict");
    ownedEnv = { ...options.env, DD_FLOW_RUNTIME_OWNER: JSON.stringify({ ...owner, adapter_executable: executable }) };
  }
  const operationId = options.operationId ?? randomUUID();
  const stateIndex = command.indexOf("--state-dir");
  let clientFile, clientRecord, operationProgressSnapshot;
  if (stateIndex >= 0 && materializing) {
    const root = command[stateIndex + 1]; await mkdir(root, { recursive: true });
    clientFile = path.join(root, "client-operations", `${sha256(operationId)}.json`);
    clientRecord = { operation_id: operationId, parent_operation_id: operationContext.getStore()?.operationId ?? null, command: operation.split("."), requested_at: now(), request_sha256: hashJson(command), state: "requested", ...(options.capacityContinuation ? { capacity_continuation: options.capacityContinuation } : {}) };
    const daemon = await readJson(path.join(root, "daemon.json")).catch(error => { if (error.code === "ENOENT") return null; throw error; });
    clientRecord.expected_daemon_id = daemon?.daemon_id ?? daemon?.config?.daemonId ?? null;
    await withRunnerLock(path.join(root, "client-ledger"), async () => {
      await reconcileDriverReplies(root, { nativeContracts });
      await writeJsonAtomic(clientFile, clientRecord);
    });
  }
  const modelJournal = argValue(args, "--journal");
  const progressKey = `${modelJournal ?? "none"}:${operationContext.getStore()?.executionId ?? "native"}`;
  if (!deliveredModelProgress.has(progressKey)) deliveredModelProgress.set(progressKey, new Set());
  const modelProgress = modelProgressPump({ journal: modelJournal, context: operationContext.getStore(), notify: options.onModelProgress, delivered: deliveredModelProgress.get(progressKey) });
  let observationError = null;
  const pollModels = () => modelProgress.poll().catch(error => { observationError = error; });
  await pollModels();
  if (observationError) throw Object.assign(new Error("model observations could not be read before dispatch", { cause: observationError }), { code: "model_observation_storage_failed", details: { phase: "prepare", effect: "no_effect", operation_id: operationId } });
  const modelTimer = setInterval(() => { void pollModels(); }, 2000); modelTimer.unref?.();
  const invoke = async () => {
    const env = { ...process.env };
    if (options.env?.DD_FLOW_CONFIG_HOME && !options.env?.DD_FLOW_HOME) {
      // commandJson merges ambient variables; explicit undefined survives that
      // merge and Node omits the key, instead of resurrecting foreign ownership.
      for (const key of Object.keys(env)) if (key.startsWith("DD_FLOW_")) env[key] = undefined;
    }
    Object.assign(env, ownedEnv, { DD_EVAL_OPERATION_ID: operationId });
    // The native boundary owns productive inactivity. The disposable CLI
    // observes only setup/control phases, never a competing work deadline.
    const productive = phase === "native-work";
    const progress = typeof options.onProgress === "function" ? setInterval(() => { void Promise.resolve(options.onProgress()).catch(() => {}); }, 30_000) : null; progress?.unref?.();
    try {
        const receipt = await commandJson(adapter.executable, [...adapter.prefix, ...command], { cwd: options.cwd, env, signal: options.signal, phase: productive ? "native-work" : "control", startupMs: productive ? null : options.startupMs ?? options.timeoutMs ?? 120_000, timeoutMs: productive ? null : options.timeoutMs ?? 30_000,
          operationProgress: clientFile ? async clock => {
            const original = await inspectDaemonOperation(command[stateIndex + 1], operationId).catch(error => { if (error.code === "operation_not_found") return null; throw error; });
            if (original) {
              if (clientRecord.expected_daemon_id && original.daemon_id !== clientRecord.expected_daemon_id
                || original.operation && original.operation !== operation) throw Object.assign(new Error("operation differs from frozen caller identity"), { code: "operation_binding_conflict" });
              const binding = Object.fromEntries(["operation_id", "daemon_id", "operation", "params_sha256", "owner_id", "generation"].map(key => [key, original[key] ?? null]));
              if (clientRecord.daemon_binding && Object.entries(clientRecord.daemon_binding).some(([key, value]) => binding[key] !== value)) throw Object.assign(new Error("operation binding changed during CLI observation"), { code: "operation_binding_conflict" });
              clientRecord.daemon_binding ??= binding;
              if (original.progress && original.progress.sequence > (clientRecord.observation_progress_sequence ?? 0)) {
                clientRecord.observation_progress_sequence = original.progress.sequence;
                operationProgressSnapshot = { cursor: `${original.progress.daemon_id}:${original.progress.sequence}`, observed_at: Date.parse(original.progress.observed_at) };
              }
            }
            const contracts = nativeContracts;
            const waiting = original && contracts?.readOperationWaiting && await contracts.readOperationWaiting(command[stateIndex + 1], operationId, clientRecord.daemon_binding);
            if (waiting) contracts.suspendOperationClock(clock);
            else clock.sample(operationProgressSnapshot);
            await withRunnerLock(path.join(command[stateIndex + 1], "client-ledger"), async () => {
              const current = await readJson(clientFile);
              if (!["completed", "failed"].includes(current.state)) await writeJsonAtomic(clientFile, { ...current, daemon_binding: clientRecord.daemon_binding, observation_progress_sequence: clientRecord.observation_progress_sequence ?? 0, observation_clock: clock.state() });
            });
            return waiting ? { suspended: true } : operationProgressSnapshot;
          } : null });
        if (args[0] === "doctor" && options.validateRuntime !== false) assertObservedRuntime(receipt, profile, "harness doctor");
        return receipt;
    } catch (error) {
      // Missing/invalid native transport output is not a provider verdict.
      // Scope this mapping to driver operations, not semantic utility errors.
      if (error.code === "flow_reconciliation_failed") error.code = "harness_adapter_invalid";
      error.details = { ...error.details, operation_id: error.details?.operation_id ?? operationId, observer_operation_id: operationId };
      throw error;
    } finally { if (progress) clearInterval(progress); }
  };
  const invocation = clientFile ? withSleepInhibitor(invoke, { report: event => {
    void appendFile(path.join(command[stateIndex + 1], "host-events.jsonl"), `${JSON.stringify({ kind: "sleep_inhibitor", observed_at: now(), operation_id: operationId, ...event })}\n`).catch(() => {});
  } }) : invoke();
  try {
    let receipt;
    try { receipt = await invocation; }
    catch (error) {
      if (!clientFile || !(nativeContracts?.isObservationLoss ?? isObservationLoss)(error)) throw error;
      try { receipt = await recoverDriverReply(command[stateIndex + 1], operationId, { signal: options.signal, nativeContracts }); }
      catch (recovery) {
        // Native terminal remains authoritative; unknown reconciliation must
        // retain the original observer/cleanup evidence rather than erase it.
        recovery.details = { ...recovery.details, observation_error: errorRecord(error) };
        if (isObservationLoss(recovery)) {
          recovery.cause ??= error;
        }
        throw recovery;
      }
    }
    clearInterval(modelTimer);
    await pollModels();
    await pollModels(); // Drain a poll which may have started before the adapter reply.
    if (observationError) throw Object.assign(new Error(`model progress could not be persisted: ${observationError.message}`, { cause: observationError }), { code: "model_observation_storage_failed", details: { operation_id: operationId, native_outcome: receipt, observation_error: errorRecord(observationError) } });
    options.signal?.throwIfAborted();
    try { assertTargetSession(receipt, profile, args); }
    catch (error) { error.details = { ...error.details, operation_id: operationId, native_outcome: receipt }; throw error; }
    if (clientFile) {
      try { await writeJsonAtomic(clientFile, { ...clientRecord, state: "completed", finished_at: now(), result: receipt }); }
      catch (error) { throw Object.assign(new Error("native reply could not be persisted to client ledger", { cause: error }), { code: "native_outcome_observation_failed", retryable: false, details: { operation_id: operationId, phase: "client_ledger_publication", native_outcome: receipt, observation_error: errorRecord(error) } }); }
    }
    return receipt;
  } catch (error) {
    // Only the daemon can establish a terminal provider failure. A CLI crash,
    // invalid reply or spawn failure can leave dispatch uncertain.
    if (clientFile) await reconcileDriverReplies(command[stateIndex + 1], { nativeContracts }).catch(() => {});
    throw error;
  } finally { clearInterval(modelTimer); }
}

/** Verify all profiles admitted by the frozen execution contract. */
export async function admitContractProfiles(contract, projectRoot, runtimeRoot) {
  const doctors = [];
  for (const id of contract.admission_profile_ids) {
    const checked = contractProfile(contract, id);
    const doctor = await callDriver(checked, ["doctor", "--cwd", projectRoot, "--model", checked.model, "--reasoning", checked.reasoning], { cwd: projectRoot, env: runtimeEnv(runtimeRoot) });
    assertObservedProfile(doctor, checked, "execution contract doctor");
    doctors.push({ profile_id: id, profile_sha256: contract.profile_sha256[id], doctor });
  }
  return doctors;
}

/** Invoke a provider turn under the caller’s capacity permit. */
export async function providerTurn(profile, args, options, permits = null) {
  const invoke = async () => {
    const bounded = boundedPromptArgs(profile, args);
    // The harness owns productive-turn liveness.  A second runner watchdog
    // races native child events and can convert host sleep into a false abort.
    const receipt = await callDriver(profile, bounded, options);
    if (args[0] === "session" && args[1] === "prompt") await executionDispatchBarrier("continuation");
    if (profile.harness === "antigravity-cli" && args[0] === "session" && args[1] === "prompt" && receipt?.result?.status === "ERROR") {
      const contracts = options.nativeContracts ?? await loadNativeContracts(options.env?.DD_FLOW_CONFIG_HOME);
      throw contracts.agyTerminalFailure(receipt.result, { provider_session_id: receipt.result.conversation_id || receipt.provider_session_id || null,
        observed_at: receipt.terminal_metadata?.observed_at ?? null, operation_id: options.operationId ?? null, journal_locator: argValue(args, "--journal") });
    }
    if (args[0] === "session" && args[1] === "prompt") assertObservedProfile(receipt, profile, "provider Turn");
    return receipt;
  };
  return permits ? permits.use(profile, invoke) : invoke();
}
