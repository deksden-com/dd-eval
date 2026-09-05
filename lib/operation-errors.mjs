// An observer losing its response does not establish that a provider Turn failed.
export function isObservationLoss(error) {
  return ["rpc_timeout", "daemon_timeout", "turn_timeout", "operation_observation_lost", "daemon_connection_closed"].includes(error?.code);
}

export function errorRecord(error, depth = 0) {
  return {
    code: typeof error?.code === "string" ? error.code : "operation_failed",
    message: typeof error?.message === "string" ? error.message : String(error),
    ...(typeof error?.retryable === "boolean" ? { retryable: error.retryable } : {}),
    ...(error?.details !== undefined ? { details: error.details } : {}),
    ...(error?.cause && depth < 3 ? { cause: errorRecord(error.cause, depth + 1) } : {}),
  };
}

export function reportedError(value, fallback) {
  const record = errorRecord({ ...value, message: value.message ?? fallback });
  return Object.assign(new Error(record.message), record);
}
