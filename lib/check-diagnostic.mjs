// Compact presentation only: repair authority stays in FLOW's bound receipts.
export function compactCheckDiagnostic(check) {
  const compact = (value, keys) => Object.fromEntries(keys.filter(key => value?.[key] === null || ["string", "boolean"].includes(typeof value?.[key]) || typeof value?.[key] === "number" && Number.isFinite(value[key])).map(key => [key, typeof value[key] === "string" ? value[key].slice(0, ["file", "path", "receipt_path", "receipt_file", "evidence_dir", "log"].includes(key) ? 4000 : 512) : value[key]]));
  const redact = text => text.replace(/\b(Bearer|Basic)\s+[^\s"']+/gi, "$1 [redacted]")
    .replace(/postgres(?:ql)?:\/\/[^\s]+/gi, "postgresql://[redacted]")
    .replace(/\b([\w-]+)(["']?\s*[:=]\s*["']?)([^"'\s,;&}]+)/g, (whole, key, separator) => /password|token|secret|api[_-]?key|authorization/i.test(key) ? `${key}${separator}[redacted]` : whole);
  const failure = value => ({ ...compact(value, ["category", "origin", "phase", "file", "test_id", "code", "native_code", "classification_reason"]), ...(typeof value?.message === "string" ? { message: redact(value.message).slice(0, 1024) } : {}) });
  const diagnosticFailure = value => {
    const result = failure(value), ref = value?.diagnostic_artifact;
    if (ref && typeof ref.relative_path === "string" && ref.relative_path.length <= 4096 && !/^(?:\/|[A-Za-z]:)|\\/.test(ref.relative_path) && ref.relative_path.split("/").every(part => part && part !== "." && part !== "..") && /^[a-f0-9]{64}$/.test(ref.sha256)) result.diagnostic_artifact = { relative_path: ref.relative_path, sha256: ref.sha256 };
    return result;
  };
  const evidence = check?.runner_evidence;
  const result = { ...compact(check, ["id", "check_id", "declaration_id", "local_id", "work_id", "gate", "scope", "status", "outcome", "disposition", "exit_code", "input_hash", "verification_epoch", "receipt_path", "receipt_file", "evidence_dir", "log", "log_sha256"]),
    ...(check?.runner_evidence_required && typeof check.runner_evidence_required.path === "string" ? { runner_evidence_required: compact(check.runner_evidence_required, ["schema_id", "path"]) } : {}),
    ...(evidence && typeof evidence === "object" ? { runner_evidence: { ...compact(evidence, ["schema_id", "completed", "observation_unknown"]), counts: compact(evidence.counts, ["passed", "failed", "skipped"]), failures: Array.isArray(evidence.failures) ? evidence.failures.slice(0, 64).map(diagnosticFailure) : [] } } : {}),
    ...(Array.isArray(check?.execution_failures) ? { execution_failures: check.execution_failures.slice(0, 64).map(diagnosticFailure) } : {}) };
  if (evidence?.failures?.length > 64 || check?.execution_failures?.length > 64) result.diagnostic_truncated = true;
  // A compact packet is a locator, not another copy of the full runner report.
  for (const failures of [result.runner_evidence?.failures, result.execution_failures]) {
    while (failures?.length && Buffer.byteLength(JSON.stringify(result)) > 32768) { failures.pop(); result.diagnostic_truncated = true; }
  }
  return result;
}
