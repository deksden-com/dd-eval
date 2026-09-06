import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { assertCheckpointEngine, engineArtifactDigest, verifyEngineArtifact } from "../lib/engine-admission.mjs";

test("checkpoint admission verifies bytes, rejects same-version substitutions and requires a new pin", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "engine-admission-"));
  try {
    await writeFile(path.join(root, "cli.js"), "original artifact");
    const digest = await engineArtifactDigest(root);
    const checkpoint = { value: { flow_pack: { engine: { version: "1.0.0", artifact_sha256: digest } } } };
    const engine = { package_version: "1.0.0", engine_version: "1.0.0", snapshot_root: root, integrity: { checksum: digest } };
    await assertCheckpointEngine(checkpoint, engine);
    await writeFile(path.join(root, "engine.json"), JSON.stringify({ snapshot_root: "/relocated" }));
    assert.equal(await verifyEngineArtifact(engine), digest);
    await writeFile(path.join(root, "cli.js"), "different artifact, same version");
    await assert.rejects(assertCheckpointEngine(checkpoint, engine), { code: "engine_artifact_mismatch" });
    const substituted = { ...engine, integrity: { checksum: await engineArtifactDigest(root) } };
    await assert.rejects(assertCheckpointEngine(checkpoint, substituted), { code: "input_checkpoint_engine_mismatch" });
    delete checkpoint.value.flow_pack.engine.artifact_sha256;
    await assert.rejects(assertCheckpointEngine(checkpoint, substituted), { code: "input_checkpoint_engine_pin_missing" });
  } finally { await rm(root, { recursive: true, force: true }); }
});
