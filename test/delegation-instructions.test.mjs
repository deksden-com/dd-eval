import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { loadDelegationInstructions } from "../lib/delegation-instructions.mjs";

test("delegation comes from the selected engine, with no fallback across runtime homes", async t => {
  const root = await mkdtemp(path.join(os.tmpdir(), "delegation-bundle-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  for (const marker of ["engine_a", "engine_b"]) {
    const home = path.join(root, marker);
    const lib = path.join(home, "harness-runtime", "lib");
    await mkdir(lib, { recursive: true });
    await writeFile(path.join(lib, "delegation-instructions.mjs"), `export const renderCapacityInstructions = input => ({marker:${JSON.stringify(marker)}, ...input}); export const renderRecoveryProbeInstructions = input => input;`);
    const renderer = await loadDelegationInstructions(home);
    assert.deepEqual(renderer.renderCapacityInstructions({ harness: "codex-desktop", maximum: 2 }), { marker, harness: "codex-desktop", maximum: 2 });
  }
  await assert.rejects(loadDelegationInstructions(path.join(root, "missing")), { code: "delegation_contract_unsupported" });
  await assert.rejects(loadDelegationInstructions("relative"), { code: "delegation_contract_unsupported" });
});
