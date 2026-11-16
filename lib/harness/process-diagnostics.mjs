import { diagnosticLimit } from "./process-failure.mjs";

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
