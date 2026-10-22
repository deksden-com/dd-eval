// Compact presentation only: repair authority stays in FLOW's bound receipts.
export const redactDiagnosticText = text => text.replace(/\b(Bearer|Basic)\s+[^\s"']+/gi, "$1 [redacted]")
  .replace(/postgres(?:ql)?:\/\/[^\s]+/gi, "postgresql://[redacted]")
  .replace(/([?&][\w-]*(?:token|password|secret|api[_-]?key|authorization)[\w-]*=)[^&#\s"']+/gi, "$1[redacted]")
  .replace(/(^|[^\w-])([\w-]+)(["']?\s*[:=]\s*["']?)([^"'\s,;&}]+)/g, (whole, prefix, key, separator) => /password|token|secret|api[_-]?key|authorization/i.test(key) ? `${prefix}${key}${separator}[redacted]` : whole);

/** One budget for the whole projection. Important causes and native proof
 * locators precede bulk check arrays; truncation is presentation, not proof. */
export function boundFailureDiagnostic(value) {
  const limit = 32768;
  if (Buffer.byteLength(JSON.stringify(value)) <= limit) return value;
  const priority = ["code", "reason", "physical_stopped", "native_settled", "native_settlement", "primary_error", "native_outcome", "request_proof", "cause", "details", "message"];
  const fit = (item, bytes) => {
    if (item === null || typeof item !== "object") {
      if (Buffer.byteLength(JSON.stringify(item)) <= bytes) return item;
      if (typeof item !== "string" || bytes < 2) return null;
      let end = Math.min(item.length, bytes);
      while (end > 0 && Buffer.byteLength(JSON.stringify(item.slice(0, end))) > bytes) end = Math.floor(end * .8);
      return item.slice(0, end);
    }
    const output = Array.isArray(item) ? [] : {};
    const keys = Object.keys(item).sort((a, b) => (priority.includes(a) ? priority.indexOf(a) : priority.length) - (priority.includes(b) ? priority.indexOf(b) : priority.length));
    for (const key of keys) {
      const remaining = bytes - Buffer.byteLength(JSON.stringify(output)) - Buffer.byteLength(JSON.stringify(key)) - 2;
      if (remaining < 8) break;
      const child = fit(item[key], remaining);
      if (Array.isArray(output)) output.push(child); else output[key] = child;
      if (Buffer.byteLength(JSON.stringify(output)) > bytes) { if (Array.isArray(output)) output.pop(); else delete output[key]; break; }
    }
    return output;
  };
  return { ...fit(value, limit - 40), diagnostic_truncated: true };
}
export function compactCheckDiagnostic(check) {
  const compact = (value, keys) => Object.fromEntries(keys.filter(key => value?.[key] === null || ["string", "boolean"].includes(typeof value?.[key]) || typeof value?.[key] === "number" && Number.isFinite(value[key])).map(key => [key, typeof value[key] === "string" ? redactDiagnosticText(value[key]).slice(0, ["file", "path", "receipt_path", "receipt_file", "evidence_dir", "log"].includes(key) ? 4000 : 512) : value[key]]));
  const failure = value => ({ ...compact(value, ["category", "origin", "phase", "file", "test_id", "code", "native_code", "classification_reason"]), ...(typeof value?.message === "string" ? { message: redactDiagnosticText(value.message).slice(0, 1024) } : {}) });
  const artifact = ref => ref && typeof ref.relative_path === "string" && ref.relative_path.length <= 4096 && redactDiagnosticText(ref.relative_path) === ref.relative_path && !/^(?:\/|[A-Za-z]:)|\\/.test(ref.relative_path) && ref.relative_path.split("/").every(part => part && part !== "." && part !== "..") && /^[a-f0-9]{64}$/.test(ref.sha256)
    ? { relative_path: ref.relative_path, sha256: ref.sha256 } : null;
  const diagnosticFailure = value => {
    const result = failure(value), child = value?.child_evidence;
    if (child) {
      // Native refs are relative to the child report, not this aggregate root.
      // Retain its report locator so nested proof links can be followed correctly.
      const report = artifact(child.report);
      if (report && typeof child.step_id === "string") result.child_evidence = { ...compact(child, ["step_id"]), report };
    } else {
      const ref = artifact(value?.diagnostic_artifact);
      if (ref) result.diagnostic_artifact = ref;
    }
    return result;
  };
  const evidence = check?.runner_evidence;
  const partial = evidence?.schema_id === "dd-flow/check-runner-evidence@2" && evidence.failure_projection?.state === "partial";
  const result = { ...compact(check, ["id", "check_id", "declaration_id", "local_id", "work_id", "gate", "scope", "status", "outcome", "disposition", "exit_code", "input_hash", "verification_epoch", "receipt_path", "receipt_file", "evidence_dir", "log", "log_sha256"]),
    ...(check?.runner_evidence_required && typeof check.runner_evidence_required.path === "string" ? { runner_evidence_required: compact(check.runner_evidence_required, ["schema_id", "path"]) } : {}),
    ...(evidence && typeof evidence === "object" ? { runner_evidence: { ...compact(evidence, ["schema_id", "completed", "observation_unknown"]), ...(partial ? { completed: false, failure_projection: compact(evidence.failure_projection, ["state", "reason", "represented", "omitted"]) } : {}), counts: compact(evidence.counts, ["passed", "failed", "skipped"]), failures: Array.isArray(evidence.failures) ? evidence.failures.slice(0, 64).map(diagnosticFailure) : [], ...(Array.isArray(evidence.steps) ? { steps: evidence.steps.slice(0, 64).flatMap(step => { const report = artifact(step?.report); return report && typeof step.id === "string" ? [{ ...compact(step, ["id", "state"]), report }] : []; }) } : {}) } } : {}),
    ...(Array.isArray(check?.execution_failures) ? { execution_failures: check.execution_failures.slice(0, 64).map(diagnosticFailure) } : {}) };
  if (evidence?.failures?.length > 64 || check?.execution_failures?.length > 64) result.diagnostic_truncated = true;
  // A compact packet is a locator, not another copy of the full runner report.
  while (result.runner_evidence?.steps?.length && Buffer.byteLength(JSON.stringify(result)) > 32768) { result.runner_evidence.steps.pop(); result.diagnostic_truncated = true; }
  for (const failures of [result.runner_evidence?.failures, result.execution_failures]) {
    while (failures?.length && Buffer.byteLength(JSON.stringify(result)) > 32768) { failures.pop(); result.diagnostic_truncated = true; }
  }
  return result;
}
