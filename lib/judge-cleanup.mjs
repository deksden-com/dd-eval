import { createHash, randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { readFileSync } from "node:fs";
import path from "node:path";
import { writeJsonAtomic } from "./runner-events.mjs";
import { withRunnerLock } from "./runner-lock.mjs";
import { errorRecord } from "./operation-errors.mjs";
import { hashJson } from "./runner-events.mjs";
import { inspectDaemonOperation } from "./daemon-operations.mjs";

const hash = bytes => createHash("sha256").update(bytes).digest("hex");
const failure = (code, message, details) => Object.assign(new Error(message), { code, details });
const read = async file => { try { return JSON.parse(await readFile(file, "utf8")); } catch (error) { if (error.code === "ENOENT") return null; throw error; } };
const daemonId = state => state?.daemon_id ?? state?.config?.daemonId;

export async function assertJudgeCleanup(root, verdict) {
  const file = path.join(root, "result.json"), bytes = await readFile(file);
  const saved = JSON.parse(bytes);
  if (hashJson(saved) !== hashJson(verdict)) throw failure("judge_evidence_mismatch", "Judge verdict differs from its retained result", { receipt_file: file });
  const cleanupBytes = await readFile(path.join(root, "cleanup.json")).catch(error => { if (error.code === "ENOENT") return null; throw error; });
  const cleanup = cleanupBytes ? JSON.parse(cleanupBytes) : null;
  const state = await read(path.join(root, "daemon", "daemon.json"));
  const retained = { receipt_file: file, sha256: hash(bytes), verdict };
  if (typeof verdict.profile_id !== 'string' || !verdict.profile_id || typeof verdict.session_id !== 'string' || !verdict.session_id) throw failure('judge_evidence_mismatch', 'Judge verdict has no profile/Session binding', { retained_verdict: retained });
  if (verdict.evidence_sha256 && hashJson(await read(path.join(root, 'evidence.json'))) !== verdict.evidence_sha256) throw failure('judge_evidence_mismatch', 'Judge evidence no longer matches its verdict', { retained_verdict: retained });
  if (verdict.packet_sha256 && hashJson(await read(path.join(root, 'packet.json'))) !== verdict.packet_sha256) throw failure('judge_evidence_mismatch', 'Interaction Judge packet no longer matches its verdict', { retained_verdict: retained });
  if (!cleanup || cleanup.schema_id !== "dd-eval/judge-cleanup@1" || cleanup.verdict_sha256 !== retained.sha256 || cleanup.profile_id !== verdict.profile_id || cleanup.session_id !== verdict.session_id
    || cleanup.state_dir !== path.join(root, "daemon") || typeof cleanup.daemon_id !== "string" || typeof cleanup.stop_operation_id !== "string" || !cleanup.stop_operation_id.startsWith("judge-cleanup:") || !Number.isFinite(Date.parse(cleanup.observed_at))
    || cleanup.daemon_id !== daemonId(state)) throw failure("judge_cleanup_unconfirmed", "Judge cleanup receipt is missing or not bound to this verdict/incarnation", { retained_verdict: retained, cleanup });
  if (cleanup.status !== "settled" || state?.shutdown_state !== "clean" || state.active_tree !== false || !Number.isSafeInteger(state.pid) || state.pid < 1 || state.shutdown?.schema_id !== "dd-flow/daemon-shutdown@1" || state.shutdown.daemon_id !== cleanup.daemon_id || !state.shutdown.phases?.tree || !state.shutdown.phases?.daemon_resource) throw failure("judge_cleanup_unconfirmed", "Judge verdict is retained but cleanup is not settled", { retained_verdict: retained, cleanup });
  await assertStopProof(cleanup.state_dir, cleanup.stop_operation_id, cleanup.daemon_id);
  if (state.pid) { try { process.kill(state.pid, 0); throw failure("judge_cleanup_unconfirmed", "Judge daemon is still live", { retained_verdict: retained, cleanup }); } catch (error) { if (error.code !== "ESRCH") throw error; } }
  return { ...cleanup, file: path.join(root, "cleanup.json"), sha256: hash(cleanupBytes) };
}

async function assertStopProof(stateDir, operationId, identity) {
  const operation = await inspectDaemonOperation(stateDir, operationId);
  if (operation.operation !== 'daemon.stop' || operation.daemon_id !== identity || operation.state !== 'completed' || operation.result?.stopped !== true || operation.result.clean !== true || operation.result.shutdown_contract !== 'dd-flow/daemon-shutdown@1') throw failure('judge_cleanup_unconfirmed', 'Judge has no matching durable physical stop receipt');
}

/** Short read-only check inside the existing journal publication lock. */
export function assertJudgeCleanupCurrent(reference) {
  const state = JSON.parse(readFileSync(path.join(reference.state_dir, 'daemon.json')));
  if (hash(readFileSync(reference.file)) !== reference.sha256 || daemonId(state) !== reference.daemon_id || state.shutdown_state !== 'clean' || state.active_tree !== false) throw failure('judge_cleanup_unconfirmed', 'Judge cleanup changed before publication');
  if (state.pid) { try { process.kill(state.pid, 0); throw failure('judge_cleanup_unconfirmed', 'Judge daemon is still live'); } catch (error) { if (error.code !== 'ESRCH') throw error; } }
  return true;
}

/** Cleanup is a separate control operation, never replay of a paid Judge Turn. */
export async function finishJudgeCleanup({ root, profileId, stop, primaryError }) {
  try { return await withRunnerLock(path.join(root, "cleanup-owner"), async () => {
    const file = path.join(root, "result.json");
    let bytes, verdict;
    try { bytes = await readFile(file); verdict = JSON.parse(bytes); } catch (error) { if (error.code !== "ENOENT") throw error; }
    const stateDir = path.join(root, "daemon"), expected = await read(path.join(stateDir, "daemon.json"));
    const previous = await read(path.join(root, "cleanup.json"));
    const retained = verdict ? { receipt_file: file, sha256: hash(bytes), verdict } : null;
    if ((verdict && verdict.profile_id !== profileId) || (previous && (previous.profile_id !== profileId || (previous.daemon_id && previous.daemon_id !== daemonId(expected)) || (previous.verdict_sha256 && previous.verdict_sha256 !== retained?.sha256)))) throw failure("judge_evidence_mismatch", "Cleanup retry cannot replace another verdict/profile/incarnation", { retained_verdict: retained });
    if (verdict && previous?.status === "settled") return await assertJudgeCleanup(root, verdict);
    const operationId = `judge-cleanup:${randomUUID()}`;
    let cleanupError, result;
    try {
      if (!expected || !daemonId(expected) || path.resolve(expected.config?.cwd ?? "") !== path.resolve(root)) throw failure("judge_cleanup_ownership_unknown", "Judge daemon ownership is unconfirmed");
      result = await stop(operationId);
      const current = await read(path.join(stateDir, "daemon.json"));
      if (daemonId(current) !== daemonId(expected) || result?.stopped !== true || result.clean !== true || current?.shutdown_state !== "clean" || current.active_tree === true) throw failure("judge_cleanup_unconfirmed", "Judge stop did not retain matching clean settlement");
      await assertStopProof(stateDir, operationId, daemonId(expected));
    } catch (error) { cleanupError = error; }
    const cleanup = { schema_id: "dd-eval/judge-cleanup@1", profile_id: profileId, session_id: verdict?.session_id ?? null, verdict_sha256: bytes ? hash(bytes) : null,
      daemon_id: daemonId(expected) ?? null, state_dir: stateDir, stop_operation_id: operationId, status: cleanupError ? "failed" : "settled", observed_at: new Date().toISOString(), ...(cleanupError ? { error: errorRecord(cleanupError) } : {}) };
    try { await writeJsonAtomic(path.join(root, "cleanup.json"), cleanup); }
    catch (storage) { if (cleanupError) cleanupError.cleanup_error = errorRecord(storage); else cleanupError = storage; }
    if (!cleanupError && verdict) {
      try { return await assertJudgeCleanup(root, verdict); } catch (error) { cleanupError = error; }
    }
    if (!cleanupError) return cleanup;
    if (primaryError) { primaryError.cleanup_error = errorRecord(cleanupError); if (retained) primaryError.details = { ...primaryError.details, retained_verdict: retained }; return cleanup; }
    throw failure("judge_cleanup_failed", "Judge verdict is retained but cleanup failed", { retained_verdict: retained, cleanup_error: errorRecord(cleanupError), cleanup });
  }); } catch (error) {
    if (!primaryError) throw error;
    primaryError.cleanup_error ??= errorRecord(error);
    return { status: "unknown", error: errorRecord(error) };
  }
}
