import path from "node:path";
import { mkdir, stat, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { stages } from "../entry-pack.mjs";
import { flowStageCatalog } from "../flow-boundaries.mjs";
import { readRegularFile } from "../regular-file.mjs";
import { readJson } from "../json-file.mjs";
import { hashJson, writeJsonAtomic } from "../runner-events.mjs";
import { canonicalState, assertCanonicalDefinition } from "./canonical-recovery.mjs";
import { writeCanonicalState } from "./canonical-state.mjs";
import { canonicalEntries, canonicalCandidatePack } from "./canonical-pack.mjs";

const fail = (message, code) => { throw Object.assign(new Error(message), { code }); };
const now = () => new Date().toISOString();
const sha256 = value => createHash("sha256").update(value).digest("hex");
async function exists(file) { try { await stat(file); return true; } catch { return false; } }

/** Accept a reviewed entry and promote the pack once every review is valid. */
export async function canonicalAccept({ buildRoot, entry: entryName, reviewFile }) {
  const { root, state, loaded, blueprint } = await canonicalState(buildRoot);
  await assertCanonicalDefinition(state);
  if (state.status !== "waiting_for_entry_review") fail("canonical build is not waiting for entry reviews", "canonical_transition_invalid");
  const catalog = flowStageCatalog(loaded.value.flow.contour);
  if (!catalog.includes(entryName)) fail("unknown canonical entry", "canonical_entry_unknown");
  const receiptFile = path.join(root, state.qualification?.receipt ?? ""); if (!(await exists(receiptFile))) fail("canonical entry acceptance requires a qualification receipt", "qualification_receipt_missing");
  const receipt = await readJson(receiptFile); if (receipt.schema_id !== "dd-eval/qualification-receipt@2" || receipt.status !== "qualified") fail("canonical entry acceptance requires successful qualification", "qualification_not_successful");
  const review = path.resolve(reviewFile), reviewBytes = await readRegularFile(review);
  if (!reviewBytes.toString("utf8").trim()) fail("canonical entry review must be a non-empty file", "canonical_review_required");
  state.entry_reviews = { ...(state.entry_reviews ?? {}), [entryName]: { review, sha256: sha256(reviewBytes), at: now() } };
  const allAccepted = catalog.every((key) => state.entry_reviews[key]);
  if (!allAccepted) {
    await writeCanonicalState(root, state, { source: "dd-eval://runner", runId: state.revision, type: "dev.dd.eval.canonical.entry_accepted", data: { state: state.status, entry: entryName } });
    return { build: root, state, next: { kind: "entry_review", remaining: catalog.filter((key) => !state.entry_reviews[key]) } };
  }
  const entries = await canonicalEntries(root, state, catalog);
  const reviewContents = {};
  for (const [key, value] of Object.entries(state.entry_reviews)) {
    const bytes = key === entryName ? reviewBytes : await readRegularFile(value.review);
    if (sha256(bytes) !== value.sha256) fail(`Accepted review changed: ${key}`, "canonical_review_changed");
    reviewContents[key] = bytes;
  }
  const pack = await canonicalCandidatePack(root, state, blueprint, entries); pack.entries = Object.fromEntries(stages.map((key) => [key, `${key}.json`])); pack.status = "accepted"; pack.accepted_at = now(); pack.acceptance_sha256 = hashJson({ ...pack, acceptance_sha256: undefined });
  const destination = path.join(loaded.root, "stage-entries", state.revision); await mkdir(destination, { recursive: true });
  await writeJsonAtomic(path.join(destination, "stage-context.json"), blueprint);
  for (const key of stages) await writeJsonAtomic(path.join(destination, `${key}.json`), entries[key]);
  await writeJsonAtomic(path.join(destination, "entry-pack.json"), pack);
  const reviews = path.join(loaded.root, "checkpoint-reviews", state.revision); await mkdir(reviews, { recursive: true });
  for (const [key, bytes] of Object.entries(reviewContents)) await writeFile(path.join(reviews, `${key}.md`), bytes);
  const caseFile = path.join(loaded.root, "case.json"); const caseValue = { ...loaded.value, entry_pack: path.relative(loaded.root, path.join(destination, "entry-pack.json")) }; await writeJsonAtomic(caseFile, caseValue);
  state.status = "promoted_pending_commit"; state.promoted_entry_pack = path.relative(loaded.root, path.join(destination, "entry-pack.json"));
  await writeCanonicalState(root, state, { source: "dd-eval://runner", runId: state.revision, type: "dev.dd.eval.canonical.promoted", data: { state: state.status, entry_pack: state.promoted_entry_pack } });
  return { build: root, state, next: { kind: "git_commit", message: "Review, commit and push the promoted case definition before scored execution." } };
}
