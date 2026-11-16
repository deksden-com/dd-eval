const caseId = "sdlc-eval-2026-summer-task-priority";

/** Reject unsupported case-specific acceptance contracts. */
export function validateCaseAcceptancePolicy(policy) {
  if (policy === undefined || policy === null) return;
  if (policy?.case_id !== caseId || !["task-priority@1", "task-priority@2", "task-priority@3", "task-priority@4"].includes(policy?.checker)) throw new Error("unsupported case acceptance policy");
}

/** Identify acceptance contracts with generated verification matrices. */
export const usesGeneratedVerificationMatrix = policy => ["task-priority@3", "task-priority@4"].includes(policy?.checker);
/** Identify contracts that consume failed-check evidence. */
export const usesFailedCheckEvidenceV4 = policy => policy?.checker === "task-priority@4";
