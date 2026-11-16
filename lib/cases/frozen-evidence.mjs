import { createHash } from "node:crypto";
import { lstat, readFile, realpath, stat } from "node:fs/promises";
import path from "node:path";

/** Hash the exact frozen evidence bytes. */
export const digest = bytes => createHash("sha256").update(bytes).digest("hex");

/** Test whether a resolved target remains within its owned root. */
export const inside = (root, target) => target === root || target.startsWith(root + path.sep);

/** Read a regular, non-symlinked evidence file confined to the frozen snapshot. */
export async function ownedFile(root, relative) {
  if (typeof relative !== "string" || !relative || path.isAbsolute(relative) || relative.split(/[\\/]/).includes("..")) throw new Error("invalid snapshot-relative evidence path");
  const file = path.resolve(root, relative);
  for (let current = file; current !== path.resolve(root); current = path.dirname(current)) {
    if ((await lstat(current)).isSymbolicLink()) throw new Error("symlinked evidence path is not a frozen document");
  }
  const actualRoot = await realpath(root), actual = await realpath(file);
  if (!inside(actualRoot, actual) || !(await stat(actual)).isFile()) throw new Error("evidence path escaped the frozen snapshot");
  const bytes = await readFile(actual);
  return { text: bytes.toString("utf8"), sha256: digest(bytes), path: relative };
}

/** Return null only for missing evidence; propagate ownership and I/O failures. */
export async function optionalFile(root, relative) {
  try { return await ownedFile(root, relative); }
  catch (error) { if (error.code === "ENOENT") return null; throw error; }
}
