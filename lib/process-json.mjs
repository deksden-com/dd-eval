import { spawn } from "node:child_process";
import { reportedError } from "./operation-errors.mjs";
import { recoveryRpcSignal } from "./recovery-observation-budget.mjs";

function failure(message, code) {
  return Object.assign(new Error(message), { code });
}

function reportedFailure(stdout, stderr, fallback) {
  for (const text of [stdout, stderr]) {
    // CLI receipts may be pretty-printed JSON or individual JSONL records.
    for (const line of [text.trim(), ...text.trim().split(/\n/).reverse()]) {
      try {
        const value = JSON.parse(line);
        const error = value?.error;
        if (typeof error?.code === "string" && error.code) return reportedError(error, fallback);
        if (value?.ok === false && typeof value.code === "string") return reportedError({ ...value, message: typeof error === "string" ? error : value.message }, fallback);
      } catch { /* Not a structured CLI error line. */ }
    }
  }
  return failure(stderr.trim() || stdout.trim() || fallback, "flow_reconciliation_failed");
}

function processTarget(executable, args) {
  return /\.[cm]?js$/.test(executable) ? { command: process.execPath, args: [executable, ...args] } : { command: executable, args };
}

export async function commandJson(bin, args, { cwd, env = {}, input = null, onProgress = null, signal } = {}) {
  signal = recoveryRpcSignal(signal);
  signal?.throwIfAborted();
  return await new Promise((resolve, reject) => {
    // A canonical runtime may intentionally shadow the ambient `dd-flow`
    // executable with its captured engine.  Keep that choice in the supplied
    // environment rather than letting a host-global shim leak into a run.
    const executable = bin === "dd-flow" && typeof env.DD_FLOW_BIN === "string" ? env.DD_FLOW_BIN : bin;
    const target = processTarget(executable, [...args, "--json"]);
    // Only the owned CLI observer is interrupted, never its detached runtime.
    const child = spawn(target.command, target.args, { cwd, env: { ...process.env, ...env }, signal, killSignal: "SIGKILL", stdio: [input === null ? "ignore" : "pipe", "pipe", "pipe"] });
    let stdout = ""; let stderr = ""; let pendingStderr = ""; let settled = false; let progressError = null;
    const finish = (error, value) => {
      if (settled) return;
      settled = true;
      error ? reject(error) : resolve(value);
    };
    const deliverProgress = (line) => {
      let value;
      try { value = JSON.parse(line); } catch { return; }
      if (typeof onProgress !== "function" || progressError) return;
      try {
        const returned = onProgress(value);
        if (returned && typeof returned.then === "function") {
          Promise.resolve(returned).catch(() => {});
          throw failure("commandJson onProgress must be synchronous", "progress_callback_async");
        }
      } catch (error) {
        progressError = error;
        child.kill("SIGKILL");
      }
    };
    child.stdout.setEncoding("utf8").on("data", (data) => { stdout += data; });
    child.stderr.setEncoding("utf8").on("data", (data) => {
      stderr += data; pendingStderr += data;
      for (;;) {
        const end = pendingStderr.indexOf("\n"); if (end < 0) break;
        const line = pendingStderr.slice(0, end); pendingStderr = pendingStderr.slice(end + 1);
        deliverProgress(line);
      }
    });
    child.once("error", (error) => finish(progressError ?? error));
    if (input !== null) child.stdin.end(input);
    child.on("close", (status) => {
      if (pendingStderr) deliverProgress(pendingStderr);
      if (progressError) return finish(progressError);
      if (status !== 0) return finish(reportedFailure(stdout, stderr, `${executable} exited ${status}`));
      try {
        const value = JSON.parse(stdout.trim());
        if (value?.ok === false) {
          const error = value.error && typeof value.error === "object" ? value.error : value;
          if (typeof error.code === "string") return finish(reportedError(error, `${bin} returned an error envelope`));
        }
        finish(null, value);
      } catch (error) { finish(failure(`${bin} returned invalid JSON: ${error.message}`, "flow_reconciliation_failed")); }
    });
  });
}

export async function commandText(bin, args, { cwd, env = {} } = {}) {
  return await new Promise((resolve, reject) => {
    const executable = bin === "dd-flow" && typeof env.DD_FLOW_BIN === "string" ? env.DD_FLOW_BIN : bin;
    const target = processTarget(executable, args);
    const child = spawn(target.command, target.args, { cwd, env: { ...process.env, ...env }, stdio: ["ignore", "pipe", "pipe"] }); let stdout = ""; let stderr = "";
    child.stdout.setEncoding("utf8").on("data", (data) => { stdout += data; }); child.stderr.setEncoding("utf8").on("data", (data) => { stderr += data; }); child.on("error", reject);
    child.on("close", (status) => status === 0 ? resolve(stdout.trim()) : reject(failure(stderr.trim() || stdout.trim() || `${executable} exited ${status}`, "command_failed")));
  });
}
