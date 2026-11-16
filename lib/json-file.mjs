import { readRegularFile } from "./regular-file.mjs";
import { randomUUID } from "node:crypto";
import { mkdir, open, rename, unlink } from "node:fs/promises";
import path from "node:path";

const fail = (message, code = "validation") => { const error = new Error(message); error.code = code; throw error; };

/** Atomically publish JSON and sync both its contents and parent directory. */
export async function writeJsonAtomic(file, value) {
  await mkdir(path.dirname(file), { recursive: true });
  const temporary = `${file}.${process.pid}.${randomUUID()}.tmp`;
  try {
    const payload = await open(temporary, "wx", 0o600);
    try { await payload.writeFile(`${JSON.stringify(value, null, 2)}\n`); await payload.sync(); }
    finally { await payload.close(); }
    await rename(temporary, file);
    const directory = await open(path.dirname(file), "r");
    try { await directory.sync(); }
    finally { await directory.close(); }
  } finally { await unlink(temporary).catch(error => { if (error.code !== "ENOENT") throw error; }); }
}

export async function readJson(file) {
  return parseJsonBytes(await readRegularFile(file), file);
}
export function parseJsonBytes(bytes, file) {
  try { return JSON.parse(bytes.toString("utf8")); }
  catch { fail(`Invalid JSON: ${file}`, "invalid_json"); }
}
