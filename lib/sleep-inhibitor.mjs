import { spawn } from "node:child_process";

/** Temporary, process-bound inhibition only. Explicit/critical battery sleep is
 * still possible, so this never replaces observation-gap handling. */
export async function withSleepInhibitor(action, { platform = process.platform, launch = spawn, report = () => {} } = {}) {
  const command = platform === "darwin" ? ["/usr/bin/caffeinate", ["-i", "-w", String(process.pid)]]
    : platform === "linux" ? ["systemd-inhibit", ["--what=idle:sleep", "--who=dd-eval", "--why=local evaluation", "--mode=block", "tail", `--pid=${process.pid}`, "-f", "/dev/null"]] : null;
  if (!command) { report({ state: "unavailable", platform }); return await action(); }
  const child = launch(command[0], command[1], { stdio: "ignore" });
  child.once("error", error => report({ state: "unavailable", platform, error: error.message }));
  child.once("exit", (code, signal) => report({ state: "stopped", platform, code, signal }));
  report({ state: "requested", platform, pid: child.pid ?? null });
  try { return await action(); }
  finally { if (child.exitCode === null && child.signalCode === null) child.kill("SIGTERM"); }
}
