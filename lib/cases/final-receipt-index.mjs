import path from "node:path";
import { lstat, readdir, realpath } from "node:fs/promises";
import { withFrozenRuntimeDatabase } from "../recovery/recovery-safety.mjs";
import { inside, ownedFile, optionalFile } from "./frozen-evidence.mjs";

const ensure = (condition, message) => { if (!condition) throw new Error(message); };
const parseJson = file => JSON.parse(file.text);

/** Index owned final receipts and validate any retained Work authority. */
export async function finalReceiptIndex(snapshot, runtime) {
  const result = new Map();
  const workIds = new Set();
  const directoriesAt = async directory => {
    try {
      const info = await lstat(directory);
      ensure(info.isDirectory() && !info.isSymbolicLink() && inside(snapshot, await realpath(directory)), "receipt directory escaped frozen runtime");
      return await readdir(directory);
    } catch (error) { if (error.code === "ENOENT") return []; throw error; }
  };
  for (const stage of ["", "05-code", "06-code-review", "07-merge"]) {
    const root = path.join(snapshot, runtime, stage);
    const directories = [path.join(root, "checks"), ...(stage === "05-code" ? [path.join(root, "readiness", "checks")] : [])];
    for (const name of await directoriesAt(path.join(root, "works"))) {
      if (/^WRK-[A-Za-z0-9-]+$/.test(name)) directories.push(path.join(root, "works", name, "checks"));
    }
    for (const directory of directories) for (const name of await directoriesAt(directory)) {
      if (!/^RCP-[0-9]+$/.test(name)) continue;
      const relative = path.relative(snapshot, path.join(directory, name, "receipt.json"));
      const receipt = parseJson(await ownedFile(snapshot, relative));
      const work = directory.includes(`${path.sep}works${path.sep}`) ? path.basename(path.dirname(directory)) : null;
      const run = path.basename(runtime);
      const namespace = receipt.work_id ?? run;
      const id = receipt.id;
      ensure(typeof id === "string" && receipt.local_id === name && id === `${namespace}/${name}`
        && (work === null ? receipt.scope === "aggregate" : receipt.work_id === work)
        && ["work", "aggregate"].includes(receipt.scope)
        && (receipt.scope !== "work" || typeof receipt.work_id === "string")
        && (receipt.work_id === null || /^WRK-[A-Za-z0-9-]+$/.test(receipt.work_id))
        && ["work", "code", "readiness", "merge", "release"].includes(receipt.gate)
        && [undefined, null, "check_inputs"].includes(receipt.fingerprint_scope), "native receipt namespace, gate or owning path differs");
      if (result.has(id)) throw new Error(`duplicate final receipt id: ${id}`);
      if (receipt.work_id) workIds.add(receipt.work_id);
      result.set(id, relative);
    }
  }
  if (workIds.size && await optionalFile(snapshot, "runtime/db.sqlite")) {
    const runId = path.basename(runtime), projectId = path.basename(path.dirname(path.dirname(runtime)));
    await withFrozenRuntimeDatabase(snapshot, db => {
      // Old snapshots may predate retained Work authority; consumed proof still
      // follows its legacy contract. Modern catalogs cannot claim a foreign Work.
      if (!db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='works'").get()) return;
      for (const workId of workIds) ensure(db.prepare("SELECT 1 FROM works WHERE work_id = ? AND project_id = ? AND run_id = ?").get(workId, projectId, runId), "receipt catalog contains a foreign Work");
    });
  }
  return result;
}
