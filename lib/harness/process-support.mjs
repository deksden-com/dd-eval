import { isInstalledFlow } from "../installed-flows.mjs";
import { reportedError } from "../operation-errors.mjs";

export const diagnosticLimit = 64 * 1024;
const diagnosticKinds = new Set(["native_hook_phase", "native_hook_diagnostic", "process_maintenance_phase", "operation_progress", "operation_wait"]);
const failure = (message, code) => Object.assign(new Error(message), { code });

/** Parse bounded structured CLI errors without treating diagnostics as receipts. */
export function structuredFailure(stdout, stderr, fallback) {
  for (const text of [stdout, stderr]) {
    // Retain the whole pretty receipt after recognized JSONL diagnostics;
    // arbitrary stderr still cannot masquerade as an error envelope.
    const envelope = text.split(/\n/).filter(line => {
      try { return !diagnosticKinds.has(JSON.parse(line)?.kind); }
      catch { return true; }
    }).join("\n").trim();
    for (const line of [text.trim(), envelope, ...text.trim().split(/\n/).reverse()]) {
      try {
        const value = JSON.parse(line);
        if (diagnosticKinds.has(value?.kind)) continue;
        const error = value?.error;
        if (typeof error?.code === "string" && error.code) return reportedError(error, fallback);
        if (value?.ok === false && typeof value.code === "string") return reportedError({ ...value, message: typeof error === "string" ? error : value.message }, fallback);
      } catch { /* Not a structured CLI error line. */ }
    }
    // Pretty JSON may precede unrelated diagnostics in the same pipe chunk.
    // JSON.parse remains the parser; a bounded candidate lasts only until a
    // complete JSON object is recognized, not for the life of the command.
    let candidate = "", retained = null;
    for (const line of text.split(/\n/)) {
      if (!candidate && !line.trimStart().startsWith("{")) continue;
      candidate = candidate ? `${candidate}\n${line}` : line;
      if (candidate.length > diagnosticLimit) { candidate = ""; continue; }
      if (!line.trimEnd().endsWith("}")) continue;
      try {
        const value = JSON.parse(candidate); candidate = "";
        if (diagnosticKinds.has(value?.kind)) continue;
        if (typeof value?.error?.code === "string" && value.error.code) retained = reportedError(value.error, fallback);
        else if (value?.ok === false && typeof value.code === "string") retained = reportedError({ ...value, message: typeof value.error === "string" ? value.error : value.message }, fallback);
      } catch { /* A multiline candidate is not complete yet. */ }
    }
    if (retained) return retained;
  }
  return null;
}

export function reportedFailure(stdout, stderr, fallback, retained = null) {
  return structuredFailure(stdout, stderr, fallback) ?? retained ?? failure(stderr.trim() || stdout.trim() || fallback, "flow_reconciliation_failed");
}

/** Classify observable progress without treating heartbeats as durable activity. */
export function diagnosticAdvances(value, markers) {
  // Durable operation records, not a CLI's self-description, own this signal.
  if (["operation_progress", "operation_wait", "native_hook_diagnostic"].includes(value?.kind)) return false;
  if (["heartbeat", "poll", "status"].includes(value?.kind)) return false;
  if (!["native_hook_phase", "process_maintenance_phase"].includes(value?.kind)) return true;
  if (typeof value.phase !== "string" || ["heartbeat", "poll", "elapsed", "wait", "waiting"].includes(value.phase) || ["heartbeat", "poll", "status"].includes(value.action)) return false;
  const marker = JSON.stringify([value.kind, value.operation_id ?? value.process_id ?? null, value.action ?? null, value.phase]);
  if (markers.has(marker)) return false;
  markers.add(marker);
  return true;
}

/** Parse bounded stream fragments, retaining incomplete structured lines. */
export function diagnosticReader(onLine, onPlainFragment) {
  let pending = "", discarding = false;
  return {
    write(data) {
      if (discarding) {
        const end = data.indexOf("\n"); if (end < 0) return;
        discarding = false; data = data.slice(end + 1);
      }
      pending += data;
      for (;;) {
        const end = pending.indexOf("\n"); if (end < 0) break;
        const line = pending.slice(0, end); pending = pending.slice(end + 1);
        if (line.length <= diagnosticLimit) onLine(line);
        else if (!line.trimStart().startsWith("{")) onPlainFragment();
      }
      // Git/build progress often uses carriage returns rather than newlines.
      // Only a non-structured partial line may count immediately; fragmented
      // JSON keepalive must still wait for its trusted line classification.
      if (pending.trim() && !pending.trimStart().startsWith("{")) onPlainFragment();
      if (pending.length > diagnosticLimit) {
        if (pending.trimStart().startsWith("{")) { pending = ""; discarding = true; }
        else { onPlainFragment(); pending = pending.slice(-diagnosticLimit); }
      }
    },
    flush() { if (pending) onLine(pending); pending = ""; }
  };
}

/** Strip EVAL classifier credentials from a child process environment. */
export function childEnvironment(extra = {}) {
  const env = { ...process.env, ...extra };
  delete env.OPENROUTER_API_KEY;
  delete env.OPENAI_DECISIONS_API_KEY;
  return env;
}
/** Select the observation timeout for the requested command and phase. */
export function commandObservationTimeout(args, phase = null) {
  const memoryPrepare = args.includes("--prepare-only") && (["init", "upgrade"].includes(args[0])
    || args[0] === "flow" && isInstalledFlow(args[1]));
  return phase === "work" || args[0] === "setup" || memoryPrepare || args.some(arg => ["clone", "install", "build", "snapshot"].includes(arg)) ? 30 * 60_000 : 30_000;
}
