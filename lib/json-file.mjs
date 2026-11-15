import { readRegularFile } from "./regular-file.mjs";

const fail = (message, code = "validation") => { const error = new Error(message); error.code = code; throw error; };

export async function readJson(file) {
  return parseJsonBytes(await readRegularFile(file), file);
}
export function parseJsonBytes(bytes, file) {
  try { return JSON.parse(bytes.toString("utf8")); }
  catch { fail(`Invalid JSON: ${file}`, "invalid_json"); }
}
