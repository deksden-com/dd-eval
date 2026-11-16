import path from "node:path";
import { cp, mkdir, readdir, rm, stat } from "node:fs/promises";
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
/** Materialize a verified, relocatable engine artifact without consulting the
 * ambient router.  Forks use this before `run fork`: that command upgrades a
 * restored RUN only from artifacts already present in its private home. */
export async function materializeEngineArtifact({ source, sourceRoot, runtimeRoot }) {
  if (!source?.package_name || !source?.package_version || !source?.engine_version || !source?.integrity?.checksum) fail("Engine artifact has no complete identity", "fork_engine_artifact_invalid");
  await verifyEngineArtifact(source, sourceRoot);
  const target = engineTarget(runtimeRoot, source);
  await rm(target, { recursive: true, force: true });
  await mkdir(path.dirname(target), { recursive: true });
  await cp(sourceRoot, target, { recursive: true, force: true, verbatimSymlinks: true });
  const manifestFile = path.join(target, "engine.json");
  const manifest = await readJson(manifestFile);
  const selected = { ...manifest, package_root: target, snapshot_root: target };
  if (selected.package_name !== source.package_name || selected.package_version !== source.package_version || selected.engine_version !== source.engine_version || selected.integrity?.checksum !== source.integrity?.checksum) fail("Copied engine artifact changed identity", "fork_engine_artifact_invalid");
  await writeJsonAtomic(manifestFile, selected);
  await verifyEngineArtifact(selected);
  return selected;
}

/** Enumerate retained engine artifacts matching the requested identity. */
export async function retainedEngineArtifacts(enginesRoot, { engineVersion, integrityChecksum = null }) {
  const packages = await readdir(enginesRoot, { withFileTypes: true }).catch(error => error.code === "ENOENT" ? [] : Promise.reject(error));
  const matches = [];
  for (const packageDirectory of packages.filter(entry => entry.isDirectory())) {
    const versions = await readdir(path.join(enginesRoot, packageDirectory.name), { withFileTypes: true });
    for (const versionDirectory of versions.filter(entry => entry.isDirectory())) {
      const root = path.join(enginesRoot, packageDirectory.name, versionDirectory.name);
      const manifest = await readJson(path.join(root, "engine.json")).catch(() => null);
      if (manifest?.schema_id !== "dd-flow/engine-manifest@1") continue;
      const checksum = manifest.integrity?.checksum;
      if (manifest.package_version === engineVersion && manifest.engine_version === engineVersion && (!integrityChecksum || checksum === integrityChecksum)) matches.push({ root, manifest });
    }
  }
  return matches;
}

/** Resolve a unique verified engine for a fork, requiring a digest for upgrades. */
export async function inheritedForkEngine({ sourceRoot, executionId, engineVersion, integrityChecksum = null }) {
  const sourceEngines = path.join(sourceRoot, "executions", executionId, "dd-flow-home", "engines");
  const sourceMatches = await retainedEngineArtifacts(sourceEngines, { engineVersion, integrityChecksum });
  if (sourceMatches.length === 1) {
    await verifyEngineArtifact(sourceMatches[0].manifest, sourceMatches[0].root);
    return sourceMatches[0];
  }
  // A checkpoint may be intentionally upgraded.  In that case the caller
  // must provide the new artifact's digest; this lets us import a particular
  // locally installed snapshot without trusting router selection or a moving
  // "latest" version.
  if (!integrityChecksum) fail(`Fork requires one retained engine artifact for ${engineVersion}; an upgrade requires --integrity-checksum`, "fork_engine_artifact_missing");
  const configHome = process.env.DD_FLOW_CONFIG_HOME ?? process.env.DD_FLOW_HOME ?? path.join(process.env.HOME ?? ".", ".dd-flow");
  const externalMatches = await retainedEngineArtifacts(path.join(configHome, "engines"), { engineVersion, integrityChecksum });
  if (sourceMatches.length + externalMatches.length !== 1) fail(`Fork requires exactly one retained engine artifact for ${engineVersion}/${integrityChecksum}`, "fork_engine_artifact_missing");
  const selected = externalMatches[0] ?? sourceMatches[0];
  await verifyEngineArtifact(selected.manifest, selected.root);
  return selected;
}

/** Project the identity fields shared by retained engine records. */
export function runtimeEngineIdentity(engine) {
  return { package_name: engine.package_name, package_version: engine.package_version, engine_version: engine.engine_version, integrity_checksum: engine.integrity?.checksum ?? engine.integrity_checksum };
}
