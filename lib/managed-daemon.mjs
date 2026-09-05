import { lstat } from "node:fs/promises";
import { commandJson } from "./process-json.mjs";
import { errorRecord } from "./operation-errors.mjs";

const leases = new Map();

export function assertDaemonOwnership() {
  for (const lease of leases.values()) if (lease.error) throw lease.error;
}

export async function runtimeProcess(config, action, options = {}) {
  if (!config.resourceHome || !config.ddFlowHome || !config.ddFlowBin) return null;
  const args = ["runtime", "process", action];
  for (const [key, value] of Object.entries(options)) if (value !== null && value !== undefined) args.push(`--${key}`, String(value));
  return await commandJson(config.ddFlowBin, args, {
    cwd: config.cwd,
    env: { ...(config.env ?? {}), DD_FLOW_HOME: config.ddFlowHome, DD_FLOW_RESOURCE_HOME: config.resourceHome }
  });
}

export async function registerDaemonProcess(config, input) {
  const result = await runtimeProcess(config, "register", { ...input, "owner-pid": process.pid, "lease-ms": 300_000 });
  return result?.process ? { id: result.process.id, lease_token: result.process.lease_token, kind: input.kind } : null;
}

export async function confirmDaemonProcess(config, record, child) {
  if (!record) return;
  if (!child?.pid) {
    await finishDaemonProcess(config, record, "failed", "daemon_spawn_missing_pid");
    return;
  }
  await runtimeProcess(config, "confirm", { id: record.id, "lease-token": record.lease_token, pid: child.pid, "process-group-id": child.pid, "owner-pid": record.kind?.endsWith("-daemon") ? child.pid : process.pid, "lease-ms": 300_000 });
}

export async function heartbeatDaemonProcess(config, record) {
  if (!record?.id || !record.lease_token) return;
  let lease = leases.get(record.id);
  if (!lease) {
    lease = { pending: null, error: null, timer: null, lost: false };
    leases.set(record.id, lease);
    lease.timer = setInterval(() => { void heartbeatDaemonProcess(config, record).catch(() => {}); }, 60_000);
    lease.timer.unref();
  }
  if (lease.lost) throw lease.error;
  if (lease.pending) return await lease.pending;
  lease.pending = (async () => {
    try {
      const result = await runtimeProcess(config, "heartbeat", { id: record.id, "lease-token": record.lease_token, "lease-ms": 300_000 });
      if (result?.ok !== true) {
        lease.lost = true; clearInterval(lease.timer);
        throw Object.assign(new Error("managed process lease is no longer owned; new productive operations are blocked"), { code: "process_lease_lost", details: { process_id: record.id } });
      }
      lease.error = null;
    } catch (cause) {
      lease.error = cause.code === "process_lease_lost" ? cause : Object.assign(new Error("cannot confirm managed process ownership"), { code: "process_ownership_unknown", cause, details: { process_id: record.id } });
      throw lease.error;
    }
  })();
  try { await lease.pending; } finally { lease.pending = null; }
}

export async function finishDaemonProcess(config, process, state = "stopped", reason = "daemon_stopped") {
  if (process?.id && process.lease_token) {
    const lease = leases.get(process.id); if (lease) clearInterval(lease.timer);
    const result = await runtimeProcess(config, "finish", { id: process.id, "lease-token": process.lease_token, state, reason });
    if (result?.ok !== true) throw Object.assign(new Error("managed process finish was not accepted"), { code: "process_lease_lost", details: { process_id: process.id } });
    leases.delete(process.id);
  }
}

/** Preserve the startup error and retain the lease/resources if cleanup cannot
 * prove termination. A failed cleanup is not a terminal managed process. */
export async function cleanupFailedStart(config, record, child, original) {
  try {
    await stopProcessGroup(child);
    await finishDaemonProcess(config, record, "failed", original.code ?? "startup_failed");
  } catch (cleanup) {
    original.details = { ...original.details, cleanup_failed: errorRecord(cleanup), process_id: record?.id ?? null, pid: child?.pid ?? null };
  }
}

export async function stopProcessGroup(child, graceMs = 1_000) {
  if (!child?.pid) return;
  // Harness bridges are detached on Unix, so their own process group is the
  // smallest reliable unit of cleanup. Windows has no equivalent negative-PID
  // signal operation; there the direct child is the safe best effort.
  const target = process.platform === "win32" ? child.pid : -child.pid;
  const alive = () => { try { process.kill(target, 0); return true; } catch (error) { if (error.code === "ESRCH") return false; throw error; } };
  if (!alive()) return;
  if (child.exitCode !== undefined && child.exitCode !== null) throw Object.assign(new Error("process group remains after its leader exited; ownership cannot be proven from this child handle"), { code: "process_group_ownership_unknown", details: { pid: child.pid } });
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
