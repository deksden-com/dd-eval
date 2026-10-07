import { spawn } from "node:child_process";
import { reportedError } from "./operation-errors.mjs";
import { recoveryRpcSignal } from "./recovery-observation-budget.mjs";
import { ObservationClock, validateObservationDuration } from "./observation-clock.mjs";
import { stopProcessGroup } from "./managed-daemon.mjs";

const replyLimit = 8 * 1024 * 1024;
// Optional EVAL classifier credentials belong to the JS owner, never its children.
export function childEnvironment(extra = {}) {
  const env = { ...process.env, ...extra };
  delete env.OPENROUTER_API_KEY;
  delete env.OPENAI_DECISIONS_API_KEY;
  return env;
}
const diagnosticLimit = 64 * 1024;
const tail = (text, data) => (text + data).slice(-diagnosticLimit);
export function commandObservationTimeout(args, phase = null) {
  return phase === "work" || args.some(arg => ["clone", "install", "build", "snapshot"].includes(arg)) ? 30 * 60_000 : 30_000;
}

function failure(message, code) {
  return Object.assign(new Error(message), { code });
}

function diagnosticAdvances(value, markers) {
  if (["heartbeat", "poll", "status"].includes(value?.kind)) return false;
  if (!["native_hook_phase", "process_maintenance_phase"].includes(value?.kind)) return true;
  if (typeof value.phase !== "string" || ["heartbeat", "poll", "elapsed", "wait", "waiting"].includes(value.phase) || ["heartbeat", "poll", "status"].includes(value.action)) return false;
  const marker = JSON.stringify([value.kind, value.operation_id ?? value.process_id ?? null, value.action ?? null, value.phase]);
  if (markers.has(marker)) return false;
  markers.add(marker);
  return true;
}

function diagnosticReader(onLine, onPlainFragment) {
  let pending = "", discarding = false;
  return {
    write(data) {
      if (discarding) {
        const end = data.indexOf("\n"); if (end < 0) return;
        discarding = false; data = data.slice(end + 1);
      }
      pending += data;
      for (;;) {
        const end = pending.indexOf("\n"); if (end < 0) break;
        const line = pending.slice(0, end); pending = pending.slice(end + 1);
        if (line.length <= diagnosticLimit) onLine(line);
        else if (!line.trimStart().startsWith("{")) onPlainFragment();
      }
      // Git/build progress often uses carriage returns rather than newlines.
      // Only a non-structured partial line may count immediately; fragmented
      // JSON keepalive must still wait for its trusted line classification.
      if (pending.trim() && !pending.trimStart().startsWith("{")) onPlainFragment();
      if (pending.length > diagnosticLimit) {
        if (pending.trimStart().startsWith("{")) { pending = ""; discarding = true; }
        else { onPlainFragment(); pending = pending.slice(-diagnosticLimit); }
      }
    },
    flush() { if (pending) onLine(pending); pending = ""; }
  };
}

function structuredFailure(stdout, stderr, fallback) {
  for (const text of [stdout, stderr]) {
    // Retain the whole pretty receipt after recognized JSONL diagnostics;
    // arbitrary stderr still cannot masquerade as an error envelope.
    const envelope = text.split(/\n/).filter(line => {
      try { return !["native_hook_phase", "process_maintenance_phase"].includes(JSON.parse(line)?.kind); }
      catch { return true; }
    }).join("\n").trim();
    for (const line of [text.trim(), envelope, ...text.trim().split(/\n/).reverse()]) {
      try {
        const value = JSON.parse(line);
        if (["native_hook_phase", "process_maintenance_phase"].includes(value?.kind)) continue;
        const error = value?.error;
        if (typeof error?.code === "string" && error.code) return reportedError(error, fallback);
        if (value?.ok === false && typeof value.code === "string") return reportedError({ ...value, message: typeof error === "string" ? error : value.message }, fallback);
      } catch { /* Not a structured CLI error line. */ }
    }
    // Pretty JSON may precede unrelated diagnostics in the same pipe chunk.
    // JSON.parse remains the parser; a bounded candidate lasts only until a
    // complete JSON object is recognized, not for the life of the command.
    let candidate = "", retained = null;
    for (const line of text.split(/\n/)) {
      if (!candidate && !line.trimStart().startsWith("{")) continue;
      candidate = candidate ? `${candidate}\n${line}` : line;
      if (candidate.length > diagnosticLimit) { candidate = ""; continue; }
      if (!line.trimEnd().endsWith("}")) continue;
      try {
        const value = JSON.parse(candidate); candidate = "";
        if (["native_hook_phase", "process_maintenance_phase"].includes(value?.kind)) continue;
        if (typeof value?.error?.code === "string" && value.error.code) retained = reportedError(value.error, fallback);
        else if (value?.ok === false && typeof value.code === "string") retained = reportedError({ ...value, message: typeof value.error === "string" ? value.error : value.message }, fallback);
      } catch { /* A multiline candidate is not complete yet. */ }
    }
    if (retained) return retained;
  }
  return null;
}

export function reportedFailure(stdout, stderr, fallback, retained = null) {
  return structuredFailure(stdout, stderr, fallback) ?? retained ?? failure(stderr.trim() || stdout.trim() || fallback, "flow_reconciliation_failed");
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

export async function commandJson(bin, args, { cwd, env = {}, input = null, onProgress = null, signal, phase = null, timeoutMs = commandObservationTimeout(args, phase) } = {}) {
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
    const clock = timeoutMs === null ? null : new ObservationClock({ timeoutMs });
    clock?.sample(cursor);
    const productive = () => { cursor += 1; clock?.sample(cursor, Date.now()); };
    const timer = clock && setInterval(() => {
      if (clock.sample(cursor)) {
        progressError ??= failure(`${executable} ${phase ?? "control"} observation became unavailable`, "operation_observation_lost");
        stopOwned(progressError);
      }
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
      if (Buffer.byteLength(stdout) + Buffer.byteLength(data) > replyLimit) {
        progressError ??= failure(`${executable} final JSON exceeds the observer reply limit`, "operation_output_limit");
        stopOwned(progressError);
      } else stdout += data;
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

export async function commandText(bin, args, { cwd, env = {}, signal, phase = null, timeoutMs = commandObservationTimeout(args, phase) } = {}) {
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
    const clock = new ObservationClock({ timeoutMs });
    clock.sample(cursor);
    const productive = () => { cursor += 1; clock.sample(cursor, Date.now()); };
    const markers = new Set();
    const diagnostics = diagnosticReader(line => {
      let value;
      try { value = JSON.parse(line); } catch { productive(); return; }
      if (diagnosticAdvances(value, markers)) productive();
    }, productive);
    const timer = setInterval(() => { if (clock.sample(cursor)) stopOwned(failure(`${executable} ${phase ?? "control"} observation became unavailable`, "operation_observation_lost")); }, Math.min(1000, timeoutMs));
    timer.unref();
    child.stdout.setEncoding("utf8").on("data", data => {
      productive();
      if (Buffer.byteLength(stdout) + Buffer.byteLength(data) > replyLimit) stopOwned(failure(`${executable} reply exceeds the observer reply limit`, "operation_output_limit"));
      else stdout += data;
    });
    child.stderr.setEncoding("utf8").on("data", data => { stderr = tail(stderr, data); diagnostics.write(data); });
    child.on("error", error => { localError ??= error; });
    child.on("close", async status => { diagnostics.flush(); if (cleanup) await cleanup; localError ? finish(localError) : status === 0 ? finish(null, stdout.trim()) : finish(failure(stderr.trim() || stdout.trim() || `${executable} exited ${status}`, "command_failed")); });
  });
}
