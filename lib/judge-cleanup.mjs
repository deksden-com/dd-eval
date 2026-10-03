import { createHash, randomUUID } from "node:crypto";
import { readRegularFile as readFile, readRegularFileSync as readFileSync } from "./regular-file.mjs";
import path from "node:path";
import { writeJsonAtomic } from "./runner-events.mjs";
import { withRunnerLock } from "./runner-lock.mjs";
import { errorRecord } from "./operation-errors.mjs";
import { hashJson } from "./runner-events.mjs";
import { inspectDaemonOperation } from "./daemon-operations.mjs";

const hash = bytes => createHash("sha256").update(bytes).digest("hex");
const failure = (code, message, details) => Object.assign(new Error(message), { code, details });
const parse = (bytes, file) => { try { return JSON.parse(bytes); } catch (error) { throw failure("judge_evidence_mismatch", "Judge lifecycle evidence is corrupt", { file, cause: errorRecord(error) }); } };
const read = async file => { try { return parse(await readFile(file, "utf8"), file); } catch (error) { if (error.code === "ENOENT") return null; throw error; } };
const daemonId = state => state?.daemon_id ?? state?.config?.daemonId;

function assertPhysicalState(state, identity, details = {}) {
  const shutdown = state?.shutdown, phases = shutdown?.required_phases;
  if (daemonId(state) !== identity || state.shutdown_state !== "clean" || state.active_tree !== false || !Number.isSafeInteger(state.pid) || state.pid < 1
    || shutdown?.schema_id !== "dd-flow/daemon-shutdown@1" || shutdown.daemon_id !== identity || shutdown.result?.clean !== true || !Array.isArray(phases) || phases.length < 3 || !phases.includes("tree") || !phases.includes("daemon_resource")
    || phases.some(phase => typeof phase !== "string" || shutdown.phases?.[phase] !== true)) throw failure("judge_cleanup_unconfirmed", "Judge has no complete physical/resource shutdown proof", details);
  try { process.kill(state.pid, 0); }
  catch (error) { if (error.code === "ESRCH") return; throw failure("judge_cleanup_unconfirmed", "Judge daemon exit cannot be observed", { ...details, observation_error: errorRecord(error) }); }
  throw failure("judge_cleanup_unconfirmed", "Judge daemon is still live", details);
}

export async function assertJudgeCleanup(root, verdict) {
  const file = path.join(root, "result.json"), bytes = await readFile(file);
  const saved = parse(bytes, file);
  if (hashJson(saved) !== hashJson(verdict)) throw failure("judge_evidence_mismatch", "Judge verdict differs from its retained result", { receipt_file: file });
  const cleanupBytes = await readFile(path.join(root, "cleanup.json")).catch(error => { if (error.code === "ENOENT") return null; throw error; });
  const cleanup = cleanupBytes ? parse(cleanupBytes, path.join(root, "cleanup.json")) : null;
  const state = await read(path.join(root, "daemon", "daemon.json"));
  const retained = { receipt_file: file, sha256: hash(bytes), verdict };
  if (typeof verdict.profile_id !== 'string' || !verdict.profile_id || typeof verdict.session_id !== 'string' || !verdict.session_id) throw failure('judge_evidence_mismatch', 'Judge verdict has no profile/Session binding', { retained_verdict: retained });
  if (verdict.evidence_sha256 && hashJson(await read(path.join(root, 'evidence.json'))) !== verdict.evidence_sha256) throw failure('judge_evidence_mismatch', 'Judge evidence no longer matches its verdict', { retained_verdict: retained });
  if (verdict.packet_sha256 && hashJson(await read(path.join(root, 'packet.json'))) !== verdict.packet_sha256) throw failure('judge_evidence_mismatch', 'Interaction Judge packet no longer matches its verdict', { retained_verdict: retained });
  if (!cleanup || cleanup.schema_id !== "dd-eval/judge-cleanup@1" || cleanup.verdict_sha256 !== retained.sha256 || cleanup.profile_id !== verdict.profile_id || cleanup.session_id !== verdict.session_id
    || cleanup.state_dir !== path.join(root, "daemon") || typeof cleanup.daemon_id !== "string" || typeof cleanup.stop_operation_id !== "string" || !cleanup.stop_operation_id.startsWith("judge-cleanup:") || !Number.isFinite(Date.parse(cleanup.observed_at))
    || cleanup.daemon_id !== daemonId(state)) throw failure("judge_cleanup_unconfirmed", "Judge cleanup receipt is missing or not bound to this verdict/incarnation", { retained_verdict: retained, cleanup });
  if (cleanup.status !== "settled") throw failure("judge_cleanup_unconfirmed", "Judge verdict is retained but cleanup is not settled", { retained_verdict: retained, cleanup });
  assertPhysicalState(state, cleanup.daemon_id, { retained_verdict: retained, cleanup });
  try { await assertStopProof(cleanup.state_dir, cleanup.stop_operation_id, cleanup.daemon_id); }
  catch (error) { error.details = { ...error.details, retained_verdict: retained, cleanup }; throw error; }
  return { ...cleanup, file: path.join(root, "cleanup.json"), sha256: hash(cleanupBytes) };
}

