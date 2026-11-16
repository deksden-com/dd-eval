import { spawn } from "node:child_process";
import { randomUUID } from 'node:crypto';
import { setupObserver, observationDetails, SETUP_STARTUP_MS } from './setup-progress.mjs';
import { diagnosticLimit, structuredFailure, reportedFailure } from "./harness/process-failure.mjs";
import { reportedError } from "./operation-errors.mjs";
import { diagnosticAdvances, diagnosticReader } from "./harness/process-diagnostics.mjs";
export { reportedFailure } from "./harness/process-failure.mjs";
import { recoveryRpcSignal, recoveryRpcActivity } from "./recovery-observation-budget.mjs";
import { ObservationClock, validateObservationDuration } from "./observation-clock.mjs";
import { stopProcessGroup } from "./managed-daemon.mjs";
import { isInstalledFlow } from './installed-flows.mjs';

// Optional EVAL classifier credentials belong to the JS owner, never its children.
export function childEnvironment(extra = {}) {
  const env = { ...process.env, ...extra };
  delete env.OPENROUTER_API_KEY;
  delete env.OPENAI_DECISIONS_API_KEY;
  return env;
}
const tail = (text, data) => (text + data).slice(-diagnosticLimit);
export function commandObservationTimeout(args, phase = null) {
  const memoryPrepare = args.includes("--prepare-only") && (["init", "upgrade"].includes(args[0])
    || args[0] === "flow" && isInstalledFlow(args[1]));
  return phase === "work" || args[0] === "setup" || memoryPrepare || args.some(arg => ["clone", "install", "build", "snapshot"].includes(arg)) ? 30 * 60_000 : 30_000;
}

function failure(message, code) {
  return Object.assign(new Error(message), { code });
}

function processTarget(executable, args) {
  return /\.[cm]?js$/.test(executable) ? { command: process.execPath, args: [executable, ...args] } : { command: executable, args };
}
function closeBarrier(child) {
  let closed = false, release;
  child.once("close", () => { closed = true; release?.(); });
  return async () => {
    if (closed) return;
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(failure("Owned CLI stdio did not close after retirement", "process_close_unconfirmed")), 1000);
      release = () => { clearTimeout(timer); resolve(); };
    });
  };
}

