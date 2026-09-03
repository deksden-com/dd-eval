import { commandJson } from "./process-json.mjs";

export async function runtimeProcess(config, action, options = {}) {
  if (!config.resourceHome || !config.ddFlowHome || !config.ddFlowBin) return null;
  const args = ["runtime", "process", action];
  for (const [key, value] of Object.entries(options)) if (value !== null && value !== undefined) args.push(`--${key}`, String(value));
  return await commandJson(config.ddFlowBin, args, {
    cwd: config.cwd,
    env: { ...(config.env ?? {}), DD_FLOW_RESOURCE_HOME: config.resourceHome }
  });
}

export async function registerDaemonProcess(config, input) {
  const result = await runtimeProcess(config, "register", { ...input, "lease-ms": 300_000 });
  return result?.process ? { id: result.process.id, lease_token: result.process.lease_token } : null;
}

export async function confirmDaemonProcess(config, process, child) {
  if (!process) return;
  if (!child?.pid) {
    await finishDaemonProcess(config, process, "failed", "daemon_spawn_missing_pid");
    return;
  }
  await runtimeProcess(config, "confirm", { id: process.id, "lease-token": process.lease_token, pid: child.pid, "process-group-id": child.pid, "lease-ms": 300_000 });
}

export async function heartbeatDaemonProcess(config, process) {
  if (process?.id && process.lease_token) await runtimeProcess(config, "heartbeat", { id: process.id, "lease-token": process.lease_token, "lease-ms": 300_000 });
}

export async function finishDaemonProcess(config, process, state = "stopped", reason = "daemon_stopped") {
  if (process?.id && process.lease_token) await runtimeProcess(config, "finish", { id: process.id, "lease-token": process.lease_token, state, reason });
}

export async function stopProcessGroup(child, graceMs = 1_000) {
  if (!child?.pid) return;
  try { process.kill(-child.pid, "SIGTERM"); } catch (error) { if (error.code !== "ESRCH") throw error; return; }
  await new Promise((resolve) => setTimeout(resolve, graceMs));
  try { process.kill(-child.pid, 0); process.kill(-child.pid, "SIGKILL"); } catch (error) { if (error.code !== "ESRCH") throw error; }
}
