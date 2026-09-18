import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { mkdir, readFile, realpath, rename, stat, writeFile } from 'node:fs/promises';
import { withRunnerLock } from './runner-lock.mjs';

export const homesFile = (env = process.env) => path.join(env.HOME ?? os.homedir(), '.dd-eval', 'homes.json');
export async function listHomes(env = process.env) {
  let value;
  try { value = JSON.parse(await readFile(homesFile(env), 'utf8')); }
  catch (error) { if (error.code === 'ENOENT') return { schema_version: 1, homes: [] }; throw error; }
  if (value?.schema_version !== 1 || !Array.isArray(value.homes) || value.homes.some(h => !h || !/^SRC-[a-zA-Z0-9-]+$/.test(h.id) || typeof h.root !== 'string' || !path.isAbsolute(h.root) || typeof h.label !== 'string' || typeof h.created_at !== 'string' || typeof h.disabled !== 'boolean') || new Set(value.homes.map(h => h.id)).size !== value.homes.length || new Set(value.homes.map(h => h.root)).size !== value.homes.length) throw new Error('Invalid Eval homes registry; preserved unchanged');
  return value;
}
async function updateHomes(env, action) {
  const file = homesFile(env);
  await mkdir(path.dirname(file), { recursive: true, mode: 0o700 });
  return withRunnerLock(file, async () => {
    const registry = await listHomes(env), result = action(registry);
    const temporary = `${file}.${randomUUID()}.tmp`;
    await writeFile(temporary, JSON.stringify(registry, null, 2) + '\n', { mode: 0o600 });
    await rename(temporary, file);
    return result;
  });
}
export async function addHome(root, label, env = process.env, automatic = false) {
  if (typeof root !== 'string' || !root.trim()) throw invalidHomeInput('path', 'Eval home requires a nonempty directory path');
  if (label !== undefined && typeof label !== 'string') throw invalidHomeInput('label', 'Eval home label must be a string');
  if (typeof automatic !== 'boolean') throw invalidHomeInput('automatic', 'Automatic registration must be boolean');
  let canonical;
  try {
    canonical = await realpath(path.resolve(root));
    if (!(await stat(canonical)).isDirectory()) throw invalidHomeInput('path', 'Eval home must be a directory');
  } catch (error) {
    if (['ENOENT', 'ENOTDIR', 'EACCES', 'EPERM', 'ELOOP', 'ENAMETOOLONG'].includes(error.code)) throw invalidHomeInput('path', `Cannot access Eval home directory: ${error.code}`);
    throw error;
  }
  return updateHomes(env, registry => {
    const existing = registry.homes.find(h => h.root === canonical);
    if (existing) { if (!automatic) existing.disabled = false; if (label) existing.label = label; return existing; }
    const home = { id: `SRC-${randomUUID()}`, root: canonical, label: label ?? path.basename(canonical), created_at: new Date().toISOString(), disabled: false };
    registry.homes.push(home); return home;
  });
}
function invalidHomeInput(parameter, message) {
  return Object.assign(new Error(message), { code: 'usage', details: { parameter, phase: 'prepare', effect: 'no_effect', recoverable: true } });
}
export async function removeHome(id, env = process.env) {
  if (typeof id !== 'string' || !id.trim()) throw invalidHomeInput('id', 'Eval home requires a nonempty ID or path');
  const registry = await listHomes(env);
  const target = registry.homes.find(h => h.id === id || h.root === path.resolve(id));
  if (!target) throw invalidHomeInput('id', 'Unknown Eval home');
  return updateHomes(env, current => {
    const home = current.homes.find(h => h.id === target.id && h.root === target.root);
    if (!home) throw new Error('Eval home changed after preparation');
    home.disabled = true; return home;
  });
}
// A supplied ordinary run or derived fork may belong to another home than the
// ambient env. Only producer-owned direct-child namespaces are accepted.
export async function registerRunHome(root, env = process.env) {
  const parent = path.dirname(path.resolve(root));
  if (!['runs', 'forks'].includes(path.basename(parent))) return;
  const home = path.dirname(parent);
  await mkdir(home, { recursive: true });
  await addHome(home, undefined, env, true);
}
