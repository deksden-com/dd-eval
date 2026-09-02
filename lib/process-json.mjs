import { spawn } from "node:child_process";

function failure(message, code) {
  return Object.assign(new Error(message), { code });
}

function reportedFailure(stdout, stderr, fallback) {
  for (const text of [stdout, stderr]) {
    for (const line of text.trim().split(/\n/).reverse()) {
      try {
        const value = JSON.parse(line);
        const error = value?.error;
        if (typeof error?.code === "string" && error.code) return failure(typeof error.message === "string" ? error.message : fallback, error.code);
      } catch { /* Not a structured CLI error line. */ }
    }
  }
  return failure(stderr.trim() || stdout.trim() || fallback, "flow_reconciliation_failed");
}

function processTarget(executable, args) {
  return /\.[cm]?js$/.test(executable) ? { command: process.execPath, args: [executable, ...args] } : { command: executable, args };
}

export async function commandJson(bin, args, { cwd, env = {}, input = null, onProgress = null } = {}) {
  return await new Promise((resolve, reject) => {
    // A canonical runtime may intentionally shadow the ambient `dd-flow`
    // executable with its captured engine.  Keep that choice in the supplied
    // environment rather than letting a host-global shim leak into a run.
    const executable = bin === "dd-flow" && typeof env.DD_FLOW_BIN === "string" ? env.DD_FLOW_BIN : bin;
    const target = processTarget(executable, [...args, "--json"]);
    const child = spawn(target.command, target.args, { cwd, env: { ...process.env, ...env }, stdio: [input === null ? "ignore" : "pipe", "pipe", "pipe"] });
    let stdout = ""; let stderr = ""; let pendingStderr = "";
    child.stdout.setEncoding("utf8").on("data", (data) => { stdout += data; });
    child.stderr.setEncoding("utf8").on("data", (data) => {
      stderr += data; pendingStderr += data;
      for (;;) {
        const end = pendingStderr.indexOf("\n"); if (end < 0) break;
        const line = pendingStderr.slice(0, end); pendingStderr = pendingStderr.slice(end + 1);
        if (typeof onProgress === "function") { try { onProgress(JSON.parse(line)); } catch { /* Ordinary diagnostics stay in stderr evidence. */ } }
      }
    });
    child.on("error", reject);
    if (input !== null) child.stdin.end(input);
    child.on("close", (status) => {
      if (status !== 0) return reject(reportedFailure(stdout, stderr, `${executable} exited ${status}`));
      try { resolve(JSON.parse(stdout.trim())); }
      catch (error) { reject(failure(`${bin} returned invalid JSON: ${error.message}`, "flow_reconciliation_failed")); }
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