async function assertStopProof(stateDir, operationId, identity) {
  let operation;
  try { operation = await inspectDaemonOperation(stateDir, operationId); }
  catch (error) { throw failure(error instanceof SyntaxError ? 'judge_evidence_mismatch' : 'judge_cleanup_unconfirmed', 'Judge stop evidence cannot be read', { cause: errorRecord(error) }); }
  if (operation.operation !== 'daemon.stop' || operation.daemon_id !== identity || operation.state !== 'completed' || operation.result?.stopped !== true || operation.result.clean !== true || operation.result.shutdown_contract !== 'dd-flow/daemon-shutdown@1') throw failure('judge_cleanup_unconfirmed', 'Judge has no matching durable physical stop receipt');
}

/** Short read-only check inside the existing journal publication lock. */
export function assertJudgeCleanupCurrent(reference) {
  const state = parse(readFileSync(path.join(reference.state_dir, 'daemon.json')), path.join(reference.state_dir, 'daemon.json'));
  if (hash(readFileSync(reference.file)) !== reference.sha256 || hash(readFileSync(path.join(path.dirname(reference.state_dir), 'result.json'))) !== reference.verdict_sha256) throw failure('judge_cleanup_unconfirmed', 'Judge verdict/cleanup changed before publication');
  assertPhysicalState(state, reference.daemon_id);
  return true;
}

/** Cleanup is a separate control operation, never replay of a paid Judge Turn. */
export async function finishJudgeCleanup({ root, profileId, stop, primaryError }) {
  try { return await withRunnerLock(path.join(root, "cleanup-owner"), async () => {
    const file = path.join(root, "result.json");
    let bytes, verdict;
    try { bytes = await readFile(file); verdict = parse(bytes, file); } catch (error) { if (error.code !== "ENOENT") throw error; }
    const retained = verdict ? { receipt_file: file, sha256: hash(bytes), verdict } : null;
    if (primaryError && retained) primaryError.details = { ...primaryError.details, retained_verdict: retained };
    const stateDir = path.join(root, "daemon"), expected = await read(path.join(stateDir, "daemon.json"));
    const previous = await read(path.join(root, "cleanup.json"));
    if ((verdict && verdict.profile_id !== profileId) || (previous && (previous.profile_id !== profileId || (previous.daemon_id && previous.daemon_id !== daemonId(expected)) || (previous.verdict_sha256 && previous.verdict_sha256 !== retained?.sha256)))) throw failure("judge_evidence_mismatch", "Cleanup retry cannot replace another verdict/profile/incarnation", { retained_verdict: retained });
    if (verdict && previous?.status === "settled" && previous.verdict_sha256 === null && previous.session_id === null
      && previous.state_dir === stateDir && previous.daemon_id === daemonId(expected)) {
      // The original Turn completed but its verdict publication was lost.
      // Rebind already confirmed cleanup; do not send another stop to a dead daemon.
      assertPhysicalState(expected, previous.daemon_id);
      await assertStopProof(stateDir, previous.stop_operation_id, previous.daemon_id);
      await writeJsonAtomic(path.join(root, "cleanup.json"), { ...previous, verdict_sha256: retained.sha256, session_id: verdict.session_id, observed_at: new Date().toISOString() });
    }
    if (verdict && previous?.status === "settled") return await assertJudgeCleanup(root, verdict);
    // A lost ACK/companion publication can leave a completed stop and a dead
    // daemon. Reobserve that exact immutable ledger receipt, not a new RPC to
    // a closed bridge and never a replay of the original failed operation.
    if (verdict && previous?.status === "failed" && previous.verdict_sha256 === retained.sha256
      && previous.session_id === verdict.session_id && previous.state_dir === stateDir
      && previous.daemon_id === daemonId(expected) && previous.stop_operation_id?.startsWith("judge-cleanup:")) {
      let confirmed = false;
      try { assertPhysicalState(expected, previous.daemon_id); await assertStopProof(stateDir, previous.stop_operation_id, previous.daemon_id); confirmed = true; }
      catch (error) { if (error.code !== "judge_cleanup_unconfirmed") throw error; }
      if (confirmed) {
        const { error: priorError, ...receipt } = previous;
        void priorError;
        await writeJsonAtomic(path.join(root, "cleanup.json"), { ...receipt, status: "settled", observed_at: new Date().toISOString() });
        return await assertJudgeCleanup(root, verdict);
      }
    }
    const operationId = `judge-cleanup:${randomUUID()}`;
    let cleanupError, result;
    try {
      if (!expected || !daemonId(expected) || path.resolve(expected.config?.cwd ?? "") !== path.resolve(root)) throw failure("judge_cleanup_ownership_unknown", "Judge daemon ownership is unconfirmed");
      result = await stop(operationId);
      const current = await read(path.join(stateDir, "daemon.json"));
      if (daemonId(current) !== daemonId(expected) || result?.stopped !== true || result.clean !== true || current?.shutdown_state !== "clean" || current.active_tree === true) throw failure("judge_cleanup_unconfirmed", "Judge stop did not retain matching clean settlement");
      assertPhysicalState(current, daemonId(expected), { retained_verdict: retained });
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
