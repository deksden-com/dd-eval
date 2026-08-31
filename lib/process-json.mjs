import { spawn } from "node:child_process";

function failure(message, code) {
  return Object.assign(new Error(message), { code });
}

export async function commandJson(bin, args, { cwd, env = {}, input = null, onProgress = null } = {}) {
  return await new Promise((resolve, reject) => {
    const child = spawn(bin, [...args, "--json"], { cwd, env: { ...process.env, ...env }, stdio: [input === null ? "ignore" : "pipe", "pipe", "pipe"] });
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
      if (status !== 0) return reject(failure(stderr.trim() || stdout.trim() || `${bin} exited ${status}`, "flow_reconciliation_failed"));
      try { resolve(JSON.parse(stdout.trim())); }
      catch (error) { reject(failure(`${bin} returned invalid JSON: ${error.message}`, "flow_reconciliation_failed")); }
    });
  });
}

export async function commandText(bin, args, { cwd, env = {} } = {}) {
  return await new Promise((resolve, reject) => {
    const child = spawn(bin, args, { cwd, env: { ...process.env, ...env }, stdio: ["ignore", "pipe", "pipe"] }); let stdout = ""; let stderr = "";
    child.stdout.setEncoding("utf8").on("data", (data) => { stdout += data; }); child.stderr.setEncoding("utf8").on("data", (data) => { stderr += data; }); child.on("error", reject);
    child.on("close", (status) => status === 0 ? resolve(stdout.trim()) : reject(failure(stderr.trim() || stdout.trim() || `${bin} exited ${status}`, "command_failed")));
  });
}
