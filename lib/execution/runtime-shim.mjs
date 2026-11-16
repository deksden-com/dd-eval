import path from "node:path";
import { chmod, mkdir, realpath, rm, stat, symlink, writeFile } from "node:fs/promises";
import { contained } from "../contained-path.mjs";
import { homesFile } from "../homes.mjs";
import { runtimeBin } from "./runtime-environment.mjs";

const fail = (message, code) => { throw Object.assign(new Error(message), { code }); };
async function exists(file) { try { await stat(file); return true; } catch { return false; } }

/** Install an isolated launcher bound to the retained engine and resources. */
export async function installRuntimeShim(runtimeRoot, selected, { resourceHome = process.env.DD_FLOW_RESOURCE_HOME ?? runtimeRoot, registryFile = homesFile() } = {}) {
  if (!selected?.snapshot_root || !selected?.entrypoint) fail("canonical runtime has no executable dd-flow engine", "canonical_engine_missing");
  const shim = runtimeBin(runtimeRoot);
  const executable = contained(selected.snapshot_root, selected.entrypoint, "engine entrypoint");
  const bindings = { DD_FLOW_HOME: runtimeRoot, DD_FLOW_BIN: shim, DD_FLOW_ENGINE_MODE: '1', DD_FLOW_ENGINE_HOME: selected.snapshot_root,
    DD_FLOW_CONFIG_HOME: runtimeRoot, DD_FLOW_RESOURCE_HOME: resourceHome,
    DD_EVAL_REGISTRY_FILE: registryFile, ...(process.env.DD_MEMORYBANK ? { DD_MEMORYBANK: process.env.DD_MEMORYBANK } : {}) };
  for (const [key, value] of Object.entries(bindings)) if (typeof value !== 'string' || !value || (key !== 'DD_FLOW_ENGINE_MODE' && !path.isAbsolute(value))) fail(`Private launcher has invalid ${key}`, 'runtime_scope_identity_missing');
  // The evaluation runtime must execute the adapters carried by its exact
  // engine snapshot, including its production dependencies. Keep the stable
  // adapter path as a relative alias: detached copies lose Node's dependency
  // lookup, while an absolute alias would break whole-runtime relocation.
  // Operator configuration still supplies only the native harness binary.
  const bundledAdapters = path.join(selected.snapshot_root, "dist", "harness-runtime");
  if (!(await exists(bundledAdapters))) fail("canonical runtime has no bundled harness adapters", "canonical_engine_missing");
  const adapterRoot = path.join(runtimeRoot, "harness-runtime");
  await mkdir(runtimeRoot, { recursive: true });
  await rm(adapterRoot, { recursive: true, force: true });
  // macOS /tmp and /var are aliases into /private: relative links are resolved
  // from the physical parent, not the caller's lexical home path.
  await symlink(path.relative(await realpath(runtimeRoot), await realpath(bundledAdapters)), adapterRoot, "dir");
  await mkdir(path.dirname(shim), { recursive: true });
  // The shim can be called directly from a provider tool shell. Re-export its
  // absolute identity so follow-up commands cannot fall back to global dd-flow.
  const quote = value => `'${value.replaceAll("'", "'\\''")}'`;
  await writeFile(shim, `#!/bin/sh\n${Object.entries(bindings).map(([key, value]) => `export ${key}=${quote(value)}`).join('\n')}\nexec ${quote(process.execPath)} ${quote(executable)} "$@"\n`, { mode: 0o755 });
  await chmod(shim, 0o755);
  return shim;
}
