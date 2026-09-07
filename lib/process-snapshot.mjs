import { execFile } from "node:child_process";
import { promisify } from "node:util";
const run = promisify(execFile);

/** Inspect OS descendants without using process names as ownership. A start-time
 * identity prevents a later unrelated process with a recycled PID being killed. */
export async function processSnapshot() {
  const { stdout } = await run("ps", ["-axo", "pid=,ppid=,pgid=,lstart=,stat="], { timeout: 5_000 });
  return stdout.trim().split("\n").flatMap(line => { const parts = line.trim().split(/\s+/); return parts.length >= 9 ? [{ pid: Number(parts[0]), ppid: Number(parts[1]), pgid: Number(parts[2]), started: parts.slice(3, 8).join(" "), zombie: parts[8].startsWith("Z") }] : []; });
}
