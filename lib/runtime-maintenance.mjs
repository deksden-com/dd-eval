import { realpath, access } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { setTimeout as delay } from "node:timers/promises";

// Only the selected runtime's portable alias or direct installed CLI layout.
// Never borrow helpers from another checkout or the global installation.
export async function runtimeMaintenance(config) {
  const locations = [path.join(config.ddFlowHome, "harness-runtime", "lib")];
  if (/\.[cm]?js$/.test(config.ddFlowBin)) locations.push(path.join(path.dirname(await realpath(config.ddFlowBin)), "harness-runtime", "lib"));
  for (const location of locations) {
    try { await access(path.join(location, "lease-renewal.mjs")); }
    catch (error) { if (error.code === "ENOENT") continue; throw error; }
    const policy = await import(pathToFileURL(path.join(location, "lease-renewal.mjs")).href);
    const { runtimeProcess } = await import(pathToFileURL(path.join(location, "managed-daemon.mjs")).href);
    return { policy, call: (action, options, transport) => runtimeProcess(config, action, options, transport) };
  }
  throw Object.assign(new Error("Selected runtime lacks the managed maintenance contract"), { code: "runtime_contract_incompatible" });
}

export function observeRuntimeLease(client, record, { intervalMs = 30_000 } = {}) {
  const p = client.policy, state = p.createRenewalState();
  let pending, closing = false, failure, registration = record.registration_sha256;
  const identity = { id: record.id, "lease-token": record.lease_token };
  const run = action => {
    if (pending) return pending.then(() => run(action), () => run(action));
    if (closing) return Promise.reject(Object.assign(new Error("Observer lease is closing"), { code: "process_lease_closing" }));
    if (failure) return Promise.reject(failure);
    pending = (async () => {
      for (;;) {
        try {
          const receipt = await client.call(action, identity, { timeoutMs: Math.min(p.RENEWAL_POLICY.attemptMs, p.renewalRemaining(state)) });
          if (action === "heartbeat") {
            if (receipt?.ok === false) throw Object.assign(new Error("Observer owner was replaced or retired"), { code: "process_lease_lost" });
            if (receipt?.ok !== true || receipt.process_id !== record.id || !Number.isFinite(Date.parse(receipt.lease_expires_at)) || Date.parse(receipt.lease_expires_at) <= Date.now() || !/^[a-f0-9]{64}$/.test(receipt.registration_sha256 ?? "") || registration && registration !== receipt.registration_sha256) throw Object.assign(new Error("Observer renewal omitted its committed binding/expiry"), { code: "process_maintenance_receipt_invalid" });
            registration = receipt.registration_sha256;
          }
          if (!p.renewalConfirmed(state)) throw Object.assign(new Error("Observer renewal budget exhausted"), { code: "process_maintenance_timeout" });
          return receipt;
        } catch (error) {
          if (closing || !p.maintenanceRetryable(error)) { failure = error; throw error; }
          if (!p.renewalFailure(state)) {
            failure = Object.assign(new Error("Observer ownership could not be reconfirmed within the renewal budget"), { code: "process_ownership_unconfirmed", cause: error });
            throw failure;
          }
          await delay(Math.min(p.renewalDelay(state), p.renewalRemaining(state)));
        }
      }
    })().finally(() => { pending = null; });
    return pending;
  };
  const timer = setInterval(() => { if (!pending && !closing && !failure) void run("heartbeat").catch(() => {}); }, intervalMs);
  timer.unref();
  return {
    async admission() { await run("heartbeat"); return await run("check-admission"); },
    async close() { closing = true; clearInterval(timer); await pending?.catch(() => {}); if (failure?.details?.cleanup_unconfirmed) throw failure; }
  };
}
