import path from "node:path";
import { mkdir } from "node:fs/promises";
import { prepareRuntimeHarnessConfig } from "../harness/runtime-setup.mjs";
import { commandJson } from "../process-json.mjs";
import { verifyEngineSnapshot, materializeEngineArtifact } from "./engine-snapshot.mjs";
import { runtimeEnv } from "./runtime-environment.mjs";
import { installRuntimeShim } from "./runtime-shim.mjs";

const fail = (message, code) => { throw Object.assign(new Error(message), { code }); };

/** Restore the canonical engine and verify isolated router selection. */
export async function materializeRuntimeEngine({ home, engine, runtimeRoot, projectRoot, resourceHome = runtimeEnv(runtimeRoot).DD_FLOW_RESOURCE_HOME }) {
  await prepareRuntimeHarnessConfig(runtimeRoot);
  const source = await verifyEngineSnapshot(home, engine);
  const selected = await materializeEngineArtifact({ source: source.manifest, sourceRoot: source.root, runtimeRoot });
  const bin = process.env.DD_FLOW_BIN ?? "dd-flow";
  const isolated = await commandJson(bin, ["engine", "resolve", "--project-root", projectRoot], { cwd: projectRoot, env: { DD_FLOW_HOME: runtimeRoot } });
  const resolved = isolated.selection?.selected;
  if (resolved?.package_name !== selected.package_name || resolved?.package_version !== selected.package_version || resolved?.engine_version !== selected.engine_version || resolved?.integrity?.checksum !== selected.integrity?.checksum) fail("isolated runtime did not resolve the exact canonical engine snapshot", "canonical_engine_install_failed");
  await installRuntimeShim(runtimeRoot, resolved, { resourceHome });
  return resolved;
}

/** Provision an isolated runtime with the exact selected engine. */
export async function provisionRuntimeEngine(projectRoot, runtimeRoot, { controlOnly = false, resourceHome = runtimeEnv(runtimeRoot).DD_FLOW_RESOURCE_HOME } = {}) {
  if (controlOnly) await mkdir(runtimeRoot, { recursive: true });
  else await prepareRuntimeHarnessConfig(runtimeRoot);
  const override = process.env.DD_FLOW_BIN;
  const bin = override ?? "dd-flow";
  const isolatedOptions = { cwd: projectRoot, env: { DD_FLOW_HOME: runtimeRoot } };
  const resolveArgs = ["engine", "resolve", "--project-root", projectRoot];
  let source;
  // A beta/eval caller may deliberately supply the local CLI entrypoint.  Do
  // not ask that entrypoint to select an already-installed same-semver engine:
  // install its current bytes into the otherwise empty runtime first.  This is
  // the one explicit development override; normal runs retain package routing.
  if (override) {
    await commandJson(bin, ["engine", "install", "--force"], isolatedOptions);
  } else {
    source = (await commandJson(bin, resolveArgs, { cwd: projectRoot, env: {} })).selection?.selected;
    if (!source?.snapshot_root || !source?.entrypoint || !source?.package_version) fail("canonical runtime has no compatible installed dd-flow engine", "canonical_engine_missing");
    await commandJson(process.execPath, [path.join(source.snapshot_root, source.entrypoint), "engine", "install"], isolatedOptions);
  }
  const selected = (await commandJson(bin, resolveArgs, isolatedOptions)).selection?.selected;
  if (source) {
    if (selected?.package_version !== source.package_version || selected?.integrity?.checksum !== source.integrity?.checksum) fail("isolated runtime did not resolve the selected dd-flow engine", "canonical_engine_install_failed");
  } else if (!selected?.snapshot_root || !selected?.entrypoint || !selected?.package_version) {
    fail("local dd-flow override did not install a compatible engine", "canonical_engine_install_failed");
  }
  await installRuntimeShim(runtimeRoot, selected, { resourceHome });
  return selected;
}
