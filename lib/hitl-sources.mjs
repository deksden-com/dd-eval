import { createHash } from "node:crypto";
import { isUtf8 } from "node:buffer";
import { constants } from "node:fs";
import { lstat, open, readdir, realpath, stat } from "node:fs/promises";
import path from "node:path";

const hash = bytes => createHash("sha256").update(bytes).digest("hex");
const object = value => value !== null && typeof value === "object" && !Array.isArray(value);
const nonempty = value => typeof value === "string" && value.trim().length > 0;
const exact = (value, keys) => object(value) && Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key));
const inside = (root, file) => file === root || file.startsWith(root + path.sep);
const namespaces = ["project", "workspace", "run", "eval"];
const privateNames = new Set([".git", "node_modules", ".zcode", ".codex", ".codex-cpa", ".grok", ".gemini", ".antigravity"]);
const knownText = new Set([".md", ".json", ".jsonl", ".txt", ".log", ".yaml", ".yml"]);
const maxFile = 1024 * 1024;
const forbidden = file => file.split(/[\\/]/).some(part => privateNames.has(part));
const relative = value => nonempty(value) && !path.isAbsolute(value) && !value.includes("\\") && value.split("/").every(part => part !== ".." && part !== "." && part !== "");
const fingerprint = value => [value.dev, value.ino, value.size, value.mtimeMs, value.ctimeMs];
const equal = (left, right) => JSON.stringify(left) === JSON.stringify(right);
function fail(message, code = "judge_context_invalid") { throw Object.assign(new Error(message), { code }); }

function declarations(context, code = "judge_context_invalid") {
  if (context == null) return [];
  if (!object(context) || (context.roots !== undefined && !object(context.roots))) fail("Invalid HITL declared context", code);
  const output = [];
  for (const collection of ["sources", "task_input"]) {
    const entries = context[collection] ?? [];
    if (!Array.isArray(entries)) fail("Invalid HITL declared sources", code);
    for (const [index, entry] of entries.entries()) {
      if (!object(entry) || (entry.required !== undefined && typeof entry.required !== "boolean") || (entry.optional !== undefined && typeof entry.optional !== "boolean")
        || (entry.required !== undefined && entry.optional !== undefined && entry.required === entry.optional)
        || (entry.sha256 !== undefined && (typeof entry.sha256 !== "string" || !/^[a-f0-9]{64}$/.test(entry.sha256)))) fail("Invalid HITL source declaration", code);
      const root = entry.root ?? "project", role = entry.role ?? (collection === "sources" ? "source" : "task_input");
      const base = context.roots?.[root];
      if (!namespaces.includes(root) || !nonempty(base) || !path.isAbsolute(base) || !nonempty(entry.path) || entry.path.includes("\\") || !nonempty(role)
        || !inside(path.resolve(base), path.resolve(base, entry.path)) || path.resolve(base, entry.path) === path.resolve(base)
        || forbidden(base) || forbidden(entry.path)) fail("HITL source lacks a safe declared namespace/locator/role", code);
      output.push({ collection, index, root, path: entry.path, role, base: path.resolve(base), entry });
    }
  }
  return output;
}

