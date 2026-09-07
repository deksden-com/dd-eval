import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

function fail(message, code) { throw Object.assign(new Error(message), { code }); }
// Matches dd-flow's full_content engine checksum, excluding its relocatable manifest.
export async function engineArtifactDigest(root) {
  const files = [];
  async function collect(directory) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      if (entry.name === "engine.json") continue;
      const file = path.join(directory, entry.name);
      if (entry.isDirectory()) await collect(file);
      else if (entry.isFile()) files.push(path.relative(root, file));
    }
  }
  await collect(root);
  const hash = createHash("sha256");
  for (const file of files.sort()) { hash.update(file); hash.update("\0"); hash.update(await readFile(path.join(root, file))); hash.update("\0"); }
  return hash.digest("hex");
}
export async function verifyEngineArtifact(engine, root = engine?.snapshot_root) {
  const expected = engine?.integrity?.checksum ?? engine?.integrity_checksum;
  if (!root || !/^[a-f0-9]{64}$/.test(expected ?? "")) fail("Engine has no verifiable artifact identity", "engine_artifact_identity_missing");
  const actual = await engineArtifactDigest(root);
  if (actual !== expected) fail("Engine files differ from the declared artifact digest", "engine_artifact_mismatch");
  return actual;
}
export async function assertCheckpointEngine(inputCheckpoint, engine) {
  const expected = inputCheckpoint?.value?.flow_pack?.engine;
  if (!/^[a-f0-9]{64}$/.test(expected?.artifact_sha256 ?? "")) fail("Input checkpoint has no engine artifact pin; create a new checkpoint before execution", "input_checkpoint_engine_pin_missing");
  if (engine?.package_version !== expected.version || engine?.engine_version !== expected.version || (engine?.integrity?.checksum ?? engine?.integrity_checksum) !== expected.artifact_sha256) fail("Runtime engine version or artifact differs from the input checkpoint", "input_checkpoint_engine_mismatch");
  await verifyEngineArtifact(engine);
}