export async function commandJson(bin, args, options = {}) {
  const { cwd, env: suppliedEnv = {}, input = null, onProgress = null, operationProgress = null, signal: suppliedSignal, phase = null,
    timeoutMs = commandObservationTimeout(args, phase), startupMs = Object.hasOwn(options, 'timeoutMs') ? timeoutMs : SETUP_STARTUP_MS } = options;
  let env = suppliedEnv, signal = suppliedSignal;
  if (startupMs !== null) validateObservationDuration(startupMs);
  env = { ...env, DD_EVAL_OPERATION_ID: env.DD_EVAL_OPERATION_ID ?? randomUUID() };
  if (!(phase === "native-work" && timeoutMs === null)) validateObservationDuration(timeoutMs);
  signal = recoveryRpcSignal(signal);
  signal?.throwIfAborted();
  return await new Promise((resolve, reject) => {
    // A canonical runtime may intentionally shadow the ambient `dd-flow`
    // executable with its captured engine.  Keep that choice in the supplied
    // environment rather than letting a host-global shim leak into a run.
    const executable = bin === "dd-flow" && typeof env.DD_FLOW_BIN === "string" ? env.DD_FLOW_BIN : bin;
    const target = processTarget(executable, [...args, "--json"]);
    // Only the owned CLI observer is interrupted, never its detached runtime.
    const child = spawn(target.command, target.args, { cwd, env: childEnvironment(env), detached: true, stdio: [input === null ? "ignore" : "pipe", "pipe", "pipe"] });
    const drain = closeBarrier(child);
    let stdout = ""; let stderr = ""; let settled = false; let progressError = null; let cursor = 0;
    let cleanup, inputError, stderrFailure;
    const phaseMarkers = new Set();
    const stopOwned = error => {
      progressError ??= error;
      cleanup ??= stopProcessGroup(child, 1000).then(drain).catch(cause => { progressError.cleanup_error = { code: cause.code, message: cause.message, details: cause.details }; });
      void cleanup.then(() => finish(progressError));
    };
    const abort = () => stopOwned(Object.assign(new Error("CLI observation aborted", { cause: signal.reason }), { name: "AbortError", code: "ABORT_ERR" }));
    signal?.addEventListener("abort", abort, { once: true });
    const clock = timeoutMs === null ? null : new ObservationClock({ timeoutMs: startupMs ?? timeoutMs });
    const observeSetup = setupObserver(env.DD_EVAL_OPERATION_ID);
    clock?.sample(cursor);
    const productive = () => { cursor += 1; if (!operationProgress) clock?.sample(cursor, Date.now()); };
    let sampling = false;
    const timer = clock && setInterval(async () => {
      if (sampling) return;
      sampling = true;
      try {
      const observation = operationProgress ? await operationProgress(clock) : cursor;
      if (settled) return;
      if (observation?.suspended === true) return;
      if (clock.sample(observation)) {
        progressError ??= failure(`${executable} ${phase ?? "control"} observation became unavailable`, "operation_observation_lost");
        progressError.details ??= observationDetails(clock, phase, child.pid);
        stopOwned(progressError);
      }
      else if (operationProgress && observation && typeof observation === 'object'
        && clock.progress === observation.cursor && clock.progressAt === observation.observed_at)
        recoveryRpcActivity(env.DD_EVAL_OPERATION_ID, observation.cursor);
      } catch (error) { if (!settled) stopOwned(error); }
      finally { sampling = false; }
    }, Math.min(1000, timeoutMs));
    timer?.unref();
    const finish = (error, value) => {
      if (settled) return;
      settled = true;
      clearInterval(timer);
      signal?.removeEventListener("abort", abort);
      error ? reject(error) : resolve(value);
    };
    const deliverProgress = (line) => {
      let value;
      try { value = JSON.parse(line); } catch { productive(); return; }
      if (value?.kind === 'setup_phase') {
        if (observeSetup(value)) {
          if (clock) clock.setupProgress = { phase: value.phase, sequence: value.sequence, step: value.step, operation_id: value.operation_id };
          if (clock) clock.timeoutMs = ['ingress_entered', 'probe_started'].includes(value.phase) ? startupMs ?? timeoutMs : timeoutMs;
          productive();
          // Setup precedes the native ledger. A bound milestone may renew that
          // same observer; older retained ledger timestamps cannot renew it.
          if (operationProgress) clock?.sample(`setup:${value.sequence}`, Date.parse(value.observed_at));
        }
        return;
      }
      stderrFailure = structuredFailure(line, "", `${executable} failed`) ?? stderrFailure;
      // Only actual phase transitions are progress; elapsed/poll diagnostics
      // cannot keep a stalled CLI alive. Output itself is handled separately.
      if (diagnosticAdvances(value, phaseMarkers)) productive();
      if (typeof onProgress !== "function" || progressError) return;
      try {
        const returned = onProgress(value);
        if (returned && typeof returned.then === "function") {
          Promise.resolve(returned).catch(() => {});
          throw failure("commandJson onProgress must be synchronous", "progress_callback_async");
        }
      } catch (error) {
        progressError = error;
        stopOwned(error);
      }
    };
    const diagnostics = diagnosticReader(deliverProgress, productive);
    child.stdout.setEncoding("utf8").on("data", (data) => {
      productive();
      stdout += data;
    });
    child.stderr.setEncoding("utf8").on("data", (data) => {
      // The bounded text tail may lose an earlier typed primary. Retain only
      // its structured summary, never an unbounded diagnostics history.
      stderrFailure = structuredFailure("", stderr + data, `${executable} failed`) ?? stderrFailure;
      stderr = tail(stderr, data);
      diagnostics.write(data);
    });
    child.once("error", error => { progressError ??= error; });
    if (input !== null) { child.stdin.on("error", error => { inputError ??= error; }); child.stdin.end(input); }
    child.on("close", async (status) => {
      diagnostics.flush();
      if (cleanup) await cleanup;
      if (progressError) return finish(progressError);
      if (status !== 0) return finish(reportedFailure(stdout, stderr, `${executable} exited ${status}`, stderrFailure));
      try {
        const value = JSON.parse(stdout.trim());
        if (value?.ok === false) {
          const error = value.error && typeof value.error === "object" ? value.error : value;
          if (typeof error.code === "string") return finish(reportedError(error, `${bin} returned an error envelope`));
        }
        if (inputError) return finish(inputError);
        finish(null, value);
      } catch (error) { finish(failure(`${bin} returned invalid JSON: ${error.message}`, "flow_reconciliation_failed")); }
    });
  });
}

