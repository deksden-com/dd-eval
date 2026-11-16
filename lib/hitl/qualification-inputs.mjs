import path from "node:path";
import { realpath } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { loadProfile } from "../cases/profile-loading.mjs";
import { contained } from "../contained-path.mjs";
import { stages, semanticContextHash } from "../entry-pack.mjs";
import { resolveExecutionContract, contractProfile } from "../execution-contract.mjs";
import { profileConfigHome } from "../execution/run-contract-resolution.mjs";
import { hitlCoverageContract, hitlMatchContract, hitlCoverageInput, buildHitlPacket, interactionCoveragePrompt } from "../hitl-contract.mjs";
import { validateExpectedAtoms, validateCoverageExpectation } from "../hitl-corpus.mjs";
import { parseJsonBytes, readJson } from "../json-file.mjs";
import { readRegularFile } from "../regular-file.mjs";
import { hashJson, sha256 } from "../runner-events.mjs";
import { interactionFixture } from "./interaction-fixtures.mjs";
import { renderedQualificationContext, qualificationContext } from "./qualification-context.mjs";
import { hitlQualificationHome } from "./qualification-home.mjs";
import { hitlQualificationContract, qualificationTask, contextGrounding } from "./qualification-contract.mjs";
import { verifyQualificationSample } from "./qualification-sample.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const stageSet = new Set(stages);
const isObject = value => Boolean(value) && typeof value === "object" && !Array.isArray(value);
const fail = (message, code = "validation") => { throw Object.assign(new Error(message), { code }); };

