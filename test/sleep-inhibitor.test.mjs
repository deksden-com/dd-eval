import test from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { withSleepInhibitor } from "../lib/sleep-inhibitor.mjs";

for (const platform of ["darwin", "linux"]) test(`sleep inhibitor is temporary and parent-bound on ${platform}`, async () => {
  const child = new EventEmitter(); Object.assign(child, { pid: 123, exitCode: null, signalCode: null });
  let killed = false;
  child.kill = signal => { assert.equal(signal, "SIGTERM"); killed = true; };
  const failure = new Error("operation failed");
  await assert.rejects(withSleepInhibitor(() => { throw failure; }, { platform, launch: (bin, args) => {
    assert.ok(args.some(arg => arg.includes(String(process.pid)))); return child;
  } }), error => error === failure);
  assert.equal(killed, true);
});

test("an unavailable sleep inhibitor does not masquerade as a provider failure", async () => {
  const events = [], child = new EventEmitter();
  Object.assign(child, { exitCode: 1, signalCode: null });
  assert.equal(await withSleepInhibitor(async () => { child.emit("error", new Error("unavailable")); return 42; }, { platform: "linux", launch: () => child, report: e => events.push(e) }), 42);
  assert.equal(events.at(-1).state, "unavailable");
});
