import { createHash } from "node:crypto";
import { lstat, readFile, realpath, stat } from "node:fs/promises";
import path from "node:path";
import { matrixCanonical } from "../verification-matrix-schema.mjs";
import { withFrozenRuntimeDatabase } from "../recovery/recovery-safety.mjs";

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

const ensure = (condition, message) => { if (!condition) throw new Error(message); };
const parseJson = file => JSON.parse(file.text);

/** Compare accepted intent sources against the frozen RUN database authority. */
export async function validateFrozenAcceptedIntent(snapshot, data, index, matrix) {
  const contract = "dd-flow/accepted-intent@1", marker = index.accepted_intent_contract;
  ensure(marker === undefined || marker === contract, "unsupported accepted intent contract");
  const database = await optionalFile(snapshot, "runtime/db.sqlite");
  if (!database) { ensure(marker === undefined, "accepted intent has no frozen database authority"); return null; }
  let marked = false;
  await withFrozenRuntimeDatabase(snapshot, db => {
    const columns = db.prepare("PRAGMA table_info(runs)").all();
    if (!columns.some(column => column.name === "index_json")) { ensure(marker === undefined, "accepted intent has no frozen RUN authority"); return; }
    const run = db.prepare("SELECT index_json FROM runs WHERE project_id = ? AND id = ?").get(data.project_id, data.run_id);
    const saved = run && JSON.parse(run.index_json).accepted_intent_contract;
    ensure(saved === marker, "accepted intent contract differs from frozen RUN authority");
    if (marker === undefined) return;
    marked = true;
    const scope = [data.project_id, data.run_id];
    const answers = db.prepare("SELECT id, payload_json FROM audit_events WHERE project_id = ? AND event_type = 'flow_run.stage_resumed' AND json_extract(payload_json, '$.run_id') = ? ORDER BY id LIMIT 256").all(...scope);
    const entries = [{ role: "accepted_intake", suffix: "/intake/discussion.md" }, ...answers.flatMap(row => {
      const value = JSON.parse(row.payload_json), identity = `accepted_hitl:${String(row.id).padStart(12, "0")}:${value.pause_id}`;
      ensure(typeof value.answer_path === "string" && path.isAbsolute(value.answer_path) && typeof value.pause_id === "string", "accepted HITL answer authority is invalid");
      // Established engine pairing: the retained question Stage packet is the
      // question.md beside this exact delivered answer, never inferred prose.
      return [{ role: `${identity}:0-question`, file: path.join(path.dirname(value.answer_path), "question.md") }, { role: `${identity}:1-answer`, file: value.answer_path }];
    })];
    ensure(entries.length <= 256, "accepted intent source inventory exceeds bound");
    const expected = [];
    let total = 0;
    for (const entry of entries) {
      const rows = entry.suffix
        ? db.prepare("SELECT payload_json FROM audit_events WHERE project_id = ? AND event_type = 'flow_run.stage_packet' AND json_extract(payload_json, '$.run_id') = ? AND substr(json_extract(payload_json, '$.file'), -length(?)) = ? LIMIT 33").all(...scope, entry.suffix, entry.suffix)
        : db.prepare("SELECT payload_json FROM audit_events WHERE project_id = ? AND event_type = 'flow_run.stage_packet' AND json_extract(payload_json, '$.run_id') = ? AND json_extract(payload_json, '$.file') = ? LIMIT 33").all(...scope, entry.file);
      ensure(rows.length > 0 && rows.length <= 32 && rows.every(row => Buffer.byteLength(row.payload_json) <= 2 * 1024 * 1024), "accepted intent Stage packet custody is missing or unbounded");
      const packets = rows.map(row => JSON.parse(row.payload_json)), bytes = Buffer.from(packets[0].base64, "base64"), sha256 = digest(bytes);
      total += bytes.length;
      ensure(bytes.length > 0 && bytes.length <= 1024 * 1024 && total <= 16 * 1024 * 1024 && packets.every(packet => packet.sha256 === sha256 && packet.base64 === bytes.toString("base64")), "accepted intent Stage packet bytes differ");
      expected.push({ role: entry.role, root: "run", path: `07-merge/verification/sources/${sha256}/accepted-input.md`, sha256 });
    }
    const actual = matrix.sources.filter(source => source.role === "accepted_intake" || source.role.startsWith("accepted_hitl:"));
    const ordered = sources => sources.toSorted((a, b) => a.role < b.role ? -1 : a.role > b.role ? 1 : 0);
    ensure(matrixCanonical(ordered(actual)) === matrixCanonical(ordered(expected)), "accepted intent source inventory differs from delivered frozen authority");
  });
  return marked ? database : null;
}


/** Coverage comes from accepted PLAN and retained policy, never the gate it checks. */

