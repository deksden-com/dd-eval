import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

/** Hash legacy snapshot tree paths, file contents and symlink targets. */
export function snapshotTreeHash(root) {
  const hash = createHash("sha256");
  const visit = (dir, relative) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const file = path.join(dir, entry.name), name = path.join(relative, entry.name);
      if (entry.isDirectory()) visit(file, name);
      else if (entry.isFile()) { hash.update(name); hash.update(fs.readFileSync(file)); }
      else if (entry.isSymbolicLink()) { hash.update(name); hash.update("symlink:" + fs.readlinkSync(file)); }
    }
  };
  visit(root, "");
  return hash.digest("hex");
}
