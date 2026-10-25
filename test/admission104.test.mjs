import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { withRunnerLock } from "../lib/runner-lock.mjs";

test("admission wait slides on progress, not repeated heartbeat; waiter cancellation leaves producer", { timeout: 20_000 }, async t => {
  const root = await mkdtemp(path.join(os.tmpdir(), "admission104-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const file = path.join(root, "admission");
  let publish, release;
  const acquired = new Promise(resolve => {
    const producer = withRunnerLock(file, async ({ progress }) => {
      publish = progress; resolve();
      await new Promise(done => { release = done; });
    });
    t.after(async () => { release?.(); await producer; });
  });
  await acquired;
  const controller = new AbortController();
  let observation;
  let observed;
  const firstObservation = new Promise(resolve => { observed = resolve; });
  const cancelled = withRunnerLock(file, () => assert.fail("waiter cannot acquire"), {
    inactivityMs: 5_000, signal: controller.signal, onWait: value => { observation = value; observed(); },
  });
  const cancellation = assert.rejects(cancelled, { name: "AbortError" });
  await firstObservation; controller.abort();
  await cancellation;
  assert.equal(observation.owner.pid, process.pid);
  const budget = 4_000;
  let waited = false, initialDeadline, advanced = false, observedPastInitialDeadline = false;
  const waiting = withRunnerLock(file, () => { waited = true; }, {
    inactivityMs: budget, signal: t.signal, onWait: value => {
      initialDeadline ??= performance.now() + value.remaining_ms;
      if (!advanced && value.remaining_ms <= budget / 2) { publish({ completed: 1 }); advanced = true; }
      if (value.owner.progress?.completed === 1) {
        // Repeated identical evidence is a heartbeat, not new progress.
        publish({ completed: 1 });
        if (performance.now() > initialDeadline && value.remaining_ms > 0) observedPastInitialDeadline = true;
      }
    },
  });
  await assert.rejects(waiting, error => error.code === "runner_lock_timeout" && error.details.state === "stalled");
  assert.equal(waited, false, "a waiter never acquires the producer's held lock");
  assert.equal(advanced, true, "publish progress only after observing the running producer");
  assert.equal(observedPastInitialDeadline, true, "new progress extends waiting past its original deadline");
  release();
});

test("prepare-only skips historical admission, direct/resume retain guarded queue barriers", async () => {
  const source = await readFile(new URL("../lib/runner.mjs", import.meta.url), "utf8");
  const initial = source.slice(source.indexOf("export async function executeEval("), source.indexOf("async function executePreparedQueue("));
  assert.match(initial, /if \(!prepareOnly\) await withPriorEvalRetirement/);
  assert.ok(initial.indexOf("await provisionRuntimeEngine") < initial.indexOf("if (!prepareOnly) await withPriorEvalRetirement"));
  assert.ok(initial.indexOf('if (prepareOnly) return') < initial.indexOf("return executePreparedQueue"));
  assert.match(initial, /admission: preparedQueueAdmission/);
  const queue = source.slice(source.indexOf("async function executePreparedQueue("), source.indexOf("export async function launchEvalExecution("));
  assert.match(queue, /admission !== preparedQueueAdmission/);
  const resume = source.slice(source.indexOf("export async function runnerResume("), source.indexOf("async function runnerResumeLocked("));
  assert.ok(resume.indexOf("await withPriorEvalRetirement") < resume.indexOf("admission = preparedQueueAdmission"));
});
