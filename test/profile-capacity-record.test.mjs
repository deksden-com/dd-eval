import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { recordFanoutCapacity } from "../lib/execution/profile-capacity.mjs";

test("capacity recording uses the retained runtime and selected RUN", async t => {
  const root = await mkdtemp(path.join(os.tmpdir(), "dd-eval-capacity-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const bin = path.join(root, "runtime", "bin");
  await mkdir(bin, { recursive: true });
  await writeFile(path.join(bin, "dd-flow"), `#!${process.execPath}\nprocess.stdout.write(JSON.stringify({args:process.argv.slice(2),home:process.env.DD_FLOW_HOME}));\n`, { mode: 0o755 });
  const result = await recordFanoutCapacity({ projectRoot: root, runtimeRoot: path.dirname(bin), runId: "RUN-1", availableSlots: 3 });
  assert.deepEqual(result.args, ["run", "capacity", "record", "RUN-1", "--available-slots", "3", "--project-root", root, "--json"]);
  assert.equal(result.home, path.dirname(bin));
});
