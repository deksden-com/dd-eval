import test from "node:test";
import assert from "node:assert/strict";
import { setTimeout as delay } from "node:timers/promises";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { observeRuntimeLease, runtimeMaintenance } from "../lib/runtime-maintenance.mjs";
import { installMaintenanceFixture } from "./fixtures/maintenance-runtime.mjs";
import * as committedPolicy from "./fixtures/maintenance-lease-renewal.mjs";

const policy = {
  RENEWAL_POLICY: { attemptMs: 5000 }, createRenewalState: () => ({}),
  renewalRemaining: () => 30000, renewalConfirmed: () => true,
  renewalFailure: () => 1, renewalDelay: () => 1,
  maintenanceRetryable: error => error.code === "SQLITE_BUSY"
};
const receipt = { ok: true, admitted: true, process_id: "observer", lease_expires_at: new Date(Date.now() + 900000).toISOString(), registration_sha256: "a".repeat(64) };
test("native maintenance masks both owner's classifier keys after ambient merge", async t => {
  const root = await mkdtemp(path.join(os.tmpdir(), "maintenance-key-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  for (const key of ["OPENROUTER_API_KEY", "OPENAI_DECISIONS_API_KEY"]) {
    const previous = process.env[key]; process.env[key] = "synthetic-owner-only";
    t.after(() => { if (previous === undefined) delete process.env[key]; else process.env[key] = previous; });
  }
  await installMaintenanceFixture(root);
  const cli = path.join(root, "flow.mjs");
  await writeFile(cli, 'console.log(JSON.stringify({ok:true, leaked:["OPENROUTER_API_KEY","OPENAI_DECISIONS_API_KEY"].some(key=>Object.hasOwn(process.env,key))}));');
  const client = await runtimeMaintenance({ ddFlowHome: root, ddFlowBin: cli, env: { OPENROUTER_API_KEY: "override", OPENAI_DECISIONS_API_KEY: "override" } });
  assert.deepEqual(await client.call("finish", { id: "owned" }), { ok: true, leaked: false });
  assert.equal(process.env.OPENROUTER_API_KEY, "synthetic-owner-only");
  assert.equal(process.env.OPENAI_DECISIONS_API_KEY, "synthetic-owner-only");
});
test("observer renews during a long await without overlapping physical requests", async () => {
  let active = 0, max = 0, count = 0;
  const lease = observeRuntimeLease({ policy, async call() { max = Math.max(max, ++active); count++; await delay(15); active--; return receipt; } }, { id: "observer", lease_token: "secret" }, { intervalMs: 2 });
  await delay(60);
  await lease.admission();
  await lease.close();
  assert.equal(max, 1); assert.ok(count >= 3);
  const stopped = count; await delay(10); assert.equal(count, stopped);
});

test("observer passes its remaining ownership horizon, not the transport silence window", async () => {
  const calls = [];
  const lease = observeRuntimeLease({ policy, async call(action, _identity, transport) {
    calls.push([action, transport.timeoutMs]); return receipt;
  } }, { id: "observer", lease_token: "secret" });
  await lease.admission(); await lease.close();
  assert.deepEqual(calls, [["heartbeat", 30000], ["check-admission", 30000]]);
});

test("fractional monotonic ownership budgets are rounded down at the subprocess boundary", async () => {
  const durations = [];
  const lease = observeRuntimeLease({ policy: { ...policy, renewalRemaining: () => 12345.75 }, async call(_action, _identity, transport) {
    durations.push(transport.timeoutMs); return receipt;
  } }, { id: "observer", lease_token: "secret" });
  await lease.admission(); await lease.close(); assert.deepEqual(durations, [12345, 12345]);
});

test("registration readback binding is a heartbeat option, not an admission option", async () => {
  const calls = [];
  const lease = observeRuntimeLease({ policy, registrationReadback: true, async call(action, identity) {
    calls.push([action, identity]);
    if (action === "check-admission") assert.deepEqual(Object.keys(identity).sort(), ["id", "lease-token"]);
    return receipt;
  } }, { id: "observer", lease_token: "secret", registration_sha256: receipt.registration_sha256 });
  await lease.admission(); await lease.close();
  assert.equal(calls[0][0], "heartbeat");
  assert.equal(calls[0][1]["registration-sha256"], receipt.registration_sha256);
  assert.equal(calls[1][0], "check-admission");
});

test("background ownership failure reaches its owner exactly once and closing stops callbacks", async () => {
  let notify;
  const failed = new Promise(resolve => { notify = resolve; }); let calls = 0;
  const lease = observeRuntimeLease({ policy, async call() { throw Object.assign(new Error("lost"), { code: "process_lease_lost" }); } }, { id: "observer", lease_token: "secret" }, { intervalMs: 2, onFailure: error => { calls++; notify(error); } });
  assert.equal((await failed).code, "process_lease_lost"); await lease.close();
  await delay(10); assert.equal(calls, 1);
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
test("pinned maintenance never turns a rejected or missing finish acknowledgement into clean settlement", async t => {
  const root = await mkdtemp(path.join(os.tmpdir(), "maintenance-finish-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const cli = path.join(root, "flow.mjs");
  await installMaintenanceFixture(root);
  await writeFile(cli, "console.log(JSON.stringify({ok:true}));");
  const client = await runtimeMaintenance({ ddFlowHome: root, ddFlowBin: cli, resourceHome: path.join(root, "resources") });
  for (const receipt of [{ ok: false }, {}, { ok: "true" }]) {
    await writeFile(cli, `console.log(JSON.stringify(${JSON.stringify(receipt)}));`);
    await assert.rejects(client.call("finish", { id: "owned", "lease-token": "retained" }), { code: "process_settlement_unconfirmed" });
  }
  await writeFile(cli, "console.log(JSON.stringify({ok:true}));");
  assert.deepEqual(await client.call("finish", { id: "owned", "lease-token": "retained" }), { ok: true });
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
test("observer accepts a verified committed late heartbeat, but rejects replacement and expired ACK", async t => {
  let now = 0;
  t.mock.method(performance, "now", () => now);
  const lease = observeRuntimeLease({ policy: committedPolicy, async call() { now = 130000; return receipt; } },
    { id: "observer", lease_token: "secret", lease_expires_at: receipt.lease_expires_at, registration_sha256: receipt.registration_sha256 });
  await lease.admission(); await lease.close();
  for (const invalid of [{ ...receipt, registration_sha256: "b".repeat(64) }, { ...receipt, lease_expires_at: new Date(Date.now()-1).toISOString() }]) {
    const bad = observeRuntimeLease({ policy: committedPolicy, async call() { return invalid; } },
      { id: "observer", lease_token: "secret", lease_expires_at: receipt.lease_expires_at, registration_sha256: receipt.registration_sha256 });
    await assert.rejects(bad.admission(), { code: "process_maintenance_receipt_invalid" }); await bad.close();
  }
});
test("observer retries only known no-effect failures and keeps a fenced owner closed", async () => {
  let calls = 0;
  const lost = observeRuntimeLease({ policy: committedPolicy, async call() {
    calls++; throw Object.assign(new Error("unknown COMMIT"), { code: "process_maintenance_timeout", details: { effect: "unknown" } });
  } }, { id: "observer", lease_token: "secret", lease_expires_at: receipt.lease_expires_at });
  await assert.rejects(lost.admission(), { code: "process_maintenance_timeout" });
  await assert.rejects(lost.admission(), { code: "process_maintenance_timeout" });
  await lost.close(); assert.equal(calls, 1);
});

async function selectedClient(t, request) {
  const root = await mkdtemp(path.join(os.tmpdir(), "maintenance-identity-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  await installMaintenanceFixture(root);
  await writeFile(path.join(root, "flow.mjs"), "// selected test runtime\n");
  await writeFile(path.join(root, "harness-runtime", "lib", "managed-daemon.mjs"), "export const runtimeProcess = (config, action, options, transport) => config.request(action, options, transport);\n");
  return runtimeMaintenance({ ddFlowHome: root, ddFlowBin: path.join(root, "flow.mjs"), request });
}
const identityRefusal = (id, phase) => Object.assign(new Error("physical identity unavailable before write"), {
  code: "process_ownership_unknown", details: { process_id: id, reason: "physical_identity_unavailable", phase, effect: "no_effect", native_dispatch_started: false }
});

test("selected read-only status retries transient observation but not fatal or aborted requests", async t => {
  let failure, calls = 0;
  const client = await selectedClient(t, async (action, options, transport) => {
    assert.equal(action, "status"); assert.deepEqual(options, {});
    assert.ok(transport.timeoutMs > 0 && transport.timeoutMs <= 5000);
    calls++;
    if (failure) { const error = failure; failure = null; throw error; }
    return { ok: true, processes: [] };
  });
  failure = Object.assign(new Error("lost read response"), { code: "process_maintenance_timeout", details: { effect: "unknown", native_dispatch_started: false } });
  assert.deepEqual(await client.call("status", {}), { ok: true, processes: [] });
  assert.equal(calls, 2);
  for (const error of [
    Object.assign(new Error("unsettled child"), { code: "process_maintenance_timeout", details: { cleanup_unconfirmed: true } }),
    Object.assign(new Error("foreign owner"), { code: "runtime_owner_mismatch", details: { effect: "unknown" } }),
    Object.assign(new Error("nested unsettled child"), { code: "process_maintenance_timeout", details: { effect: "unknown" },
      cause: Object.assign(new Error("unsettled"), { details: { cleanup_unconfirmed: true } }) }),
    Object.assign(new Error("nested fenced owner"), { code: "process_maintenance_timeout", details: { effect: "unknown",
      cause: { code: "runtime_owner_mismatch" } } })
  ]) {
    failure = error; const before = calls;
    await assert.rejects(client.call("status", {}), candidate => candidate === error);
    assert.equal(calls, before + 1);
  }
  const abort = new AbortController(); abort.abort();
  failure = Object.assign(new Error("lost read response"), { code: "process_maintenance_timeout" });
  const before = calls;
  await assert.rejects(client.call("status", {}, { signal: abort.signal }), { code: "process_maintenance_timeout" });
  assert.equal(calls, before + 1);
});

for (const [action, phase, options] of [
  ["register", "observer_registration", { id: "observer", kind: "eval-observer", pid: "123", "process-group-id": "123", operation: "retained-operation" }],
  ["confirm", "process_confirmation", { id: "baseline", "lease-token": "retained", pid: "456", "process-group-id": "456" }]
]) {
  test(`selected ${action} retries only the exact pre-write identity refusal with unchanged options`, async t => {
    const calls = [];
    const client = await selectedClient(t, async (observed, actual, transport) => {
      calls.push({ observed, actual, transport });
      if (calls.length === 1) throw identityRefusal(options.id, phase);
      return { ok: true, process: { id: options.id } };
    });
    assert.deepEqual(await client.call(action, options), { ok: true, process: { id: options.id } });
    assert.equal(calls.length, 2);
    for (const call of calls) { assert.equal(call.observed, action); assert.equal(call.actual, options); assert.ok(Number.isInteger(call.transport.timeoutMs)); assert.ok(call.transport.timeoutMs > 5000 && call.transport.timeoutMs <= 126000); }
  });

  for (const retried of [false, true]) for (const elapsed of [125999, 126000, 126001]) test(`${action} ${retried ? "retried" : "first"} ACK at ${elapsed} cannot reopen its ownership episode`, async t => {
    let now = 0, calls = 0;
    t.mock.method(performance, "now", () => now);
    const client = await selectedClient(t, async () => {
      calls++;
      if (retried && calls === 1) throw identityRefusal(options.id, phase);
      now = elapsed;
      return { ok: true, process: { id: options.id } };
    });
    if (elapsed < 126000) await client.call(action, options);
    else await assert.rejects(client.call(action, options), error => {
      assert.equal(error.code, "process_ownership_unconfirmed");
      assert.deepEqual(error.details, { action, process_id: options.id, phase, effect: "committed", native_dispatch_started: false });
      assert.ok(!JSON.stringify(error).includes("lease-token"));
      assert.ok(!JSON.stringify(error).includes('"retained"'));
      return true;
    });
    assert.equal(calls, retried ? 2 : 1);
  });

  test(`${action} refuses unsafe, unknown, foreign and fenced errors without replay`, async t => {
    let failure, calls = 0;
    const client = await selectedClient(t, async () => { calls++; throw failure; });
    const refusals = [
      Object.assign(new Error("unknown ACK"), { code: "process_maintenance_timeout", details: { effect: "unknown" } }),
      Object.assign(new Error("busy"), { code: "SQLITE_BUSY" }),
      ...[
        { process_id: "foreign" }, { phase: "unrelated" }, { reason: "other" }, { effect: "committed" },
        { native_dispatch_started: true }, { cleanup_unconfirmed: true }
      ].map(change => { const error = identityRefusal(options.id, phase); Object.assign(error.details, change); return error; }),
      ...["process_lease_lost", "controller_lease_lost", "process_maintenance_receipt_invalid", "runtime_owner_mismatch"].map(code => Object.assign(identityRefusal(options.id, phase), { cause: Object.assign(new Error("fenced"), { code }) }))
    ];
    for (const refusal of refusals) {
      failure = refusal;
      const before = calls;
      await assert.rejects(client.call(action, options), error => error === failure);
      assert.equal(calls, before + 1);
    }
    for (const unsafeOptions of [
      { ...options, id: undefined },
      action === "register" ? { ...options, kind: "eval-baseline" } : { ...options, "lease-token": undefined }
    ]) {
      failure = identityRefusal(options.id, phase);
      const before = calls;
      await assert.rejects(client.call(action, unsafeOptions), error => error === failure);
      assert.equal(calls, before + 1);
    }
  });

  test(`${action} late missing or rejected ACK records unknown effect, never committed`, async t => {
    let now = 0, acknowledgement;
    t.mock.method(performance, "now", () => now);
    const client = await selectedClient(t, async () => { now = 126000; return acknowledgement; });
    for (const invalid of [null, { ok: false }, { ok: "true" }]) {
      now = 0; acknowledgement = invalid;
      await assert.rejects(client.call(action, options), error => {
        assert.equal(error.code, "process_ownership_unconfirmed");
        assert.deepEqual(error.details, { action, process_id: options.id, phase, effect: "unknown", native_dispatch_started: false });
        return true;
      });
    }
  });

  test(`${action} retry exhaustion keeps the original typed refusal and respects a shorter transport bound`, async t => {
    let now = 0, calls = 0;
    t.mock.method(performance, "now", () => now);
    const failure = identityRefusal(options.id, phase);
    const client = await selectedClient(t, async (_action, _options, transport) => {
      calls++; assert.equal(transport.timeoutMs, 1000);
      now = 126000; throw failure;
    });
    await assert.rejects(client.call(action, options, { timeoutMs: 1000 }), error => {
      assert.equal(error.code, "process_ownership_unconfirmed"); assert.equal(error.cause, failure);
      assert.deepEqual(error.details, { action, process_id: options.id, phase, effect: "no_effect", native_dispatch_started: false });
      return true;
    });
    assert.equal(calls, 1);
  });
}
