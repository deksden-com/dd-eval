import path from "node:path";
import { mkdir, realpath, symlink, writeFile } from "node:fs/promises";
import { contained } from "../contained-path.mjs";
import { materializeStageSlice, semanticContextHash, validateStageContext } from "../entry-pack.mjs";
import { collectHitlSources } from "./sources.mjs";
import { parseJsonBytes } from "../json-file.mjs";
import { readRegularFile } from "../regular-file.mjs";
import { hashJson, sha256 } from "../runner-events.mjs";

const fail = (message, code) => { throw Object.assign(new Error(message), { code }); };

/** Render context paths against the retained qualification root. */
export function renderedQualificationContext(context, root) {
  return { ...context, schema_id: "dd-flow/stage-context@1", source_context_schema_id: context.schema_id,
    source_context_sha256: semanticContextHash(context),
    task_input: context.task_input.map(entry => ({ ...entry, path: path.resolve(root, entry.path) })),
    sources: (context.sources ?? []).map(entry => ({ ...entry, path: path.resolve(root, entry.path) })), roots: { project: root } };
}
/** Project grounding without transient source bytes. */
export function qualificationGrounding(collected, root) {
  const locator = value => path.relative(root, path.resolve(root, value));
  return {
    sources: collected.sources.map(({ text: _text, ...source }) => ({ ...source, origin: { ...source.origin, path: locator(source.origin.path) } })),
    directories: collected.directories.map(group => ({ ...group, path: locator(group.path) })),
    unavailable: collected.unavailable.map(item => ({ ...item, path: locator(item.path), origin: locator(item.origin) })),
    entries: collected.entries.map(({ bytes: _bytes, ...entry }) => entry)
  };
}
/** Validate a case-bound context and its complete grounding. */
export async function qualificationContext(caseRoot, item, stage) {
  if (item.context_file === undefined && item.context_sha256 === undefined) return null;
  if (typeof item.context_file !== "string" || !/^[a-f0-9]{64}$/.test(item.context_sha256 ?? "")) fail("HITL context reference and checksum must be declared together", "definition_qualification_invalid");
  const file = contained(caseRoot, item.context_file, "HITL context"), root = await realpath(caseRoot);
  const physical = await realpath(file);
  if (!physical.startsWith(`${root}${path.sep}`)) fail("HITL context escapes case", "definition_qualification_invalid");
  const bytes = await readRegularFile(physical);
  if (sha256(bytes) !== item.context_sha256) fail("HITL context checksum changed", "definition_qualification_invalid");
  let context, collected;
  try {
    context = validateStageContext(parseJsonBytes(bytes, file), stage);
    if ([...(context.sources ?? []), ...context.task_input].some(entry => (entry.root ?? "project") !== "project")) fail("Qualification context sources must reference immutable case inputs", "definition_qualification_invalid");
    collected = await collectHitlSources(renderedQualificationContext(context, root), { includeBytes: true });
  } catch (error) {
    fail(`Invalid qualification stage context: ${error.message}`, "definition_qualification_invalid");
  }
  return { context, entries: collected.entries,
    binding: { context_file: item.context_file, context_sha256: item.context_sha256, ...qualificationGrounding(collected, root) } };
}
/** Materialize and revalidate an immutable qualification context snapshot. */
export async function materializeQualificationContext({ qualified, item, caseRoot, output }) {
  const stage = item.stage ?? qualified.corpus.stage;
  const current = await qualificationContext(caseRoot, item, stage), retained = qualified.contexts[item.id];
  if (hashJson(current?.binding ?? null) !== hashJson(retained?.binding ?? null)) fail("Qualification context/source bytes changed", "definition_qualification_invalid");
  if (!current) return null;
  const snapshot = path.join(path.dirname(output), "inputs", sha256(item.id));
  await mkdir(snapshot, { recursive: true });
  for (const source of [...current.entries.filter(entry => !entry.alias_of), ...current.entries.filter(entry => entry.alias_of)]) {
    const target = contained(snapshot, source.path, "qualification snapshot");
    if (source.type === "directory") { await mkdir(target, { recursive: true }); continue; }
    await mkdir(path.dirname(target), { recursive: true });
    if (source.alias_of) {
      if (source.alias_of.root !== "project") fail("Qualification alias has an undeclared target namespace", "definition_qualification_invalid");
      const aliasTarget = contained(snapshot, source.alias_of.path, "qualification alias");
      try { await symlink(path.relative(path.dirname(target), aliasTarget), target); }
      catch (error) { if (error.code !== "EEXIST") throw error; }
      continue;
    }
    try { await writeFile(target, source.bytes, { mode: 0o444, flag: "wx" }); }
    catch (error) {
      if (error.code !== "EEXIST") throw error;
      // The common bounded collector below verifies existing bytes and membership.
    }
  }
  const rendered = renderedQualificationContext(current.context, snapshot);
  try {
    const collected = await collectHitlSources(rendered);
    if (hashJson(qualificationGrounding(collected, snapshot)) !== hashJson(Object.fromEntries(["sources", "directories", "unavailable", "entries"].map(key => [key, current.binding[key]]))))
      fail("Qualification snapshot membership or grounding changed", "definition_qualification_invalid");
  } catch (error) { fail(`Invalid qualification snapshot: ${error.message}`, "definition_qualification_invalid"); }
  return await materializeStageSlice({ blueprint: { stages: { [stage]: current.context } }, stage, roots: { project: snapshot }, output });
}