/** Bind corpus, fixtures and frozen Judge inputs before native work. */
export async function hitlQualificationInputs({ loaded, runProfile, definition }) {
  const declaration = loaded.value.hitl_qualification;
  if (!declaration) return null;
  const compact = runProfile.value.interaction_judge?.verdict_contract === hitlCoverageContract;
  const selected = compact ? declaration.coverage : declaration;
  if (!selected) fail("Compact Judge requires an authored coverage corpus", "definition_qualification_invalid");
  if (!isObject(selected) || typeof selected.file !== "string" || !/^[a-f0-9]{64}$/.test(selected.sha256 ?? "")) fail("case HITL qualification declaration is invalid", "definition_qualification_invalid");
  const corpusFile = contained(loaded.root, selected.file, "HITL qualification corpus");
  const bytes = await readRegularFile(corpusFile);
  if (sha256(bytes) !== selected.sha256) fail("HITL qualification corpus checksum changed", "definition_qualification_invalid");
  const corpus = parseJsonBytes(bytes, corpusFile);
  if (!isObject(corpus) || corpus.schema_id !== (compact ? "dd-eval/hitl-coverage-corpus@1" : "dd-eval/hitl-qualification-corpus@2") || corpus.coverage_required !== true || !stageSet.has(corpus.stage) || !Array.isArray(corpus.items) || !corpus.items.length) fail("HITL qualification corpus is empty, historical or malformed", "definition_qualification_invalid");
  if (corpus.context_required !== undefined && typeof corpus.context_required !== "boolean") fail("HITL context_required must be boolean", "definition_qualification_invalid");
  const itemStages = corpus.items.map(item => item?.stage ?? corpus.stage);
  if (itemStages.some(stage => !stageSet.has(stage))) fail("HITL qualification corpus item has an invalid stage", "definition_qualification_invalid");
  const fixtures = Object.fromEntries(await Promise.all([...new Set(itemStages)].map(async stage => [stage, await interactionFixture(loaded.root, stage)])));
  const ids = new Set();
  const contexts = Object.create(null);
  const packets = Object.create(null);
  for (const [index, item] of corpus.items.entries()) {
    const known = new Set(fixtures[itemStages[index]].responses.map(response => response.id));
    if (!isObject(item) || typeof item.id !== "string" || !item.id || ids.has(item.id) || typeof item.question !== "string" || !item.question.trim() || !["covered_by_canonical_response", "fixture_gap", "unnecessary_question", "out_of_scope", "ambiguous"].includes(item.classification) || !Array.isArray(item.response_ids) || item.response_ids.some(id => !known.has(id)) || (item.classification === "covered_by_canonical_response" && !item.response_ids.length)) fail("HITL qualification corpus item is invalid", "definition_qualification_invalid");
    if (new Set(item.response_ids).size !== item.response_ids.length || (item.status !== undefined && item.status !== (item.classification === "covered_by_canonical_response" ? "matched" : "unmatched"))) fail("HITL qualification expected status/IDs are inconsistent", "definition_qualification_invalid");
    if (compact) validateCoverageExpectation(item, { responses: fixtures[itemStages[index]].responses });
    else validateExpectedAtoms(item, { responses: fixtures[itemStages[index]].responses, coverageRequired: true });
    contexts[item.id] = await qualificationContext(loaded.root, item, itemStages[index]);
    if (corpus.context_required === true && !contexts[item.id]) fail("Contextual HITL corpus item lacks context", "definition_qualification_invalid");
    // Validate every authored packet before the first paid/native Session, including late items.
    packets[item.id] = await buildHitlPacket({ stage: itemStages[index], question: item.question, subjectContext: contexts[item.id] ? renderedQualificationContext(contexts[item.id].context, await realpath(loaded.root)) : null,
      responses: fixtures[itemStages[index]].responses, readRegularFile, verdictContract: compact ? hitlCoverageContract : hitlMatchContract });
    ids.add(item.id);
  }
  if (compact) {
    const heldout = corpus.items.filter(item => item.partition === "heldout"), calibration = corpus.items.filter(item => item.partition === "calibration");
    if (corpus.items.some(item => !["calibration", "heldout"].includes(item.partition)) || !calibration.some(item => item.coverage_expectation.status === "covered")
      || !calibration.some(item => item.coverage_expectation.status !== "covered") || heldout.length < 20
      || heldout.filter(item => item.coverage_expectation.status === "covered").length < 10 || heldout.filter(item => item.coverage_expectation.status !== "covered").length < 10)
      fail("Compact coverage corpus lacks a frozen balanced holdout", "definition_qualification_invalid");
  }
  const judgeId = runProfile.value.interaction_judge?.profile_id;
  if (typeof judgeId !== "string") fail("HITL qualification requires an Interaction Judge", "interaction_judge_missing");
  let profile = runProfile.qualificationJudgeProfile ?? (runProfile.executionContract ? contractProfile(runProfile.executionContract, judgeId) : null);
  if (!profile) {
    const declaration = await loadProfile(judgeId);
    // Qualification resolves only its Judge: Subject fixes cannot invalidate it.
    const contract = await resolveExecutionContract({ runProfile: { subject: { profile_id: declaration.value.id } },
      loadProfile: async id => id === declaration.value.id ? declaration : loadProfile(id),
      configHome: profileConfigHome() });
    profile = contractProfile(contract, declaration.value.id);
  }
  const tasks = Object.fromEntries(corpus.items.map(item => {
    const stage = item.stage ?? corpus.stage, context = contexts[item.id];
    const identity = qualificationTask({ stage, question: item.question, responses: fixtures[stage].responses,
      context: context ? semanticContextHash(context.context) : null, grounding: contextGrounding(context?.binding), profile, requiredResult: packets[item.id].required_result,
      ...(compact ? { prompt: hashJson({ template: interactionCoveragePrompt(packets[item.id], "<packet>"), projection: "dd-eval/hitl-coverage-input@1" }) } : {}) });
    return [item.id, { identity, key: hashJson(identity) }];
  }));
  if (compact && new Set(Object.values(packets).map(packet => hashJson(hitlCoverageInput(packet)))).size !== corpus.items.length) fail("Compact calibration and holdout require distinct semantic inputs", "definition_qualification_invalid");
  const identity = { contract: hitlQualificationContract, case_id: loaded.value.id,
    items: corpus.items.map(({ id, classification, response_ids, status, expected_coverage, coverage_expectation }) => ({ id, native_key: tasks[id].key, classification, response_ids, ...(status === undefined ? {} : { status }), ...(compact ? { coverage_expectation } : { expected_coverage }) })),
    validator: compact ? hitlCoverageContract : hitlMatchContract,
    oracle_sha256: sha256(await readRegularFile(path.join(repoRoot, "lib", "hitl-corpus.mjs"))),
    validator_sha256: sha256(await readRegularFile(path.join(repoRoot, "lib", "hitl-contract.mjs"))),
    draft_checker_sha256: sha256(await readRegularFile(path.join(repoRoot, "bin", "check-hitl-draft.mjs"))) };
  const key = hashJson(identity);
  return { compact, corpus, fixtures, contexts, tasks, identity, key, profile, provenance: { definition, judge_profile: profile, corpus_sha256: selected.sha256 }, root: path.join(hitlQualificationHome(), key) };
}
/** Verify the complete retained qualification and all native samples. */
export async function assertHitlQualification(input) {
  const qualified = await hitlQualificationInputs(input);
  if (!qualified) return null;
  const file = path.join(qualified.root, "receipt.json");
  const receipt = await readJson(file).catch(error => {
    if (error.code === "ENOENT") fail(`HITL definition has no qualification receipt; run runner definition qualify --profile <profile>: ${qualified.key}`, "definition_qualification_missing");
    fail(`HITL definition qualification receipt cannot be read: ${error.message}`, "definition_qualification_invalid");
  });
  const { immutable_hash, ...content } = receipt;
  if (receipt.schema_id !== hitlQualificationContract || receipt.key !== qualified.key || receipt.status !== "passed" || hashJson(receipt.identity) !== qualified.key || hashJson(content) !== immutable_hash || receipt.results?.length !== qualified.corpus.items.length || receipt.results.some((item, index) => item.id !== qualified.corpus.items[index].id || (item.stage ?? qualified.corpus.stage) !== (qualified.corpus.items[index].stage ?? qualified.corpus.stage) || item.passed !== true)) fail("HITL definition qualification is stale or invalid", "definition_qualification_invalid");
  for (const [index, item] of receipt.results.entries()) {
    if (!Array.isArray(item.samples) || !item.samples.length || item.native_key !== qualified.tasks[item.id].key) fail("HITL item has no bound native observations", "definition_qualification_invalid");
    for (const sample of item.samples) await verifyQualificationSample(qualified, qualified.corpus.items[index], sample);
  }
  return { key: qualified.key, file, sha256: immutable_hash };
}
