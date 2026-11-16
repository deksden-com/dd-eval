import test from "node:test";
import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { assertManagedContract, readManagedContractEvidence } from "../lib/execution/managed-contract.mjs";

test("managed evidence reads run status and rejects a mismatched engine", async t => {
  const root = await mkdtemp(path.join(os.tmpdir(), "eval-managed-contract-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(path.join(root, "bin"));
  await writeFile(path.join(root, "bin", "dd-flow"), `#!/bin/sh
case "$1 $2" in
  "run status") echo '{"index":{"run_id":"RUN-1"}}' ;;
  "engine resolve") echo '{"selection":{"selected":{"integrity":{"checksum":"actual"}}}}' ;;
  *) exit 1 ;;
esac
`, { mode: 0o755 });
  const input = { runtimeRoot: root, projectRoot: root, runId: "RUN-1" };
  assert.deepEqual(await readManagedContractEvidence({ ...input, contract: {} }), { run_id: "RUN-1" });
  await assert.rejects(readManagedContractEvidence({ ...input, contract: { generic_execution: { engine_artifact_sha256: "different" } } }), { code: "profile_contract_mismatch" });
  await assertManagedContract({ ...input, contract: null });
});
