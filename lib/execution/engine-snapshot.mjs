import path from "node:path";
import { cp, stat } from "node:fs/promises";
import { canonicalLocator } from "../cases/canonical-state.mjs";
import { contained, relative } from "../contained-path.mjs";
import { verifyEngineArtifact } from "../engine-admission.mjs";
import { readJson } from "../json-file.mjs";
import { writeJsonAtomic } from "../runner-events.mjs";

const fail = (message, code) => { throw Object.assign(new Error(message), { code }); };
async function exists(file) { try { await stat(file); return true; } catch { return false; } }

/** Resolve a single owned engine artifact directory. */
export function engineTarget(runtimeRoot, engine) {
  const name = relative(engine.package_name, "engine package name").replace("/", "_");
  const version = relative(engine.package_version, "engine package version");
  if (name === "." || version === "." || /[\\/]/.test(version)) fail("Engine version must identify one retained artifact directory", "fork_engine_artifact_invalid");
  return contained(path.join(runtimeRoot, "engines"), path.join(name, version), "engine artifact target");
}
/** Verify the retained engine manifest and artifact against the snapshot binding. */
export async function verifyEngineSnapshot(home, engine) {
  const root = contained(home, engine.locator, "engine snapshot locator");
  const manifestFile = path.join(root, "engine.json");
  if (!(await exists(manifestFile))) fail(`engine snapshot manifest is missing: ${manifestFile}`, "engine_snapshot_missing");
  const manifest = await readJson(manifestFile);
  if (manifest?.schema_id !== "dd-flow/engine-manifest@1" || manifest.package_name !== engine.package_name || manifest.package_version !== engine.package_version || manifest.engine_version !== engine.engine_version || manifest.integrity?.checksum !== engine.integrity_checksum) fail("engine snapshot does not match its stage entry", "engine_snapshot_mismatch");
  await verifyEngineArtifact(manifest, root);
  return { root, manifest };
}
/** Capture a verified installed engine for a canonical build. */
export async function captureEngineSnapshot({ root, home, selected }) {
  if (!selected?.snapshot_root || !selected?.package_name || !selected?.package_version || !selected?.engine_version || !selected?.integrity?.checksum) fail("canonical runtime has no compatible installed dd-flow engine", "canonical_engine_missing");
  await verifyEngineArtifact(selected);
  const destination = path.join(root, "engine");
  await cp(selected.snapshot_root, destination, { recursive: true, force: true, verbatimSymlinks: true });
  const manifestFile = path.join(destination, "engine.json");
  const manifest = await readJson(manifestFile);
  const rewritten = { ...manifest, package_root: destination, snapshot_root: destination };
  await writeJsonAtomic(manifestFile, rewritten);
  return {
    schema_id: "dd-eval/engine-snapshot@1",
    locator: canonicalLocator(home, destination),
    package_name: rewritten.package_name,
    package_version: rewritten.package_version,
    engine_version: rewritten.engine_version,
    integrity_checksum: rewritten.integrity?.checksum
  };
}
