import assert from "node:assert/strict";
import test from "node:test";
import { ObservationClock, observedTimeout } from "../lib/observation-clock.mjs";

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
  const clock = new ObservationClock({ timeoutMs: 100, gapMs: 1000, wall: () => wall, monotonic: () => mono, onGap: g => gaps.push(g) });
  wall = delta; mono = 10; assert.equal(clock.sample(), false);
  assert.equal(gaps.length, 1); assert.equal(gaps[0].confirmed_sleep, false);
  wall += 101; mono += 101; assert.equal(clock.sample(), true);
});

test("host suspension grants one bounded recovery window", () => {
  let time = 0;
  const clock = new ObservationClock({ timeoutMs: 100, gapMs: 1000, wall: () => time, monotonic: () => time });
  time = 80; assert.equal(clock.sample(), false);
  time += 10_000; assert.equal(clock.sample(), false);
  time += 101; assert.equal(clock.sample(), true);
});

test("observedTimeout expires once and supports native clearTimeout", async () => {
  let calls = 0;
  const timer = observedTimeout(() => { calls++; }, 5); clearTimeout(timer);
  await new Promise(resolve => setTimeout(resolve, 15)); assert.equal(calls, 0);
  await new Promise(resolve => observedTimeout(() => { calls++; resolve(); }, 5));
  await new Promise(resolve => setTimeout(resolve, 15)); assert.equal(calls, 1);
});
