import { createHash } from "node:crypto";
import { lstat, open, realpath } from "node:fs/promises";
import { constants } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { snapshotTreeHash } from "./case-acceptance.mjs";
import { hashJson } from "./runner-events.mjs";

const inside = (root, file) => file === root || file.startsWith(root + path.sep);
const ensure = (value, message) => { if (!value) throw Object.assign(new Error(message), { code: "snapshot_binding_invalid" }); };
const digest = bytes => createHash("sha256").update(bytes).digest("hex");

export async function frozenFile(root, file) {
  const owner = await realpath(root), resolved = path.resolve(file);
  ensure(inside(owner, resolved), "Frozen file escaped its owner");
  for (let item = resolved; item !== owner; item = path.dirname(item)) ensure(!(await lstat(item)).isSymbolicLink(), "Frozen evidence traverses a symlink");
  ensure(inside(owner, await realpath(resolved)) && (await lstat(resolved)).isFile(), "Frozen evidence is not an owned regular file");
  const handle = await open(resolved, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
  try {
    const before = await handle.stat();
    ensure(before.isFile(), "Frozen evidence is not a regular file");
    const bytes = await handle.readFile(), after = await lstat(resolved);
    ensure(before.ino === after.ino && before.dev === after.dev && inside(owner, await realpath(resolved)), "Frozen evidence changed while reading");
    return { text: bytes.toString("utf8"), sha256: digest(bytes), path: path.relative(owner, resolved) };
  } finally { await handle.close(); }
}

/** Retained publication identity, not today's mutable recovery admission. */
export async function resolveBoundSnapshot({ evalRoot, execution, result, checkpoint, purpose }) {
  const root = await realpath(evalRoot);
  ensure(typeof execution === "string" && execution && !path.isAbsolute(execution) && !execution.split(/[\\/]/).includes(".."), "Invalid execution identity");
  ensure(["candidate", "recovery"].includes(purpose) && checkpoint && /^[a-f0-9]{64}$/.test(checkpoint.manifest_sha256 ?? ""), "Missing typed snapshot publication");
  const locator = checkpoint.snapshot ?? (checkpoint.manifest && path.dirname(checkpoint.manifest));
  ensure(path.isAbsolute(locator ?? "") && (!checkpoint.manifest || path.resolve(checkpoint.manifest) === path.join(path.resolve(locator), "snapshot.json")), "Invalid snapshot locator");
  const snapshot = await realpath(locator);
  ensure(path.resolve(locator) === snapshot, "Snapshot locator traverses a symlink");
  if (purpose === "candidate") ensure(inside(path.join(root, "executions", execution, "boundaries"), snapshot), "Candidate escaped owned boundary");
  const manifest = await frozenFile(snapshot, path.join(snapshot, "snapshot.json")), data = JSON.parse(manifest.text);
  ensure(manifest.sha256 === checkpoint.manifest_sha256 && data.schema_id === "dd-flow/eval-run-snapshot@5" && data.purpose === purpose
    && data.stage_entry === null && data.run_id === (result.lifecycle?.run_id ?? result.run_id ?? checkpoint.run_id), "Snapshot publication identity differs");
  ensure(data.workspace?.sha256 === snapshotTreeHash(path.join(snapshot, "workspace")) && data.runtime_sha256 === snapshotTreeHash(path.join(snapshot, "runtime")), "Snapshot payload checksum differs");
  if (purpose === "recovery") {
    const evalManifest = JSON.parse((await frozenFile(root, path.join(root, "manifest.json"))).text);
    if (evalManifest.runtime_recovery_home !== undefined) {
      ensure(path.isAbsolute(evalManifest.runtime_recovery_home) && inside(root, path.resolve(evalManifest.runtime_recovery_home)), "Recovery root is not EVAL-owned");
      const recoveryRoot = await realpath(evalManifest.runtime_recovery_home);
      ensure(recoveryRoot === path.resolve(evalManifest.runtime_recovery_home) && inside(root, recoveryRoot) && inside(recoveryRoot, snapshot), "Capture escaped frozen recovery root");
    }
    ensure(checkpoint.control_id && Number.isSafeInteger(checkpoint.generation) && checkpoint.generation > 0 && checkpoint.settlement?.settled === true
      && data.recovery_id === checkpoint.recovery_id && data.consistency === "sealed_writer_barrier_required", "Recovery publication is not settled and bound");
    const managed = JSON.parse((await frozenFile(root, path.join(root, "executions", execution, "managed-runtime.json"))).text);
    ensure(managed.schema_id === "dd-eval/managed-runtime@1" && managed.run_id === data.run_id && managed.runtime_root === data.dd_flow_home && managed.project_root === data.project_root, "Recovery belongs to another execution runtime");
    // Snapshot DB retains the original sealed guard even after the live RUN resumes.
    await frozenFile(snapshot, path.join(snapshot, "runtime", "db.sqlite"));
    const db = new DatabaseSync(path.join(snapshot, "runtime", "db.sqlite"), { readOnly: true });
    try {
      const guard = db.prepare("SELECT * FROM run_recovery_guards WHERE recovery_id = ? AND run_id = ?").get(checkpoint.recovery_id, data.run_id);
      const control = db.prepare("SELECT * FROM run_controls WHERE control_id = ? AND recovery_id = ? AND run_id = ?").get(checkpoint.control_id, checkpoint.recovery_id, data.run_id);
      ensure(guard?.status === "sealed" && guard.generation === checkpoint.generation && guard.project_id === data.project_id && JSON.parse(guard.settlement_json ?? "{}").settled === true
        && hashJson(JSON.parse(guard.settlement_json)) === hashJson(checkpoint.settlement)
        && control && control.project_id === data.project_id, "Recovery frozen control/generation differs");
    } finally { db.close(); }
  }
  return { snapshot, manifest: { ...manifest, path: "snapshot.json" }, data };
}

/** Only typed frozen candidate/execution fields grant snapshot selection. */
export function selectedSnapshots(candidate, evidence) {
  const selected = new Map();
  const add = (execution, result, checkpoint, purpose) => {
    const source = checkpoint?.snapshot ?? (checkpoint?.manifest && path.dirname(checkpoint.manifest));
    if (!source || !checkpoint.manifest_sha256) return;
    ensure(path.isAbsolute(source), "Snapshot publication locator is not absolute");
    const locator = path.resolve(source), prior = selected.get(locator);
    ensure(!prior || prior.checkpoint.manifest_sha256 === checkpoint.manifest_sha256 && prior.purpose === purpose && prior.execution === execution, "Snapshot locator has conflicting publications");
    if (prior && purpose === "recovery") ensure(["recovery_id", "control_id", "generation"].every(key => prior.checkpoint[key] === checkpoint[key])
      && hashJson(prior.checkpoint.settlement ?? null) === hashJson(checkpoint.settlement ?? null), "Snapshot locator has conflicting recovery bindings");
    selected.set(locator, { execution, result, checkpoint, purpose });
  };
  for (const result of candidate.executions ?? []) {
    add(result.execution, result, result.checkpoint, "candidate");
    add(result.execution, result, result.recovery, "recovery");
  }
  for (const result of evidence.executions ?? []) {
    add(result.execution, result, result.checkpoint ?? result.candidate, "candidate");
    add(result.execution, result, result.recovery, "recovery");
  }
  return [...selected.values()];
}
