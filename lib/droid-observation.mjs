import { createHash } from "node:crypto";
import { open, readFile, readdir, stat } from "node:fs/promises";
import path from "node:path";

/** Cache native filenames, then read only a bounded header and small settings.
 * New child discovery may walk the directory once; heartbeats never replay it. */
export class DroidMetadataReader {
  constructor(factory) { this.factory = factory; this.files = new Map(); this.cache = new Map(); }
  async locate(id) {
    if (this.files.has(id)) return this.files.get(id);
    const visit = async directory => {
      for (const entry of await readdir(directory, { withFileTypes: true }).catch(error => { if (error.code === "ENOENT") return []; throw error; })) {
        const file = path.join(directory, entry.name);
        if (entry.isDirectory()) await visit(file);
        else if (entry.isFile() && entry.name.endsWith(".jsonl")) this.files.set(entry.name.slice(0, -6), file);
      }
    };
    await visit(path.join(this.factory, "sessions"));
    return this.files.get(id) ?? null;
  }
  async read(id) {
    const file = await this.locate(id); if (!file) return null;
    const settingsFile = file.replace(/\.jsonl$/, ".settings.json");
    const info = await stat(settingsFile).catch(error => { if (error.code === "ENOENT") return null; throw error; });
    if (!info || info.size > 1_048_576) return null;
    const identity = `${info.ino}:${info.mtimeMs}:${info.size}`;
    if (this.cache.get(id)?.identity === identity) return this.cache.get(id).value;
    const handle = await open(file, "r"); const buffer = Buffer.alloc(65_536);
    let header;
    try { const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0); header = JSON.parse(buffer.subarray(0, bytesRead).toString("utf8").split("\n")[0]); }
    finally { await handle.close(); }
    if (header.type !== "session_start" || header.id !== id) throw Object.assign(new Error("native metadata Session identity differs"), { code: "session_identity_mismatch" });
    let bytes, settings;
    try { bytes = await readFile(settingsFile, "utf8"); settings = JSON.parse(bytes); }
    catch (error) { if (error instanceof SyntaxError || error.code === "ENOENT") return null; throw error; }
    const value = { header, settings, transcript_path: file, source: { path: settingsFile, sha256: createHash("sha256").update(bytes).digest("hex") } };
    this.cache.set(id, { identity, value }); return value;
  }
}

export function parseDroidRoutingLine(line) {
  if (!line.includes("[Model-Router] Model transition | Context: ")) return null;
  let context; try { context = JSON.parse(line.split(" | Context: ").slice(1).join(" | Context: ")); } catch { return null; }
  if (context.slot !== "main" || typeof context.sessionId !== "string" || typeof context.modelId !== "string") return null;
  return { session_id: context.sessionId, model: context.modelId, previous_model: context.previousModelId ?? null,
    reason: typeof context.reason === "string" ? context.reason : null, native_timestamp: /^\[([^\]]+)\]/.exec(line)?.[1] ?? null,
    event_sha256: createHash("sha256").update(line).digest("hex") };
}

/** Keep the cursor in daemon state. Bound every read, tolerate incomplete lines
 * and restart from zero after truncation/rotation of this execution's own log. */
export async function readDroidRoutingLog(file, cursor = {}) {
  let handle;
  try { handle = await open(file, "r"); } catch (error) { if (error.code === "ENOENT") return { cursor, events: [] }; throw error; }
  try {
    const info = await handle.stat();
    const offset = info.ino === cursor.ino && info.size >= (cursor.offset ?? 0) ? cursor.offset ?? 0 : 0;
    const buffer = Buffer.alloc(Math.min(1_048_576, Math.max(0, info.size - offset)));
    const { bytesRead } = await handle.read(buffer, 0, buffer.length, offset);
    const end = buffer.subarray(0, bytesRead).lastIndexOf(10) + 1;
    const lines = buffer.subarray(0, end).toString("utf8").split("\n");
    // Persist offsets only, never a partial native line that may contain secrets.
    return { cursor: { ino: info.ino, offset: offset + (end || (bytesRead === buffer.length && bytesRead === 1_048_576 ? bytesRead : 0)) }, events: lines.map(parseDroidRoutingLine).filter(Boolean) };

  } finally { await handle.close(); }
}
