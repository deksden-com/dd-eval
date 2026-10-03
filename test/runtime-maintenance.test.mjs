import test from "node:test";
import assert from "node:assert/strict";
import { setTimeout as delay } from "node:timers/promises";
import { observeRuntimeLease, runtimeMaintenance } from "../lib/runtime-maintenance.mjs";

const policy = {
  RENEWAL_POLICY: { attemptMs: 5000 }, createRenewalState: () => ({}),
  renewalRemaining: () => 30000, renewalConfirmed: () => true,
  renewalFailure: () => 1, renewalDelay: () => 1,
  maintenanceRetryable: error => error.code === "SQLITE_BUSY"
};
const receipt = { ok: true, admitted: true, process_id: "observer", lease_expires_at: new Date(Date.now() + 900000).toISOString(), registration_sha256: "a".repeat(64) };
test("observer renews during a long await without overlapping physical requests", async () => {
  let active = 0, max = 0, count = 0;
  const lease = observeRuntimeLease({ policy, async call() { max = Math.max(max, ++active); count++; await delay(15); active--; return receipt; } }, { id: "observer", lease_token: "secret" }, { intervalMs: 2 });
  await delay(60);
  await lease.admission();
  await lease.close();
  assert.equal(max, 1); assert.ok(count >= 3);
  const stopped = count; await delay(10); assert.equal(count, stopped);
});
test("failed maintenance is retried but invalid receipts stay fatal", async () => {
  let calls = 0;
  const lease = observeRuntimeLease({ policy, async call() { if (++calls === 1) throw Object.assign(new Error("busy"), { code: "SQLITE_BUSY" }); return receipt; } }, { id: "observer", lease_token: "secret" });
  await lease.admission(); await lease.close(); assert.equal(calls, 3);
  const invalid = observeRuntimeLease({ policy, async call() { return {}; } }, { id: "observer", lease_token: "secret" });
  await assert.rejects(invalid.admission(), { code: "process_maintenance_receipt_invalid" }); await invalid.close();
});
test("missing pinned runtime helper never falls back to another installation", async () => {
  await assert.rejects(runtimeMaintenance({ ddFlowHome: "/not-a-runtime", ddFlowBin: "/not-a-runtime/bin/dd-flow" }), { code: "runtime_contract_incompatible" });
});
test("closing cancels deferred observer renewal without a late maintenance request", async () => {
  let calls = 0, retrying;
  const retry = new Promise(resolve => { retrying = resolve; });
  const lease = observeRuntimeLease({ policy: { ...policy, renewalDelay: () => { retrying(); return 30_000; } }, async call() {
    calls++; throw Object.assign(new Error("busy"), { code: "SQLITE_BUSY" });
  } }, { id: "observer", lease_token: "secret" });
  const admitted = assert.rejects(lease.admission(), { name: "AbortError" });
  await retry; await lease.close(); await admitted;
  assert.equal(calls, 1);
  await assert.rejects(lease.admission(), { code: "process_lease_closing" });
});
test("admission rejects malformed bindings and cannot complete after closing", async () => {
  for (const invalid of [{}, { ...receipt, process_id: "foreign" }, { ...receipt, admitted: false }]) {
    const lease = observeRuntimeLease({ policy, async call(action) { return action === "heartbeat" ? receipt : invalid; } }, { id: "observer", lease_token: "secret" });
    await assert.rejects(lease.admission(), { code: "process_maintenance_receipt_invalid" }); await lease.close();
  }
  let started, resolve;
  const waiting = new Promise(done => { started = done; });
  const lease = observeRuntimeLease({ policy, async call(action) {
    if (action === "heartbeat") return receipt;
    started(); return await new Promise(done => { resolve = done; });
  } }, { id: "observer", lease_token: "secret" });
  const admitted = assert.rejects(lease.admission(), { code: "process_lease_closing" });
  await waiting; const closed = lease.close(); resolve(receipt); await closed; await admitted;
});
test("a late successful receipt cannot reset an elapsed uncertainty episode", async () => {
  let remaining = 30000, resets = 0, calls = 0;
  const lease = observeRuntimeLease({ policy: { ...policy, renewalRemaining: () => remaining, renewalConfirmed: () => { resets++; return true; } }, async call() {
    if (++calls === 1) throw Object.assign(new Error("busy"), { code: "SQLITE_BUSY" });
    remaining = 0; return receipt;
  } }, { id: "observer", lease_token: "secret" });
  await assert.rejects(lease.admission(), { code: "process_ownership_unconfirmed" });
  await assert.rejects(lease.admission(), { code: "process_ownership_unconfirmed" });
  await lease.close(); assert.equal(resets, 0); assert.equal(calls, 2);
});
test("observer never accepts changed binding or a late success after exhaustion", async () => {
  let calls = 0;
  const changed = observeRuntimeLease({ policy, async call() { return { ...receipt, registration_sha256: ++calls === 1 ? "a".repeat(64) : "b".repeat(64) }; } }, { id: "observer", lease_token: "secret" });
  await changed.admission();
  await assert.rejects(changed.admission(), { code: "process_maintenance_receipt_invalid" });
  await changed.close();
  const exhausted = observeRuntimeLease({ policy: { ...policy, renewalFailure: () => 0 }, async call() { throw Object.assign(new Error("busy"), { code: "SQLITE_BUSY" }); } }, { id: "observer", lease_token: "secret" });
  await assert.rejects(exhausted.admission(), { code: "process_ownership_unconfirmed" });
  await assert.rejects(exhausted.admission(), { code: "process_ownership_unconfirmed" });
  await exhausted.close();
});
