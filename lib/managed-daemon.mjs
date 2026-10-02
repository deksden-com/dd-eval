import { commandJson } from "./process-json.mjs";
import { errorRecord } from "./operation-errors.mjs";

export async function runtimeProcess(config, action, options = {}) {
  if (!config.resourceHome || !config.ddFlowHome || !config.ddFlowBin) return null;
  const args = ["runtime", "process", action];
  for (const [key, value] of Object.entries(options)) if (value !== null && value !== undefined) args.push(`--${key}`, String(value));
  return await commandJson(config.ddFlowBin, args, {
    cwd: config.cwd,
    env: { ...(config.env ?? {}), DD_FLOW_HOME: config.ddFlowHome, DD_FLOW_RESOURCE_HOME: config.resourceHome }
  });
}

const processStops = new WeakMap();
export async function stopProcessGroup(child, graceMs = 1_000, { detached = true, settlementMs = 10_000 } = {}) {
  if (!child?.pid) return;
  if (processStops.has(child)) return await processStops.get(child);
  const pending = stopOwnedChild(child, graceMs, detached, settlementMs);
  processStops.set(child, pending);
  try { return await pending; } finally { processStops.delete(child); }
}
async function stopOwnedChild(child, graceMs, detached, settlementMs) {
  const target = process.platform === "win32" || !detached ? child.pid : -child.pid;
  const details = signal => ({ pid: child.pid, pgid: target < 0 ? child.pid : null, signal, platform: process.platform, exit_code: child.exitCode ?? null, signal_code: child.signalCode ?? null, observed_at: new Date().toISOString() });
  const alive = () => { try { process.kill(target, 0); return true; } catch (error) { if (error.code === "ESRCH") return false; if (error.code === "EPERM") return true; throw error; } };
  const gone = async ms => {
    const deadline = performance.now() + ms;
    while (alive() && performance.now() < deadline) await new Promise(resolve => setTimeout(resolve, 25));
    return !alive();
  };
  const signal = async name => {
    try { process.kill(target, name); return true; }
    catch (error) {
      if (error.code === "ESRCH") return false;
      error.details = { ...error.details, ...details(name), syscall: error.syscall ?? "kill" };
      // Permission denial is not permission to escalate. Observe only the retained target.
      let absent = false;
      try { absent = await gone(Math.min(250, Math.max(25, graceMs))); }
      catch (observation) { error.details.observation_error = errorRecord(observation); }
      if (absent) {
        process.stderr.write(`${JSON.stringify({ cleanup_reobserved: errorRecord(error), physical_exit: "ESRCH" })}\n`);
        return false;
      }
      throw error;
    }
  };
  if (!alive()) return;
  const leaderExited = () => child.exitCode != null || child.signalCode != null;
  const observeLeaderless = async () => {
    // Signal grace is not a drain deadline. Observe natural retirement without
    // signaling a group whose leader can no longer prove ownership.
    if (await gone(Math.max(1_000, graceMs, settlementMs))) return;
    throw Object.assign(new Error("process group remains after its leader exited; ownership cannot be proven from this child handle"), { code: "process_group_ownership_unknown", details: { ...details(null), settlement_ms: Math.max(1_000, graceMs, settlementMs) } });
  };
  if (leaderExited()) return await observeLeaderless();
  if (!await signal("SIGTERM")) return;
  if (await gone(graceMs)) return;
  if (leaderExited()) return await observeLeaderless();
  if (!await signal("SIGKILL")) return;
  if (!await gone(Math.max(1_000, graceMs))) throw Object.assign(new Error(`process group ${child.pid} did not stop`), { code: "process_group_stop_incomplete", details: details("SIGKILL") });
}