// Through one descriptor, including cap+1 growth detection; no unbounded readFile allocation.
async function boundedRead(file, before) {
  const handle = await open(file, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
  try {
    const initial = await handle.stat();
    if (!initial.isFile()) fail(`HITL source is not a regular file: ${file}`);
    if (initial.size > maxFile) fail(`HITL source exceeds 1 MiB: ${file}`);
    if (before && !equal(fingerprint(initial), fingerprint(before))) fail(`HITL source changed before read: ${file}`);
    const buffer = Buffer.alloc(maxFile + 1);
    let length = 0;
    while (length < buffer.length) {
      const read = await handle.read(buffer, length, buffer.length - length, length);
      if (!read.bytesRead) break;
      length += read.bytesRead;
    }
    if (length > maxFile) fail(`HITL source exceeds 1 MiB during read: ${file}`);
    const after = await handle.stat();
    if (!equal(fingerprint(initial), fingerprint(after)) || after.size !== length) fail(`HITL source changed during read: ${file}`);
    return buffer.subarray(0, length);
  } finally { await handle.close(); }
}

/** Collect only explicitly declared files/subtrees. No provider-home traversal. */
async function collectSources(subjectContext, { includeBytes = false } = {}) {
  const declared = declarations(subjectContext);
  const sources = [], directories = [], unavailable = [], entries = [];
  const physicalSources = new Map(), retainedEntries = new Map(), physicalEntries = new Map(), realRoots = new Map(), directoryTexts = new Set();
  let textBytes = 0, enumerated = 0;
  const retain = (root, locator, type, bytes, physical) => {
    const base = subjectContext.roots[root], normalized = path.relative(path.resolve(base), path.resolve(base, locator));
    const key = `${root}:${normalized}`, entry = { root, path: normalized, type, ...(bytes ? { sha256: hash(bytes), ...(includeBytes ? { bytes } : {}) } : {}) };
    if (retainedEntries.has(key)) {
      const prior = retainedEntries.get(key);
      if (prior.type !== entry.type || prior.sha256 !== entry.sha256) fail(`HITL source changed during collection: ${locator}`);
    } else {
      if (type === "file") {
        const aliases = physicalEntries.get(physical) ?? [];
        aliases.push(entry); physicalEntries.set(physical, aliases);
      }
      retainedEntries.set(key, entry); entries.push(entry);
    }
  };
  for (const declaration of declared) {
    const locator = path.resolve(declaration.base, declaration.path);
    let physical, root, metadata;
    try {
      root = await realpath(declaration.base);
      realRoots.set(declaration.root, root);
      physical = await realpath(locator);
      if (!inside(root, physical) || forbidden(physical)) fail(`HITL source escapes or enters a private target: ${declaration.path}`);
      metadata = await lstat(locator);
    } catch (error) {
      if (error.code === "ENOENT" && (declaration.entry.optional === true || declaration.entry.required === false)) {
        unavailable.push({ role: declaration.role, origin: declaration.path, declaration: { collection: declaration.collection, index: declaration.index }, root: declaration.root, path: declaration.path });
        continue;
      }
      fail(`HITL source cannot be retained: ${error.message}`);
    }
    const actual = metadata.isSymbolicLink() ? await stat(physical) : metadata;
    if (!actual.isFile() && !actual.isDirectory()) fail(`HITL source is not a regular file or directory: ${declaration.path}`);
    const directory = actual.isDirectory();
    if (directory && (metadata.isSymbolicLink() || physical === root || declaration.entry.sha256 !== undefined)) fail(`HITL directory must be a concrete unhashed subtree: ${declaration.path}`);
    const group = directory ? { declaration: { collection: declaration.collection, index: declaration.index }, root: declaration.root, path: declaration.path, role: declaration.role, files: [], exclusions: [] } : null;
    const enumerate = async () => {
      const result = [];
      const walk = async (file, child, depth) => {
        if (++enumerated > 4096) fail(`HITL directory exceeds 4096 entries: ${declaration.path}`);
        if (depth > 32) fail(`HITL directory exceeds depth 32: ${declaration.path}`);
        if (forbidden(file)) fail(`HITL directory includes a private/admin locator: ${child}`);
        const resolved = await realpath(file), info = await lstat(file);
        if (!inside(physical, resolved) || forbidden(resolved)) fail(`HITL child escapes declared subtree: ${child}`);
        const actualInfo = info.isSymbolicLink() ? await stat(resolved) : info;
        if (actualInfo.isDirectory()) {
          if (info.isSymbolicLink()) fail(`HITL directory symlink is not supported: ${child}`);
          result.push({ child, type: "directory", physical: resolved, info: fingerprint(actualInfo) });
          for (const name of (await readdir(file)).sort()) await walk(path.join(file, name), child ? `${child}/${name}` : name, depth + 1);
        } else if (actualInfo.isFile()) result.push({ child, type: "file", physical: resolved, info: fingerprint(actualInfo), metadata: actualInfo });
        else fail(`HITL child is not a regular file: ${child}`);
      };
      await walk(locator, "", 0);
      result.sort((a, b) => a.child < b.child ? -1 : a.child > b.child ? 1 : 0);
      return result;
    };
    let children = directory ? await enumerate() : [{ child: "", type: "file", physical, metadata: actual }];
    for (const child of children) {
      const childLocator = child.child ? `${declaration.path}/${child.child}` : declaration.path;
      if (child.type === "directory") { retain(declaration.root, childLocator, "directory"); continue; }
      // Recheck containment immediately before opening each child.
      const current = await realpath(path.resolve(declaration.base, childLocator));
      if (current !== child.physical || !inside(directory ? physical : root, current) || forbidden(current)) fail(`HITL source target changed: ${childLocator}`);
      const bytes = await boundedRead(current, child.metadata);
      if (await realpath(path.resolve(declaration.base, childLocator)) !== current || !equal(fingerprint(await stat(current)), fingerprint(child.metadata))) fail(`HITL source changed after read: ${childLocator}`);
      retain(declaration.root, childLocator, "file", bytes, current);
      if (!directory && declaration.entry.sha256 !== undefined && declaration.entry.sha256 !== hash(bytes)) fail(`HITL source checksum changed: ${childLocator}`);
      const text = isUtf8(bytes) && !bytes.includes(0);
      if (!text) {
        if (!directory || knownText.has(path.extname(child.child).toLowerCase())) fail(`HITL textual source is not valid UTF-8 or contains NUL: ${childLocator}`);
        group.exclusions.push({ path: child.child, reason: "non_text" });
        continue;
      }
      if (directory && !directoryTexts.has(current)) {
        directoryTexts.add(current); textBytes += bytes.length;
        if (directoryTexts.size > 1024 || textBytes > 8 * 1024 * 1024) fail(`HITL directory text budget exceeded: ${childLocator}`);
      }
      const contributor = { collection: declaration.collection, index: declaration.index, child_path: child.child };
      let source = physicalSources.get(current);
      if (source) {
        if (source.sha256 !== hash(bytes)) fail(`HITL source changed during snapshot: ${childLocator}`);
        source.origin.contributors.push(contributor);
        if (!source.origin.roles.includes(declaration.role)) source.origin.roles.push(declaration.role);
      } else {
        source = { id: `source-${sources.length}`, origin: { root: declaration.root, path: childLocator, roles: [declaration.role], contributors: [contributor] }, sha256: hash(bytes), text: bytes.toString("utf8") };
        physicalSources.set(current, source); sources.push(source);
      }
      if (group) group.files.push({ path: child.child, source_id: source.id });
    }
    if (directory) {
      // ponytail: detectable drift only, not an atomic multi-file snapshot; use the accepted Stage boundary.
      const before = children.map(({ metadata: _metadata, ...value }) => value);
      const savedCount = enumerated;
      enumerated -= children.length;
      const after = (await enumerate()).map(({ metadata: _metadata, ...value }) => value);
      enumerated = savedCount; // Limit membership, not the verification pass twice.
      if (!equal(before, after)) fail(`HITL directory changed during snapshot: ${declaration.path}`);
      group.files.sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0);
      group.exclusions.sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0);
      directories.push(group);
    }
  }
  // Prefer a captured canonical locator so owned aliases cannot escape an implicit subtree.
  for (const [physical, aliases] of physicalEntries) {
    const representative = aliases.find(entry => path.resolve(realRoots.get(entry.root), entry.path) === physical) ?? aliases[0];
    for (const entry of aliases) if (entry !== representative) entry.alias_of = { root: representative.root, path: representative.path };
  }
  return { sources, directories, unavailable, entries };
}

