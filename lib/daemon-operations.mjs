import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";

function location(root, id) {
  if (typeof id !== "string" || !id) throw Object.assign(new Error("operation id is required"), { code: "operation_id_required" });
  return path.join(root, "operations", createHash("sha256").update(id).digest("hex"));
}
async function read(file) { try { return JSON.parse(await readFile(file, "utf8")); } catch (error) { if (error.code === "ENOENT") return null; throw error; } }

export async function inspectDaemonOperation(root, id) {
  const directory = location(root, id);
  const requested = await read(path.join(directory, "requested.json"));
  if (!requested) throw Object.assign(new Error("daemon operation is not recorded"), { code: "operation_not_found", details: { operation_id: id } });
  return { ...requested, ...(await read(path.join(directory, "result.json")) ?? await read(path.join(directory, "observation-lost.json")) ?? { state: "running" }) };
}