export async function commandText(bin, args, options = {}) {
  const { cwd, env: suppliedEnv = {}, signal: suppliedSignal, phase = null,
    timeoutMs = commandObservationTimeout(args, phase), startupMs = Object.hasOwn(options, 'timeoutMs') ? timeoutMs : SETUP_STARTUP_MS } = options;
  let env = suppliedEnv, signal = suppliedSignal;
  if (startupMs !== null) validateObservationDuration(startupMs);
  env = { ...env, DD_EVAL_OPERATION_ID: env.DD_EVAL_OPERATION_ID ?? randomUUID() };
  validateObservationDuration(timeoutMs);
  signal = recoveryRpcSignal(signal);
  signal?.throwIfAborted();
  return await new Promise((resolve, reject) => {
    const executable = bin === "dd-flow" && typeof env.DD_FLOW_BIN === "string" ? env.DD_FLOW_BIN : bin;
    const target = processTarget(executable, args);
    const child = spawn(target.command, target.args, { cwd, env: childEnvironment(env), detached: true, stdio: ["ignore", "pipe", "pipe"] }); let stdout = ""; let stderr = ""; let cursor = 0; let localError, cleanup, settled = false;
    const drain = closeBarrier(child);
    const finish = (error, value) => { if (settled) return; settled = true; clearInterval(timer); signal?.removeEventListener("abort", abort); error ? reject(error) : resolve(value); };
    const stopOwned = error => { localError ??= error; cleanup ??= stopProcessGroup(child, 1000).then(drain).catch(cause => { localError.cleanup_error = { code: cause.code, message: cause.message, details: cause.details }; }); void cleanup.then(() => finish(localError)); };
    const abort = () => stopOwned(Object.assign(new Error("CLI observation aborted", { cause: signal.reason }), { name: "AbortError", code: "ABORT_ERR" }));
    signal?.addEventListener("abort", abort, { once: true });
    const clock = new ObservationClock({ timeoutMs: startupMs ?? timeoutMs });
    const observeSetup = setupObserver(env.DD_EVAL_OPERATION_ID);
    clock.sample(cursor);
    const productive = () => { cursor += 1; clock.sample(cursor, Date.now()); };
    const markers = new Set();
    const diagnostics = diagnosticReader(line => {
      let value;
      try { value = JSON.parse(line); } catch { productive(); return; }
      if (value?.kind === 'setup_phase') {
        if (observeSetup(value)) { clock.setupProgress = { phase: value.phase, sequence: value.sequence, step: value.step, operation_id: value.operation_id }; clock.timeoutMs = ['ingress_entered', 'probe_started'].includes(value.phase) ? startupMs ?? timeoutMs : timeoutMs; productive(); }
        return;
      }
      if (diagnosticAdvances(value, markers)) productive();
    }, productive);
    const timer = setInterval(() => { if (clock.sample(cursor)) stopOwned(Object.assign(failure(`${executable} ${phase ?? "control"} observation became unavailable`, "operation_observation_lost"), { details: observationDetails(clock, phase, child.pid) })); }, Math.min(1000, timeoutMs));
    timer.unref();
    child.stdout.setEncoding("utf8").on("data", data => {
      productive();
      stdout += data;
    });
    child.stderr.setEncoding("utf8").on("data", data => { stderr = tail(stderr, data); diagnostics.write(data); });
    child.on("error", error => { localError ??= error; });
    child.on("close", async status => { diagnostics.flush(); if (cleanup) await cleanup; localError ? finish(localError) : status === 0 ? finish(null, stdout.trim()) : finish(failure(stderr.trim() || stdout.trim() || `${executable} exited ${status}`, "command_failed")); });
  });
}
