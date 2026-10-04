import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { ObservationClock, observedTimeout, validateObservationDuration } from "../lib/observation-clock.mjs";

test("portable clock bytes match the selected FLOW source", { skip: !process.env.DD_FLOW_SOURCE_ROOT }, async () => {
  assert.deepEqual(await readFile(new URL('../lib/observation-clock.mjs', import.meta.url)),
    await readFile(path.join(process.env.DD_FLOW_SOURCE_ROOT, 'src/harness-runtime/lib/observation-clock.mjs')));
});

test("delayed observation does not grant a second full inactivity window", () => {
  let time = 0;
  const clock = new ObservationClock({ timeoutMs: 200, wall: () => time, monotonic: () => time });
  time = 150; assert.equal(clock.sample('activity-at-100', 100), false);
  time = 299; assert.equal(clock.sample('activity-at-100', 100), false);
  time = 300; assert.equal(clock.sample('activity-at-100', 100), true);
});

test("activity, not unchanged status, renews the observation budget", () => {
  let time = 0;
  const clock = new ObservationClock({ timeoutMs: 100, gapMs: 1000, wall: () => time, monotonic: () => time });
  assert.equal(clock.sample(1), false);
  time = 80; assert.equal(clock.sample(2), false);
  time = 160; assert.equal(clock.sample(2), false);
  time = 181; assert.equal(clock.sample(2), true);
});

for (const delta of [3600_000, -3600_000]) test(`clock discontinuity ${delta} is a gap, not sleep or agent failure`, () => {
  let wall = 0, mono = 0; const gaps = [];
  const clock = new ObservationClock({ timeoutMs: 100, gapMs: 1000, uncertaintyMs: 100, wall: () => wall, monotonic: () => mono, onGap: g => gaps.push(g) });
  wall = delta; mono = 10; assert.equal(clock.sample(), false);
  assert.equal(gaps.length, 1); assert.equal(gaps[0].confirmed_sleep, false);
  wall += 101; mono += 101; assert.equal(clock.sample(), true);
  assert.equal(clock.observationLost, true);
});

test("host suspension preserves quiet time and has a finite uncertainty episode", () => {
  let time = 0;
  const clock = new ObservationClock({ timeoutMs: 100, gapMs: 1000, uncertaintyMs: 100, wall: () => time, monotonic: () => time });
  time = 80; assert.equal(clock.sample(), false);
  time += 10_000; assert.equal(clock.sample(), false);
  assert.equal(clock.state().elapsed_ms, 80);
  time += 101; assert.equal(clock.sample(), true);
  assert.equal(clock.observationLost, true);
});

test("repeated gaps cannot replenish an uncertain operation", () => {
  let time = 0;
  const clock = new ObservationClock({ timeoutMs: 100, gapMs: 1000, wall: () => time, monotonic: () => time });
  time = 10_000; assert.equal(clock.sample(), false);
  time += 10_000; assert.equal(clock.sample(), true);
  assert.equal(clock.observationLost, true);
});

test("persisted exhausted uncertainty gets no new budget on reconstruction", () => {
  let time = 0;
  const options = { timeoutMs: 100, gapMs: 1000, uncertaintyMs: 100, wall: () => time, monotonic: () => time };
  const clock = new ObservationClock(options);
  time = 10_000; clock.sample(); time += 101; clock.sample();
  const restored = new ObservationClock({ ...options, saved: clock.state() });
  assert.equal(restored.sample({ cursor: "late", observed_at: time }), true);
  assert.equal(restored.observationLost, true);
});

test("repeated reconstruction without a new signal cannot retain an unused fresh window", () => {
  const options = { timeoutMs: 100, wall: () => 0, monotonic: () => 0 };
  const original = new ObservationClock(options);
  const first = new ObservationClock({ ...options, saved: original.state() });
  assert.equal(first.observationLost, false);
  const second = new ObservationClock({ ...options, saved: first.state() });
  assert.equal(second.observationLost, true);
  assert.equal(second.sample(), true);
});

