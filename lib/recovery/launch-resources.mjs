import path from "node:path";
import { readFile, realpath } from "node:fs/promises";

const read = async file => JSON.parse(await readFile(file, "utf8"));

const normalizedHost = host => {
  const value = host.toLowerCase().replace(/^\[|\]$/g, '');
  if (value === 'localhost' || value === 'loopback' || value === '::1' || /^127\.\d+\.\d+\.\d+$/.test(value)) return 'loopback';
  if (value === '0.0.0.0' || value === '::' || value === 'local-wildcard') return 'local-wildcard';
  return value;
};

/** Launch facts only, never credentials or authority to stop a resource. */
async function plannedCanonicalPath(file) {
  const absolute = path.resolve(file);
  let ancestor = absolute;
  for (;;) {
    try { return path.resolve(await realpath(ancestor), path.relative(ancestor, absolute)); }
    catch (error) { if (!['ENOENT', 'ENOTDIR'].includes(error.code) || ancestor === path.dirname(ancestor)) throw error; ancestor = path.dirname(ancestor); }
  }
}
/** Summarize launch resource bindings without retaining credentials. */
export async function prepareLaunchResources(root, env = process.env) {
  const databases = [], ports = [];
  // DATABASE_URL alone does not attest the service used by test-world setup;
  // its launcher may otherwise select a shared default admin endpoint.
  let complete = Boolean(env.DATABASE_URL && env.DD_TASKS_TEST_ADMIN_URL);
  for (const name of ['DATABASE_URL', 'DD_TASKS_TEST_ADMIN_URL']) {
    if (!env[name]) continue;
    try {
      const url = new URL(env[name]);
      if (!['postgres:', 'postgresql:'].includes(url.protocol) || !url.hostname || !url.pathname.slice(1)) throw new Error('Unknown database binding');
      if ([...url.searchParams.keys()].some(key => ['host', 'hostaddr', 'port', 'service', 'servicefile'].includes(key.toLowerCase()))) complete = false;
      const host = normalizedHost(url.hostname);
      // ponytail: qualify local test-world endpoints only; remote isolation
      // needs prepared resource proof, not a new DNS/network identity resolver.
      if (!['loopback', 'local-wildcard'].includes(host)) complete = false;
      databases.push(JSON.stringify([host, url.port || '5432', decodeURIComponent(url.pathname.slice(1))]));
      if (host === 'loopback' || host === 'local-wildcard') ports.push(url.port || '5432');
    } catch { complete = false; }
  }
  for (const [name, value] of Object.entries(env)) if (/^DD_FLOW_PORT_[A-Z0-9_]+$/.test(name) && value !== undefined) {
    if (!/^\d+$/.test(value) || Number(value) < 1 || Number(value) > 65535) complete = false;
    else ports.push(String(Number(value)));
  }
  let workspace;
  try { workspace = await plannedCanonicalPath(path.resolve(root, 'executions')); }
  catch { complete = false; workspace = path.resolve(root, 'executions'); }
  return { schema_id: 'dd-eval/launch-resources@1', complete, workspaces: [workspace], databases: [...new Set(databases)].sort(), ports: [...new Set(ports)].sort(), native_sessions: [] };
}

function validResources(value) {
  return value?.schema_id === 'dd-eval/launch-resources@1' && value.complete === true
    && ['workspaces', 'databases', 'ports', 'native_sessions'].every(key => Array.isArray(value[key]) && value[key].every(item => typeof item === 'string' && item.length > 0 && !item.includes('\0')))
    && value.workspaces.length > 0 && value.databases.length > 0 && value.workspaces.every(item => path.isAbsolute(item))
    && value.ports.every(item => /^\d+$/.test(item) && String(Number(item)) === item && Number(item) > 0 && Number(item) <= 65535)
    && value.databases.every(item => { try { const parts = JSON.parse(item); return Array.isArray(parts) && parts.length === 3 && parts.every(part => typeof part === 'string' && part.length > 0 && !part.includes('\0'))
      && ['loopback', 'local-wildcard'].includes(parts[0])
      && /^\d+$/.test(parts[1]) && String(Number(parts[1])) === parts[1] && Number(parts[1]) > 0 && Number(parts[1]) <= 65535; } catch { return false; } });
}
/** Treat incomplete or overlapping retained resource bindings as conflicting. */
export function launchResourcesConflict(left, right) {
  if (!validResources(left) || !validResources(right)) return true;
  const inside = (root, file) => { const rel = path.relative(root, file); return !rel || rel !== '..' && !rel.startsWith(`..${path.sep}`) && !path.isAbsolute(rel); };
  const localPorts = value => [...value.ports, ...value.databases.map(item => JSON.parse(item)[1])];
  return left.workspaces.some(a => right.workspaces.some(b => inside(a, b) || inside(b, a)))
    // A retained cleanup may own the service endpoint, not just one database.
    || left.databases.some(a => right.databases.some(b => { try { return JSON.stringify(JSON.parse(a).slice(0, 2)) === JSON.stringify(JSON.parse(b).slice(0, 2)); } catch { return true; } }))
    || localPorts(left).some(a => localPorts(right).includes(a))
    || left.native_sessions.some(a => right.native_sessions.includes(a));
}

/** Select retained owners whose resources can conflict with this launch. */
export async function blockingCandidates(candidates, launchResources) {
  if (!launchResources) return candidates;
  const canonical = async value => {
    if (!validResources(value)) return null;
    try { return { ...value, workspaces: await Promise.all(value.workspaces.map(plannedCanonicalPath)) }; } catch { return null; }
  };
  const planned = await canonical(launchResources);
  const selected = [];
  for (const item of candidates) {
    let reservation;
    try { reservation = await read(path.join(item.root, 'launch-reservation.json')); }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
    const bound = reservation?.schema_id === 'dd-eval/launch-reservation@1' && reservation?.root === item.root && reservation?.run_id === item.manifest.run_id && reservation?.resource_home === item.manifest.runtime_resource_home;
    if (!bound || launchResourcesConflict(planned, await canonical(reservation.resource_bindings))) selected.push(item);
  }
  return selected;
}
