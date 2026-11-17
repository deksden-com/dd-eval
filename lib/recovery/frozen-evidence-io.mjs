import { lstat, open, realpath } from "node:fs/promises";
import { constants } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { sha256 } from "../execution/journal-hash.mjs";

const inside = (root, file) => file === root || file.startsWith(root + path.sep);
const ensure = (value, message) => { if (!value) throw Object.assign(new Error(message), { code: "snapshot_binding_invalid" }); };

/** Read owned frozen evidence while rejecting symlink and path substitutions. */
export async function readFrozenFile(root, file) {
  const owner = await realpath(root), resolved = path.resolve(file);
  ensure(inside(owner, resolved), "Frozen file escaped its owner");
  for (let item = resolved; item !== owner; item = path.dirname(item)) ensure(!(await lstat(item)).isSymbolicLink(), "Frozen evidence traverses a symlink");
  ensure(inside(owner, await realpath(resolved)) && (await lstat(resolved)).isFile(), "Frozen evidence is not an owned regular file");
  const handle = await open(resolved, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
  try {
    const before = await handle.stat();
    ensure(before.isFile(), "Frozen evidence is not a regular file");
    const bytes = await handle.readFile(), after = await lstat(resolved);
    ensure(before.ino === after.ino && before.dev === after.dev && inside(owner, await realpath(resolved)), "Frozen evidence changed while reading");
    return { bytes, owner, path: path.relative(owner, resolved) };
  } finally { await handle.close(); }
}

/** Decode retained evidence and hash the same accepted bytes. */
export async function frozenFile(root, file) {
  const { bytes, path: relative } = await readFrozenFile(root, file);
  return { text: bytes.toString("utf8"), sha256: sha256(bytes), path: relative };
}

/** Inspect only the retained SQLite image, never the live runtime. */
export async function withFrozenRuntimeDatabase(snapshot, read) {
  await frozenFile(snapshot, path.join(snapshot, "runtime", "db.sqlite"));
  const db = new DatabaseSync(path.join(snapshot, "runtime", "db.sqlite"), { readOnly: true });
  try { return read(db); } finally { db.close(); }
}
