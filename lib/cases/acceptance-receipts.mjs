import { mkdir, stat } from "node:fs/promises";
import path from "node:path";
import { checkCaseAcceptance, usesGeneratedVerificationMatrix, usesFailedCheckEvidenceV4, selectFailedCheckGate } from "../case-acceptance.mjs";
import { readJson } from "../json-file.mjs";
import { hashJson, writeJsonAtomic } from "../runner-events.mjs";

const fail = (message, code = "validation") => { const error = new Error(message); error.code = code; throw error; };
async function exists(file) { try { await stat(file); return true; } catch { return false; } }

/**
 * Attach retained case-acceptance receipts, rechecking existing evidence before reuse.
 * @param {string} root EVAL root for owned receipts.
 * @param {object} manifest Frozen case policy and identity.
 * @param {object[]} results Execution results updated with their receipt bindings.
 * @returns {Promise<void>} Rejects changed receipts or changed checkpoint evidence.
 */
export async function attachCaseAcceptance(root, manifest, results) {
  if (!manifest.case_acceptance) return;
  for (const result of results) {
    const checkpointHash = result.candidate?.manifest_sha256 ?? (usesGeneratedVerificationMatrix(manifest.case_acceptance) && result.state === "failed" ? result.recovery?.manifest_sha256 : undefined);
    const key = usesFailedCheckEvidenceV4(manifest.case_acceptance)
      ? hashJson({ policy: manifest.case_acceptance, execution: result.execution, state: result.state, checkpoint: checkpointHash ?? null,
        gate: result.state === "failed" ? selectFailedCheckGate(result) : null,
        recovery: result.recovery ? { control_id: result.recovery.control_id ?? null, recovery_id: result.recovery.recovery_id ?? null, generation: result.recovery.generation ?? null } : null })
      : hashJson({ execution: result.execution, state: result.state, checkpoint: checkpointHash ?? null });
    const file = path.join(root, "case-acceptance", `${key}.json`);
    let receipt;
    if (await exists(file)) {
      receipt = await readJson(file);
      const { immutable_hash, ...content } = receipt;
      if (hashJson(content) !== immutable_hash || receipt.definition?.case_id !== manifest.case_id) fail("case acceptance receipt changed after publication", "case_acceptance_receipt_invalid");
      // The checker intentionally omits checkpoint identity for not-applicable
      // gates. Recompute its whole receipt below instead of imposing a second,
      // incompatible checkpoint-binding rule on every status.
      const current = await checkCaseAcceptance({ evalRoot: root, execution: result.execution, result, policy: manifest.case_acceptance });
      if (hashJson(current) !== immutable_hash) fail("case acceptance checkpoint changed after publication", "case_acceptance_receipt_invalid");
    } else {
      const content = await checkCaseAcceptance({ evalRoot: root, execution: result.execution, result, policy: manifest.case_acceptance });
      receipt = { ...content, immutable_hash: hashJson(content) };
      await mkdir(path.dirname(file), { recursive: true });
      await writeJsonAtomic(file, receipt);
    }
    result.case_acceptance = { file, sha256: receipt.immutable_hash, receipt };
  }
}
