import { execFile } from "node:child_process";
import { promisify } from "node:util";
import childProcess from "node:child_process";
const run = promisify(execFile);
const inspectionEnvironment = () => {
  const env = { ...process.env }; delete env.OPENROUTER_API_KEY; delete env.OPENAI_DECISIONS_API_KEY; return env;
};

/** Read-only retirement proof. A recycled PID is not the retained process.
 * The caller must bind stoppedAt to its settled shutdown, not acquisition time.
 * ps has one-second precision; ambiguous/unknown identity stays blocked. */
export function processRetired(pid, stoppedAt) {
  try { process.kill(pid, 0); }
  catch (error) {
    if (error.code === "ESRCH") return true;
    // EPERM proves only that this PID cannot be signalled. It may belong to
    // another user after recycling; the read-only birth probe still decides.
    if (error.code !== "EPERM") throw error;
  }
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
export async function processSnapshot({ pid, inspect = run } = {}) {
  if (pid !== undefined && (!Number.isSafeInteger(pid) || pid <= 0)) throw new TypeError("Invalid process identity");
  const args = pid === undefined ? ["-axo", "pid=,ppid=,pgid=,lstart=,stat="] : ["-p", String(pid), "-o", "pid=,ppid=,pgid=,lstart=,stat="];
  let stdout;
  try { ({ stdout } = await inspect("ps", args, { timeout: 5_000, env: inspectionEnvironment() })); }
  catch (error) {
    // A bounded OS read is not an agent deadline or proof of owner death.
    if (pid !== undefined) try { process.kill(pid, 0); } catch (probe) { if (probe.code === "ESRCH") return []; }
    throw Object.assign(new Error("Process identity observation unavailable", { cause: error }), {
      code: "process_ownership_unknown", details: { pid: pid ?? null, exit_code: error.code ?? null, signal: error.signal ?? null, stderr: String(error.stderr ?? '').slice(-4096) }
    });
  }
  const lines = stdout.trim() ? stdout.trim().split('\n') : [];
  const parsed = lines.map(line => { const parts = line.trim().split(/\s+/); return parts.length >= 9 && parts.slice(0, 3).every(value => /^\d+$/.test(value))
    ? { pid: Number(parts[0]), ppid: Number(parts[1]), pgid: Number(parts[2]), started: parts.slice(3, 8).join(' '), zombie: parts[8].startsWith('Z') } : null; });
  if (parsed.some(row => !row) || !parsed.length || pid !== undefined && !parsed.some(row => row.pid === pid)) {
    if (pid !== undefined) try { process.kill(pid, 0); } catch (error) { if (error.code === 'ESRCH') return []; }
    throw Object.assign(new Error('Process identity observation has no valid matching rows'), { code: 'process_ownership_unknown', details: { pid: pid ?? null } });
  }
  return parsed;
}
