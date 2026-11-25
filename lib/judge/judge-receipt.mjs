import { profileSemanticHash } from "../execution-contract.mjs";
import { hashJson } from "../runner-events.mjs";

const fail = (message, code = "validation") => { const error = new Error(message); error.code = code; throw error; };

/** Read a Judge reply only after verifying the Codex native Turn identity. */
export function judgeTurnText(response, profile) {
  if (profile.harness === "codex-desktop") {
    const turn = response?.turn?.turn ?? response?.turn;
    if (typeof response?.turn_id !== "string" || !response.turn_id || turn?.id !== response.turn_id || turn?.status !== "completed") fail("Judge reply is not bound to its successful native Turn", "judge_turn_identity_invalid");
  }
  return response?.assistant_text;
}

/** Reject retained Judge receipts whose profile identity or hash differs. */
export function assertJudgeProfileBinding(receipt, profile) {
  if (receipt.profile_id !== profile.id || receipt.profile_sha256 !== profileSemanticHash(profile)) fail("Retained Judge settings are unconfirmed or differ from this frozen profile", "judge_profile_contract_mismatch");
  return receipt;
}

/** Parse the Judge's JSON response, tolerating a surrounding Markdown fence. */
export function parseJsonResponse(text, label) {
  const source = typeof text === "string" ? text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "") : "";
  try { return JSON.parse(source); } catch { fail(`${label} did not return one JSON object`, "judge_result_invalid"); }
}

/** Construct driver arguments from the retained Judge profile without changing it. */
export function judgeExecutionArgs(profile) {
  return ["--model", profile.model, "--reasoning", profile.reasoning,
    ...["provider", "mode", "permission"].flatMap(key => profile[key] ? [`--${key}`, profile[key]] : [])];
}

/** Preserve native post-Turn settings separately from the requested profile. */
export function judgeTurnEvidence(response, profile, sessionId) {
  const observedSession = response?.provider_session_id ?? response?.session_id;
  if (observedSession !== sessionId) fail("Judge observation belongs to another Session", "judge_evidence_mismatch");
  judgeTurnText(response, profile);
  const observed = Object.fromEntries(["model", "reasoning"].map(key => [key,
    typeof response?.observed_profile?.[key] === "string" && response.observed_profile[key].trim() ? response.observed_profile[key] : null]));
  const fields = Object.fromEntries(Object.keys(observed).map(key => [key,
    observed[key] === null ? "unknown" : observed[key] === profile[key] ? "matched" : "mismatched"]));
  return { schema_id: "dd-eval/judge-turn-observation@1", session_id: sessionId, turn_id: response?.turn_id ?? null,
    native_result_sha256: hashJson(response), source: "adapter.observed_profile", observed, fields,
    scope: "adapter_reported_profile_after_turn" };
}
