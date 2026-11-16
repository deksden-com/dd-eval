import path from "node:path";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { hashJson, sha256 } from "../runner-events.mjs";
import { readRegularFile } from "../regular-file.mjs";
import { readJson } from "../json-file.mjs";
import { hitlMatchContract, hitlCoverageContract, validateGroundedHitl } from "../hitl-contract.mjs";
import { verifyJevReceipt } from "../hitl-coverage.mjs";
import { verifySemanticReceipt } from "../semantic-decisions.mjs";
import { assertJudgeVerdict } from "../judge/cleanup.mjs";

const fail = (message, code = "validation") => { const error = new Error(message); error.code = code; throw error; };

/** Persist an answer once; reject a conflicting answer at an already issued path. */
export async function materializeHitlAnswer({ attempt, stage, round, answer }) {
  const directory = path.join(attempt, "hitl-answers");
  await mkdir(directory, { recursive: true });
  const file = path.join(directory, `${stage}-resume-${round}.md`);
  // Reconciliation may encounter an already issued file; never overwrite it.
  try { await writeFile(file, answer, { encoding: "utf8", flag: "wx" }); }
  catch (error) {
    if (error.code !== "EEXIST") throw error;
    if ((await readRegularFile(file)).toString("utf8") !== answer) fail("Retained HITL answer bytes changed", "judge_evidence_mismatch");
  }
  return file;
}
/** Verify a HITL verdict, packet and receipt against the exact execution scope. */
export async function hitlProof(judgment, scopeId) {
  const receipt = await readJson(judgment.receipt_file);
  const packetFile = path.join(path.dirname(judgment.receipt_file), "packet.json");
  if (hashJson(await readJson(packetFile)) !== receipt.packet_sha256 || hashJson(judgment.packet) !== receipt.packet_sha256) fail("HITL proof packet differs from accepted receipt", "judge_evidence_mismatch");
  if (judgment.packet.hitl_binding?.scope_id !== scopeId || hashJson(receipt.verdict) !== hashJson(validateGroundedHitl(judgment.verdict, judgment.packet, { stored: true }))) fail("HITL proof verdict/scope differs from its receipt", "judge_evidence_mismatch");
  if (![hitlMatchContract, hitlCoverageContract].includes(receipt.verdict?.schema_id) || judgment.verdict?.schema_id !== receipt.verdict.schema_id) fail("Historical HITL proof cannot authorize new issuance", "judge_result_invalid");
  if (receipt.decision_source === "jev") await verifyJevReceipt(path.dirname(judgment.receipt_file), receipt, judgment.packet);
  else if (receipt.decision_source === "semantic_decision") await verifySemanticReceipt(path.dirname(judgment.receipt_file), receipt, judgment.packet);
  else await assertJudgeVerdict(path.dirname(judgment.receipt_file), receipt);
  return { receipt_file: judgment.receipt_file, packet_file: packetFile, receipt_sha256: sha256(await readRegularFile(judgment.receipt_file)), packet_sha256: receipt.packet_sha256, verdict_contract: receipt.verdict.schema_id, scope_id: scopeId,
    ...(receipt.verdict.schema_id === hitlCoverageContract ? { decision_source: receipt.decision_source ?? "interaction_judge", eval_run_id: receipt.eval_run_id ?? null } : {}), ...(judgment.profile ? { judge_profile: judgment.profile, judge_session_id: judgment.session_id } : {}) };
}
/** Read retained answer bytes and verify the optional accepted SHA-256 binding. */
export async function acceptedHitlAnswer({ answerFile, answerSha256 = null }) {
  let bytes;
  try { bytes = await readFile(answerFile); }
  catch (error) { fail(`accepted HITL answer bytes are unavailable: ${error.message}`, "hitl_answer_missing"); }
  const actual = sha256(bytes);
  if (answerSha256 && actual !== answerSha256) {
    fail("accepted HITL answer checksum no longer matches its receipt", "hitl_answer_checksum_mismatch");
  }
  return { bytes, text: bytes.toString("utf8"), sha256: actual };
}
