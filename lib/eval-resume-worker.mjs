import { spawn } from "node:child_process";
import { mkdir, readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { setTimeout as delay } from "node:timers/promises";
import { once } from "node:events";
import { assertControlResumeSource, runnerControlResume, runnerResume, validateControlResumeInput } from "./runner.mjs";
import { hashJson, readEvents, sha256, writeJsonAtomic } from "./runner-events.mjs";
import { withRunnerLock } from "./runner-lock.mjs";
import { commandJson } from "./process-json.mjs";
import { errorRecord, isObservationLoss, reportedError } from "./operation-errors.mjs";
import { processSnapshot } from "./process-snapshot.mjs";

const entrypoint = fileURLToPath(import.meta.url);
const fail = (message, code) => { throw Object.assign(new Error(message), { code }); };
export const evalResumeWorkerFile = (root, requestId) => path.join(path.resolve(root), "control-resumes", `${sha256(requestId)}.json`);
const read = async file => JSON.parse(await readFile(file, "utf8"));

/** Accept experiment continuation outside the captured journal. The child owns
 * observation; a caller's wait budget never owns or cancels productive work. */
export async function requestEvalResume({ evalRoot, requestId, fromRequestId, waitMs = 0 }) {
  validateControlResumeInput({ requestId, waitMs });
  const deadline = performance.now() + (waitMs || 60_000), signal = AbortSignal.timeout(waitMs || 60_000), progress = { accepted: false };
  try { return await acceptAndObserve({ evalRoot, requestId, fromRequestId, waitMs }, signal, progress); }
  catch (error) {
    if (!(signal.aborted && ["AbortError", "TimeoutError"].includes(error.name)) && !(error.code === "runner_lock_timeout" && performance.now() >= deadline)) throw error;
    return { root: path.resolve(evalRoot), request_id: requestId, source_request_id: fromRequestId, ok: progress.accepted, accepted: progress.accepted ? true : null, runtime_accepted: null,
      pending: true, observation_timed_out: true, continuation: { file: evalResumeWorkerFile(evalRoot, requestId), status: "admission_unknown" } };
  }
}

async function acceptAndObserve({ evalRoot, requestId, fromRequestId, waitMs }, signal, progress) {
  const deadline = performance.now() + waitMs, root = path.resolve(evalRoot);
  const manifestBytes = await readFile(path.join(root, "manifest.json")), manifest = JSON.parse(manifestBytes);
  const source = assertControlResumeSource(await readEvents(path.join(root, "events.jsonl")), manifest.run_id, requestId, fromRequestId);
  if (!path.isAbsolute(manifest.runtime_control_bin ?? "") || !path.isAbsolute(manifest.runtime_resource_home ?? "")) fail("EVAL continuation requires its retained runtime identities", "runtime_scope_identity_missing");
  const intent = { eval_root: root, run_id: manifest.run_id, request_id: requestId, source_request_id: fromRequestId, request_sequence: source.control?.request_sequence ?? source.resume.request_sequence, manifest_sha256: sha256(manifestBytes) };
  const file = evalResumeWorkerFile(root, requestId);
  await mkdir(path.dirname(file), { recursive: true });
  await withRunnerLock(file, async () => {
    let saved;
    try { saved = await read(file); } catch (error) { if (error.code !== "ENOENT") throw error; }
    if (saved) {
      if (saved.schema_id !== "dd-eval/resume-worker@1" || hashJson(saved.intent) !== hashJson(intent)) fail("Resume request already identifies another experiment continuation", "control_request_conflict");
    } else { signal.throwIfAborted(); await writeJsonAtomic(file, { schema_id: "dd-eval/resume-worker@1", intent, status: "requested" }); }
  }, { signal, timeoutMs: waitMs || 60_000 });
  progress.accepted = true;
  signal.throwIfAborted();
  const saved = await read(file);
  if (saved.status !== "completed") {
    const child = spawn(process.execPath, [entrypoint, file], { cwd: root, detached: true, stdio: "ignore" });
    await once(child, "spawn"); child.unref();
  }
  for (;;) {
    const current = await read(file), scope = current.scope_result;
    if (current.status === "failed" && !scope) throw reportedError(current.error, "EVAL continuation failed");
    if (!waitMs || scope?.pending === false || ["failed", "completed", "superseded"].includes(current.status) || performance.now() >= deadline) {
      return { ...scope, root, run_id: manifest.run_id, request_id: requestId, source_request_id: fromRequestId, ok: true, accepted: true, runtime_accepted: scope?.receipt ? true : null,
        pending: scope?.pending !== false, ...(waitMs && scope?.pending !== false && performance.now() >= deadline ? { observation_timed_out: true } : {}),
        continuation: { file, status: current.status, owner_pid: current.owner_pid ?? null, process_id: current.process_id ?? null, error: current.error ?? null, result: current.result ?? null } };
    }
    await delay(Math.min(50, Math.max(0, deadline - performance.now())));
  }
}

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

async function runWorker(file) {
  const initial = await read(file), intent = initial.intent;
  if (initial.schema_id !== "dd-eval/resume-worker@1" || !path.isAbsolute(intent?.eval_root ?? "") || file !== evalResumeWorkerFile(intent.eval_root, intent.request_id)) fail("Invalid EVAL continuation identity", "control_request_invalid");
  const root = intent.eval_root;
  // This lock owns only experiment observation, never the managed RUN. A
  // duplicate child waits for the current owner and reuses its durable result.
  await withRunnerLock(`${root}.resume-observer`, async () => {
    let saved = await read(file), record = null, recordValidated = false, call;
    if (saved.status === "completed") return;
    const publish = async update => {
      const current = await read(file); // Never recreate a removed experiment.
      if (current.schema_id !== initial.schema_id || hashJson(current.intent) !== hashJson(intent)) fail("EVAL continuation intent changed", "control_request_conflict");
      saved = { ...saved, ...update, owner_pid: process.pid, updated_at: new Date().toISOString() };
      await writeJsonAtomic(file, saved);
    };
    try {
      const bytes = await readFile(path.join(root, "manifest.json"));
      if (sha256(bytes) !== intent.manifest_sha256) fail("EVAL manifest changed before continuation", "runner_definition_drift");
      const manifest = JSON.parse(bytes), args = { evalRoot: root, requestId: intent.request_id, fromRequestId: intent.source_request_id };
      assertControlResumeSource(await readEvents(path.join(root, "events.jsonl")), manifest.run_id, intent.request_id, intent.source_request_id);
      await publish({ status: "observing", error: null });
      for (;;) {
        const scope = await runnerControlResume(args);
        await publish({ scope_result: scope, status: scope.pending ? "observing" : "released" });
        if (!scope.pending) break;
        await delay(250);
      }
      // Registration before release would change its captured inventory. Only
      // now can this local writer acquire productive scope admission.
      const env = { DD_FLOW_HOME: path.join(root, "control-runtime"), DD_FLOW_RESOURCE_HOME: manifest.runtime_resource_home, DD_FLOW_BIN: manifest.runtime_control_bin, DD_FLOW_ENGINE_MODE: "1" };
      call = args => commandJson(manifest.runtime_control_bin, ["runtime", "process", ...args], { cwd: root, env, signal: AbortSignal.timeout(60_000) });
      const operation = `${manifest.run_id}:observer:${sha256(intent.request_id)}`;
      const budget = { schema_id: "dd-flow/runtime-budget@1", scope_id: manifest.run_id, per_harness: {} };
      const self = (await processSnapshot()).find(item => item.pid === process.pid);
      if (!self || self.zombie || self.pgid !== process.pid) fail("EVAL observer requires its own detached process group", "process_ownership_unknown");
      const owns = candidate => {
        if (!candidate?.id || !candidate.lease_token || candidate.kind !== "eval-observer" || candidate.owner_id !== manifest.run_id || candidate.operation_id !== operation || !candidate.pid || !candidate.pid_started_at || candidate.project_id || candidate.run_id || candidate.work_id || candidate.check_id) return false;
        try {
          const metadata = JSON.parse(candidate.metadata_json);
          return metadata.role === "observer" && metadata.dd_flow_home === env.DD_FLOW_HOME && metadata.process_group_id === candidate.pid && hashJson(metadata.budget) === hashJson(budget);
        } catch { return false; }
      };
      const register = () => call(["register", "--kind", "eval-observer", "--owner", manifest.run_id, "--pid", String(process.pid), "--process-group-id", String(process.pid), "--operation", operation, "--role", "observer", "--budget-json", JSON.stringify(budget)]);
      try {
        record = (await register()).process;
      } catch (error) {
        const listed = await call(["status"]), processes = await processSnapshot();
        const matches = listed.processes?.filter(item => item.kind === "eval-observer" && item.owner_id === manifest.run_id && item.operation_id === operation && ["starting", "running", "stopping", "orphaned"].includes(item.state));
        if (matches?.length !== 1 || !owns(matches[0])) throw error;
        const prior = matches[0], physical = processes.find(item => item.pid === prior.pid && item.started === prior.pid_started_at.trim().replace(/\s+/g, " "));
        if (prior.pid === process.pid && physical && !physical.zombie && prior.state === "running") record = prior;
        else {
          // Never steal a live observer or treat an expired lease as death.
          if (physical && !physical.zombie || prior.pid === process.pid) throw error;
          await call(["stop", "--id", prior.id, "--lease-token", prior.lease_token]);
          record = (await register()).process;
        }
      }
      if (!owns(record) || record.pid !== process.pid || record.state !== "running" || record.pid_started_at.trim().replace(/\s+/g, " ") !== self.started) fail("Observer registration omitted its current physical owner", "process_ownership_unknown");
      recordValidated = true;
      await publish({ status: "continuing", process_id: record.id });
      for (;;) {
        await call(["check-admission", "--id", record.id, "--lease-token", record.lease_token]);
        try {
          const result = await runnerResume({ evalRoot: root, resumeRequestId: intent.request_id, expectedManifestSha256: intent.manifest_sha256 });
          await publish({ status: "finishing", result, error: null });
          break;
        } catch (error) {
          // Loss of observation does not end a RUN. Reattach through the shared
          // journal-aware path; neither restart a native turn nor retire its owner.
          if (!isObservationLoss(error) && error.code !== "runner_lock_timeout") throw error;
          await publish({ status: "observation_lost", error: errorRecord(error) });
          await delay(1000);
        }
      }
    } catch (error) {
      await publish({ status: ["control_request_stale", "managed_run_controlled", "runtime_scope_controlled", "runtime_scope_stopped"].includes(error.code) ? "superseded" : "failed", error: errorRecord(error) });
    } finally {
      if (recordValidated) {
        try { await call(["finish", "--id", record.id, "--lease-token", record.lease_token, "--state", "stopped"]); }
        catch (error) { await publish({ status: "failed", error: errorRecord(error) }); }
      }
      if (saved.status === "finishing") await publish({ status: "completed" });
    }
  }, { timeoutMs: 60_000 });
}

if (process.argv[1] && path.resolve(process.argv[1]) === entrypoint) {
  runWorker(path.resolve(process.argv[2] ?? "")).catch(error => {
    process.stderr.write(`${JSON.stringify(errorRecord(error))}\n`); process.exitCode = 1;
  });
}
