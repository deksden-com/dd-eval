import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { errorRecord } from "../operation-errors.mjs";
import { processSnapshot } from "../process-snapshot.mjs";

const fail = (message, code) => { throw Object.assign(new Error(message), { code }); };
const read = async file => JSON.parse(await readFile(file, "utf8"));

/** Read retained resume worker records belonging to the specified EVAL root. */
export async function evalResumeWorkerStatus(root) {
  const directory = path.join(path.resolve(root), "control-resumes");
  let files;
  try { files = await readdir(directory); } catch (error) { if (error.code === "ENOENT") return []; throw error; }
  return Promise.all(files.filter(name => /^[a-f0-9]{64}\.json$/.test(name)).sort().map(async name => {
    const file = path.join(directory, name);
    try {
      const saved = await read(file);
      if (saved.schema_id !== "dd-eval/resume-worker@1" || saved.intent?.eval_root !== path.resolve(root)) fail("Continuation does not belong to this EVAL", "control_request_conflict");
      return { file, request_id: saved.intent.request_id, source_request_id: saved.intent.source_request_id, last_recorded_status: saved.status, last_observed_at: saved.updated_at ?? null, owner_pid: saved.owner_pid ?? null, process_id: saved.process_id ?? null, error: saved.error ?? null, result_state: saved.result?.state ?? null };
    } catch (error) { return { file, unavailable: true, error: errorRecord(error) }; }
  }));
}

/** Compare a recorded worker identity with the current process snapshot. */
export function workerLiveness(saved, processes) {
  if (!Number.isInteger(saved.owner_pid) || !saved.owner_started_at) return { state: "unknown", reason: "owner_identity_missing" };
  const physical = processes.find(item => item.pid === saved.owner_pid);
  return physical && !physical.zombie && physical.started === saved.owner_started_at
    ? { state: "alive" }
    : { state: "absent", reason: physical ? "owner_identity_changed_or_zombie" : "owner_disappeared", exit: saved.observed_exit ?? null };
}

/** Observe saved runner attempts without launching or changing them. */
export async function evalRunnerAttemptsStatus(root) {
  const directory = path.join(path.resolve(root), "runner-attempts");
  let names;
  try { names = await readdir(directory); } catch (error) { if (error.code === "ENOENT") return []; throw error; }
  let processes, unavailable;
  try { processes = await processSnapshot(); } catch (error) { unavailable = errorRecord(error); }
  return Promise.all(names.filter(name => /^[a-f0-9]{64}$/.test(name)).sort().map(async name => {
    const file = path.join(directory, name, "attempt.json");
    try {
      // Operator continuation keeps its original receipt path for compatibility.
      let saved;
      try { saved = await read(file); } catch (error) { if (error.code !== "ENOENT") throw error; saved = await read(path.join(root, "control-resumes", `${name}.json`)); }
      if (saved.intent?.eval_root !== path.resolve(root)) fail("Attempt belongs to another EVAL", "control_request_conflict");
      return { attempt: path.dirname(file), kind: saved.intent.kind ?? "control-resume", last_recorded_status: saved.status, last_observed_at: saved.updated_at ?? null, owner_pid: saved.owner_pid ?? null, owner_started_at: saved.owner_started_at ?? null, live_owner: unavailable ? { state: "unavailable", error: unavailable } : workerLiveness(saved, processes), error: saved.error ?? null, cleanup_error: saved.cleanup_error ?? null, result_state: saved.result?.state ?? null };
    } catch (error) { return { attempt: path.dirname(file), unavailable: true, error: errorRecord(error) }; }
  }));
}