test("wall rollback cannot count a local marker as a new silence grant", () => {
  let wall = 1000, mono = 0;
  const clock = new ObservationClock({ timeoutMs: 100, wall: () => wall, monotonic: () => mono });
  clock.sample(1); wall = 900; mono = 50; clock.sample(2);
  assert.equal(clock.state().cursor, 1);
  assert.equal(clock.uncertain, true);
});

test("atomic snapshots retain first-known time; stale and future markers never grant quiet time", () => {
  let time = 1000;
  const clock = new ObservationClock({ timeoutMs: 200, gapMs: 1000, wall: () => time, monotonic: () => time });
  time = 1100; clock.sample({ cursor: 1, observed_at: 1050 });
  time = 1150; clock.sample({ cursor: 2, observed_at: 1049 });
  assert.equal(clock.state().elapsed_ms, 100);
  clock.sample({ cursor: 3, observed_at: 1200 });
  assert.equal(clock.state().elapsed_ms, 100);
  clock.sample({ cursor: 4, observed_at: 1150 });
  time = 1350; assert.equal(clock.sample({ cursor: 4, observed_at: 1150 }), true);
});

test("equal timestamps with distinct scoped cursors are valid activity", () => {
  let time = 0;
  const clock = new ObservationClock({ timeoutMs: 100, wall: () => time, monotonic: () => time });
  time = 50; clock.sample({ cursor: 1, observed_at: 50 });
  time = 60; clock.sample({ cursor: 2, observed_at: 50 });
  assert.equal(clock.state().elapsed_ms, 10);
});

test("future signal reports skew once; invalid timestamps never throw or renew", () => {
  const gaps = [];
  const clock = new ObservationClock({ timeoutMs: 100, wall: () => 0, monotonic: () => 0, onGap: gap => gaps.push(gap) });
  clock.sample({ cursor: 1, observed_at: Infinity });
  assert.equal(clock.uncertain, false);
  clock.sample({ cursor: 2, observed_at: Number.MAX_VALUE });
  clock.sample({ cursor: 3, observed_at: Number.MAX_VALUE });
  assert.equal(gaps.length, 1);
  assert.equal(gaps[0].classification, "clock_skew");
  assert.equal(clock.state().cursor, undefined);
});

test("duration validation rejects disable tricks and Node timer overflow", () => {
  for (const value of [null, undefined, "100", 0, -1, NaN, Infinity, .5, 2147483648])
    assert.throws(() => validateObservationDuration(value), RangeError);
  assert.equal(validateObservationDuration(1), 1);
  assert.equal(validateObservationDuration(2147483647), 2147483647);
});

test("observedTimeout reads each atomic observation exactly once", t => {
  let time = 0, sample, calls = 0;
  t.mock.method(globalThis, "setInterval", callback => { sample = callback; return {}; });
  observedTimeout(() => {}, 100, { wall: () => time, monotonic: () => time,
    progress: () => { calls++; return { cursor: 1, observed_at: 0 }; } });
  time = 50; sample(); assert.equal(calls, 1);
});

test("observedTimeout expires once and supports native clearTimeout", async () => {
  let calls = 0;
  const timer = observedTimeout(() => { calls++; }, 5); clearTimeout(timer);
  await new Promise(resolve => setTimeout(resolve, 15)); assert.equal(calls, 0);
  await new Promise(resolve => observedTimeout(() => { calls++; resolve(); }, 5));
  await new Promise(resolve => setTimeout(resolve, 15)); assert.equal(calls, 1);
});

test("short native inactivity windows are sampled before a whole window elapses", t => {
  let time = 0, sample, interval, expired = false;
  t.mock.method(globalThis, "setInterval", (callback, delay) => { sample = callback; interval = delay; return {}; });
  observedTimeout(() => { expired = true; }, 1000, { wall: () => time, monotonic: () => time, progress: () => "unchanged" });
  for (time = interval; time <= 1250; time += interval) sample();
  assert.equal(expired, true);
});
