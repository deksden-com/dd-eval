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
