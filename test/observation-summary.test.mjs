import assert from "node:assert/strict";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { observationSummary } from "../lib/observation-summary.mjs";

test("reports unknown gaps separately, without inferring sleep or model time", async t => {
  const root = await mkdtemp(path.join(os.tmpdir(), "dd-observation-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const file = path.join(root, "journal.jsonl");
  assert.equal((await observationSummary(file)).observation_gaps, null);
  await writeFile(file, JSON.stringify({ kind: "observation_gap", observed_at: "2026-09-05T00:00:00Z", payload: { wall_delta_ms: 3_600_000 } }) + "\n");
  const result = await observationSummary(file);
  assert.equal(result.observation_gaps.length, 1);
  assert.equal(result.observation_gaps[0].confirmed_sleep, false);
  assert.equal(result.confirmed_sleep_intervals, null);
  assert.match(result.timing_note, /Do not subtract/);
});
