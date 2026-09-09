import { commandJson } from "./process-json.mjs";

export async function runtimeProcess(config, action, options = {}) {
  if (!config.resourceHome || !config.ddFlowHome || !config.ddFlowBin) return null;
  const args = ["runtime", "process", action];
  for (const [key, value] of Object.entries(options)) if (value !== null && value !== undefined) args.push(`--${key}`, String(value));
  return await commandJson(config.ddFlowBin, args, {
    cwd: config.cwd,
    env: { ...(config.env ?? {}), DD_FLOW_HOME: config.ddFlowHome, DD_FLOW_RESOURCE_HOME: config.resourceHome }
  });
}

export async function stopProcessGroup(child, graceMs = 1_000) {
  if (!child?.pid) return;
  // Harness bridges are detached on Unix, so their own process group is the
  // smallest reliable unit of cleanup. Windows has no equivalent negative-PID
  // signal operation; there the direct child is the safe best effort.
  const target = process.platform === "win32" ? child.pid : -child.pid;
  const alive = () => { try { process.kill(target, 0); return true; } catch (error) { if (error.code === "ESRCH") return false; if (error.code === "EPERM") return true; throw error; } };
  if (!alive()) return;
  if ((child.exitCode !== undefined && child.exitCode !== null) || (child.signalCode !== undefined && child.signalCode !== null)) {
    // The leader can exit a few ticks before its helpers. Observe their normal
    // shutdown before failing ownership; never signal a leaderless group.
    const deadline = Date.now() + Math.max(1_000, graceMs);
    while (alive() && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 25));
    if (!alive()) return;
    throw Object.assign(new Error("process group remains after its leader exited; ownership cannot be proven from this child handle"), { code: "process_group_ownership_unknown", details: { pid: child.pid } });
  }
  process.kill(target, "SIGTERM");
  await new Promise((resolve) => setTimeout(resolve, graceMs));
  if (!alive()) return;
  if (child.exitCode != null || child.signalCode != null) return stopProcessGroup(child, graceMs);
  process.kill(target, "SIGKILL");
  // Grace controls escalation, not the OS acknowledgement budget. A caller
  // testing immediate escalation must still allow the kernel to reap children.
  const deadline = Date.now() + Math.max(1_000, graceMs);
  while (alive() && Date.now() < deadline) await new Promise((resolve) => setTimeout(resolve, 25));
  if (alive()) throw Object.assign(new Error(`process group ${child.pid} did not stop`), { code: "process_group_stop_incomplete" });
}
