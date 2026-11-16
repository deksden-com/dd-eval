import test from "node:test";
import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { reconcileFlow, collectFlowStatistics } from "../lib/execution/flow-observation.mjs";

test("reconciles lifecycle and retains partial statistics observations", async t => {
  const root = await mkdtemp(path.join(os.tmpdir(), "eval-flow-observation-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(path.join(root, "bin"));
  await writeFile(path.join(root, "bin", "dd-flow"), `#!/bin/sh
case "$1 $2" in
  "run list") echo '{"runs":[{"id":"RUN-1"}]}' ;;
  "run status") echo '{"technical_notes":["note"],"index":{"stage_runs":[{"stage":"work","status":"running"}]}}' ;;
  "stat usage") echo '{"total":3}' ;;
  *) exit 1 ;;
esac
`, { mode: 0o755 });
  let notes;
  const lifecycle = await reconcileFlow({ projectRoot: root, runtimeRoot: root, expectedStage: "work", onTechnicalNotes: value => { notes = value; } });
  assert.equal(lifecycle.run_id, "RUN-1");
  assert.equal(lifecycle.stage_status, "running");
  assert.deepEqual(notes, ["note"]);
  assert.equal(lifecycle.status.technical_notes, undefined);
  const stats = await collectFlowStatistics({ projectRoot: root, runtimeRoot: root, runId: "RUN-1" });
  assert.deepEqual(stats.usage, { total: 3 });
  assert.equal(stats.sessions, null);
  assert.equal(stats.observation.reason, "statistics_observation_unavailable");
});
