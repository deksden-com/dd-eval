import { lstat } from "node:fs/promises";
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
  // Harness bridges are detached on Unix, so their own process group is the
  // smallest reliable unit of cleanup. Windows has no equivalent negative-PID
  // signal operation; there the direct child is the safe best effort.
  const target = process.platform === "win32" ? child.pid : -child.pid;
  const alive = () => { try { process.kill(target, 0); return true; } catch (error) { if (error.code === "ESRCH") return false; throw error; } };
  if (!alive()) return;
  process.kill(target, "SIGTERM");
  await new Promise((resolve) => setTimeout(resolve, graceMs));
  if (!alive()) return;
  process.kill(target, "SIGKILL");
  const deadline = Date.now() + graceMs;
  while (alive() && Date.now() < deadline) await new Promise((resolve) => setTimeout(resolve, 25));
  if (alive()) throw Object.assign(new Error(`process group ${child.pid} did not stop`), { code: "process_group_stop_incomplete" });
}

/** A daemon acknowledgement is not a completed stop until its endpoint closes. */
export async function confirmDaemonStopped(request, socket, timeoutMs = 30_000) {
  const result = await request();
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try { await lstat(socket); }
    catch (error) { if (error.code === "ENOENT") return result; throw error; }
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw Object.assign(new Error("daemon acknowledged stop but its socket remained live"), { code: "daemon_stop_incomplete", details: { socket } });
}