export async function collectHitlSources(subjectContext, options = {}) {
  try { return await collectSources(subjectContext, options); }
  catch (error) {
    if (error.code === "judge_context_invalid") throw error;
    fail(`HITL source cannot be retained: ${error.message}`);
  }
}

/** Frozen manifest validation is pure: never reopen mutable source paths. */
export function validateHitlSources(packet) {
  const code = "judge_result_invalid";
  if (!object(packet) || !Array.isArray(packet.grounding_sources)) fail("Grounding sources are missing", code);
  const declared = declarations(packet.subject_context, code);
  const declarationsById = new Map(declared.map(item => [`${item.collection}:${item.index}`, item]));
  const usedDeclarations = new Set(), directories = new Map(), unavailable = new Set(), sources = new Map();
  let manifestEntries = 0;
  const declarationKey = value => {
    if (!exact(value, ["collection", "index"]) || !["sources", "task_input"].includes(value.collection) || !Number.isSafeInteger(value.index) || value.index < 0) fail("Invalid source declaration identity", code);
    const key = `${value.collection}:${value.index}`;
    if (!declarationsById.has(key)) fail("Unknown source declaration", code);
    return key;
  };
  if (!Array.isArray(packet.directory_sources)) fail("Directory manifests are missing", code);
  for (const group of packet.directory_sources) {
    if (!exact(group, ["declaration", "root", "path", "role", "files", "exclusions"]) || !Array.isArray(group.files) || !Array.isArray(group.exclusions)) fail("Invalid directory manifest", code);
    const key = declarationKey(group.declaration), declaration = declarationsById.get(key);
    if (directories.has(key) || group.root !== declaration.root || group.path !== declaration.path || group.role !== declaration.role || declaration.entry.sha256 !== undefined) fail("Directory declaration differs", code);
    const locators = new Set();
    const membership = new Set([""]);
    for (const [array, keys] of [[group.files, ["path", "source_id"]], [group.exclusions, ["path", "reason"]]]) {
      let previous = null;
      for (const item of array) {
        if (!exact(item, keys) || !relative(item.path) || forbidden(item.path) || locators.has(item.path) || (previous !== null && previous >= item.path)
          || (keys.includes("source_id") ? !/^source-\d+$/.test(item.source_id) : item.reason !== "non_text" || knownText.has(path.extname(item.path).toLowerCase()))) fail("Directory membership is invalid", code);
        const parts = item.path.split("/");
        if (parts.length > 32) fail("Directory membership exceeds depth 32", code);
        for (let i = 1; i <= parts.length; i++) membership.add(parts.slice(0, i).join("/"));
        locators.add(item.path); previous = item.path;
      }
    }
    for (const locator of locators) {
      const parts = locator.split("/");
      if (parts.slice(0, -1).some((_, i) => locators.has(parts.slice(0, i + 1).join("/")))) fail("Directory file membership conflicts with an ancestor", code);
    }
    manifestEntries += membership.size;
    if (manifestEntries > 4096) fail("Directory membership exceeds 4096 entries", code);
    directories.set(key, group); usedDeclarations.add(key);
  }
  if (packet.unavailable_sources !== undefined && !Array.isArray(packet.unavailable_sources)) fail("Invalid unavailable sources", code);
  for (const item of packet.unavailable_sources ?? []) {
    if (!exact(item, ["role", "origin", "declaration", "root", "path"])) fail("Invalid unavailable source", code);
    const key = declarationKey(item.declaration), declaration = declarationsById.get(key);
    if (usedDeclarations.has(key) || unavailable.has(key) || item.root !== declaration.root || item.path !== declaration.path || item.origin !== declaration.path || item.role !== declaration.role
      || !(declaration.entry.optional === true || declaration.entry.required === false)) fail("Unavailable source was not optional", code);
    unavailable.add(key); usedDeclarations.add(key);
  }
  let index = 0, textBytes = 0, directoryTextCount = 0;
  for (const source of packet.grounding_sources ?? []) {
    if (!/^source-/.test(source.id)) continue;
    if (source.id !== `source-${index++}` || !exact(source, ["id", "origin", "sha256", "text"]) || typeof source.text !== "string" || source.sha256 !== hash(source.text)
      || !exact(source.origin, ["root", "path", "roles", "contributors"]) || !Array.isArray(source.origin.roles) || !Array.isArray(source.origin.contributors) || !source.origin.contributors.length) fail("Invalid source provenance", code);
    if (source.text.includes("\0") || Buffer.from(source.text).toString("utf8") !== source.text || Buffer.byteLength(source.text) > maxFile) fail("Invalid textual source bytes", code);
    const roles = [], contributors = new Set();
    let first, directoryText = false;
    for (const contributor of source.origin.contributors) {
      if (!exact(contributor, ["collection", "index", "child_path"]) || typeof contributor.child_path !== "string") fail("Invalid source contributor", code);
      const key = declarationKey({ collection: contributor.collection, index: contributor.index }), declaration = declarationsById.get(key);
      const identity = `${key}:${contributor.child_path}`;
      if (contributors.has(identity) || unavailable.has(key)) fail("Duplicate/unavailable source contributor", code);
      contributors.add(identity);
      const group = directories.get(key);
      if (group) {
        if (!relative(contributor.child_path) || !group.files.some(file => file.path === contributor.child_path && file.source_id === source.id)) fail("Directory contributor lacks membership", code);
        directoryText = true;
      } else if (contributor.child_path !== "" || usedDeclarations.has(key) || (declaration.entry.sha256 !== undefined && declaration.entry.sha256 !== source.sha256)) fail("Direct source contributor differs", code);
      usedDeclarations.add(key);
      if (!roles.includes(declaration.role)) roles.push(declaration.role);
      first ??= { root: declaration.root, path: contributor.child_path ? `${declaration.path}/${contributor.child_path}` : declaration.path };
    }
    if (source.origin.root !== first.root || source.origin.path !== first.path || forbidden(source.origin.path) || !equal(source.origin.roles, roles)) fail("Source origin/role union differs from contributors", code);
    if (directoryText) { directoryTextCount++; textBytes += Buffer.byteLength(source.text); }
    sources.set(source.id, source);
  }
  if (directoryTextCount > 1024 || textBytes > 8 * 1024 * 1024) fail("Directory source text budget exceeded", code);
  for (const [key, group] of directories) for (const item of group.files) {
    const source = sources.get(item.source_id);
    if (!source?.origin.contributors.some(value => `${value.collection}:${value.index}` === key && value.child_path === item.path)) fail("Directory member lacks source provenance", code);
  }
  if (declared.some(item => !usedDeclarations.has(`${item.collection}:${item.index}`))) fail("Declared source omitted from frozen grounding", code);
  return packet;
}