/** Verify receipt scope and retained outcome against frozen database authority. */
export async function validateFrozenReceiptScope(snapshot, data, receipt, relative = null) {
  ensure([undefined, null, "check_inputs"].includes(receipt.fingerprint_scope), "unsupported check fingerprint scope");
  const database = await optionalFile(snapshot, "runtime/db.sqlite");
  if (!database) {
    ensure(receipt.fingerprint_scope == null, "scoped receipt has no frozen database authority");
    return null;
  }
  let scopedDatabase = false, executionFailures = receipt.execution_failures ?? [];
  await withFrozenRuntimeDatabase(snapshot, db => {
    scopedDatabase = db.prepare("PRAGMA table_info(check_receipts)").all().some(column => column.name === "fingerprint_scope");
    if (!scopedDatabase) {
      ensure(receipt.fingerprint_scope == null, "scoped receipt has no persisted scope authority");
      return;
    }
    const saved = db.prepare("SELECT * FROM check_receipts WHERE id = ? AND project_id = ? AND run_id = ?").get(receipt.id, data.project_id, data.run_id);
    ensure(saved && (saved.fingerprint_scope ?? null) === (receipt.fingerprint_scope ?? null), "check fingerprint scope differs from frozen authority");
    ensure(["work_id", "scope", "gate", "command", "input_hash", "verification_epoch", "status", "exit_code", "workspace_fingerprint", "before_fingerprint", "after_fingerprint", "profile_hash", "started_at", "finished_at"].every(key => saved[key] === receipt[key]), "scoped receipt differs from frozen execution authority");
    if (receipt.fingerprint_scope === "check_inputs") ensure(saved.execution_contract_hash === receipt.execution_contract_hash
      && matrixCanonical(JSON.parse(saved.input_manifest_json ?? "null")) === matrixCanonical(receipt.input_manifest ?? null)
      && matrixCanonical(JSON.parse(saved.artifacts_json ?? "[]")) === matrixCanonical(receipt.artifacts ?? []), "scoped input manifest, artifacts or failures differ from frozen authority");
    if (receipt.fingerprint_scope === "check_inputs") {
      executionFailures = JSON.parse(saved.execution_failures_json ?? "[]");
      ensure(Array.isArray(executionFailures) && executionFailures.every(failure => failure && typeof failure.code === "string" && typeof failure.message === "string"), "scoped execution failures are invalid SQL authority");
    }
  });
  if (!scopedDatabase) return null;
  if (receipt.fingerprint_scope === "check_inputs" && (receipt.artifacts?.some(artifact => artifact.path === "engine-outcome.json") || receipt.required_artifacts?.includes("engine-outcome.json"))) {
    ensure(typeof relative === "string", "scoped engine outcome has no frozen owning receipt path");
    const claimed = receipt.artifacts?.find(artifact => artifact.path === "engine-outcome.json");
    const file = await ownedFile(snapshot, path.posix.join(path.posix.dirname(relative.replaceAll("\\", "/")), "artifacts/engine-outcome.json"));
    ensure(claimed && claimed.sha256 === file.sha256, "scoped engine outcome differs from retained artifact authority");
    const outcome = parseJson(file);
    ensure(outcome.schema_id === "dd-flow/check-execution-outcome@1"
      && ["id", "command", "input_hash", "verification_epoch", "fingerprint_scope"].every(key => outcome[key] === receipt[key])
      && (outcome.execution_contract_hash ?? null) === (receipt.execution_contract_hash ?? null)
      && matrixCanonical(outcome.input_manifest ?? null) === matrixCanonical(receipt.input_manifest ?? null)
      && matrixCanonical(outcome.execution_failures) === matrixCanonical(executionFailures), "scoped engine outcome conflicts with SQL execution authority");
  }
  // Mutable receipt annotations cannot replace (or poison) the retained outcome.
  return { ...database, receipt: { ...receipt, execution_failures: executionFailures } };
}

/** Verify the frozen input manifest referenced by a scoped receipt. */
export async function validateScopedInputManifest(snapshot, relative, receipt) {
  if (receipt.fingerprint_scope == null) return null;
  const manifest = receipt.input_manifest;
  ensure(manifest?.path === "inputs-before.json" && /^[a-f0-9]{64}$/.test(manifest.sha256 ?? "")
    && typeof manifest.truncated === "boolean", "scoped input manifest binding is invalid");
  const file = await ownedFile(snapshot, path.posix.join(path.posix.dirname(relative.replaceAll("\\", "/")), manifest.path));
  ensure(file.sha256 === manifest.sha256 && Buffer.byteLength(file.text) <= 1024 * 1024, "scoped input manifest is missing or changed");
  return file;
}
