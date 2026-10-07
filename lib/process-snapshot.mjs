import { execFile } from "node:child_process";
import { promisify } from "node:util";
import childProcess from "node:child_process";
const run = promisify(execFile);
const inspectionEnvironment = () => {
  const env = { ...process.env }; delete env.OPENROUTER_API_KEY; return env;
};

/** Read-only retirement proof. A recycled PID is not the retained process.
 * The caller must bind stoppedAt to its settled shutdown, not acquisition time.
 * ps has one-second precision; ambiguous/unknown identity stays blocked. */
export function processRetired(pid, stoppedAt) {
  try { process.kill(pid, 0); }
  catch (error) { if (error.code === "ESRCH") return true; throw error; }
  const stopped = Date.parse(stoppedAt);
  if (!Number.isFinite(stopped)) return false;
  const started = childProcess.execFileSync("ps", ["-p", String(pid), "-o", "lstart="], {
    encoding: "utf8", timeout: 5_000, env: { ...inspectionEnvironment(), TZ: "UTC", LC_ALL: "C" }
  }).trim();
  const born = Date.parse(`${started} UTC`);
  return Number.isFinite(born) && born > stopped + 1_000;
}

/** Inspect OS descendants without using process names as ownership. A start-time
 * identity prevents a later unrelated process with a recycled PID being killed. */
export async function processSnapshot() {
  const { stdout } = await run("ps", ["-axo", "pid=,ppid=,pgid=,lstart=,stat="], { timeout: 5_000, env: inspectionEnvironment() });
  return stdout.trim().split("\n").flatMap(line => { const parts = line.trim().split(/\s+/); return parts.length >= 9 ? [{ pid: Number(parts[0]), ppid: Number(parts[1]), pgid: Number(parts[2]), started: parts.slice(3, 8).join(" "), zombie: parts[8].startsWith("Z") }] : []; });
}
