import path from "node:path";
import { mkdir, stat } from "node:fs/promises";
import { loadCapacityPolicy } from "../capacity-policy.mjs";
import { provisionRuntimeEngine } from "../execution/runtime-provision.mjs";
import { observeJev, coverageFingerprint, calibrateJev, selectJevThreshold, jevRequest } from "../hitl-coverage.mjs";
import { readJson } from "../json-file.mjs";
import { readRegularFile } from "../regular-file.mjs";
import { hashJson, sha256, writeJsonAtomic } from "../runner-events.mjs";
import { withRunnerLock } from "../runner-lock.mjs";
import { hitlQualificationHome } from "./qualification-home.mjs";

const fail = (message, code = "validation") => { throw Object.assign(new Error(message), { code }); };
async function exists(file) { try { await stat(file); return true; } catch { return false; } }

/** Qualify a classifier using retained native samples and a frozen holdout. */
export async function qualifyCoverageFilter(input, results, policy, { runtimeRoot: suppliedRuntimeRoot = null } = {}) {
  const classifier = coverageFingerprint(policy), corpusHash = hashJson(input.corpus);
  const root = path.join(hitlQualificationHome(), "coverage-candidates", classifier, corpusHash);
  const frozen = { schema_id: "dd-eval/hitl-coverage-batch@1", classifier_sha256: classifier, corpus: input.corpus };
  await mkdir(root, { recursive: true });
  const batchFile = path.join(root, "batch.json");
  if (await exists(batchFile)) { if (hashJson(await readJson(batchFile)) !== hashJson(frozen)) fail("Coverage batch changed", "coverage_calibration_invalid"); }
  else await writeJsonAtomic(batchFile, frozen);
  const heldoutItems = input.corpus.items.filter(item => item.partition === "heldout");
  if (heldoutItems.length < 20 || heldoutItems.filter(item => item.coverage_expectation.status === "covered").length < 10
    || heldoutItems.filter(item => item.coverage_expectation.status !== "covered").length < 10) fail("Coverage holdout needs twenty distinct balanced cases", "coverage_calibration_invalid");
  // Identity is the actual frozen semantic input, not an editable case ID or
  // expected label. Renaming/relabeling a used case cannot make a new holdout.
  const packets = new Map(), semanticInputs = new Set();
  for (const item of input.corpus.items) {
    const native = results.find(result => result.id === item.id)?.samples[0];
    if (!native) fail("Coverage sample has no qualified native reference", "coverage_calibration_invalid");
    const packet = await readJson(path.join(path.dirname(native.receipt_file), "packet.json"));
    const semanticHash = hashJson(jevRequest(packet, policy).state);
    if (semanticInputs.has(semanticHash)) fail("Calibration and holdout require distinct semantic inputs", "coverage_calibration_invalid");
    semanticInputs.add(semanticHash); packets.set(item.id, packet);
  }
  const claimRoot = path.join(hitlQualificationHome(), "coverage-holdouts");
  await mkdir(claimRoot, { recursive: true });
  for (const item of heldoutItems) {
    const claimFile = path.join(claimRoot, `${hashJson(jevRequest(packets.get(item.id), policy).state)}.json`);
    await withRunnerLock(claimFile, async () => {
      if (await exists(claimFile)) { if ((await readJson(claimFile)).classifier_sha256 !== classifier) fail("Changed classifier requires a new holdout batch", "coverage_calibration_invalid"); }
      else await writeJsonAtomic(claimFile, { classifier_sha256: classifier, corpus_sha256: corpusHash });
    });
  }
  const sample = async item => {
    const native = results.find(result => result.id === item.id)?.samples[0];
    if (!native) fail("Coverage sample has no qualified native reference", "coverage_calibration_invalid");
    const packet = packets.get(item.id);
    // HTTP input does not depend on the fallback Judge profile/task identity.
    // Retain the first full packet for this request; later qualifications can
    // reuse it only when their effective wire request is exactly unchanged.
    const requestHash = hashJson(jevRequest(packet, policy));
    const requestRoot = path.join(hitlQualificationHome(), "coverage-observations", classifier, requestHash);
    const packetFile = path.join(requestRoot, "packet.json");
    await mkdir(requestRoot, { recursive: true });
    await withRunnerLock(packetFile, async () => {
      if (await exists(packetFile)) {
        if (hashJson(jevRequest(await readJson(packetFile), policy)) !== requestHash) fail("Retained JEV qualification input changed", "coverage_calibration_invalid");
      } else await writeJsonAtomic(packetFile, packet);
    });
    const retainedPacket = await readJson(packetFile);
    const observations = [];
    for (let repetition = 0; repetition < 3; repetition++) {
      const binding = { request_sha256: requestHash, repetition };
      const observationRoot = path.join(requestRoot, `repeat-${repetition}`);
      let capacityPolicy = null;
      if (!await exists(path.join(observationRoot, "jev-observation.json"))) {
        const runtimeRoot = suppliedRuntimeRoot ?? path.join(root, "runtime");
        if (!await exists(path.join(runtimeRoot, "harness-runtime"))) await provisionRuntimeEngine(root, runtimeRoot);
        capacityPolicy = await loadCapacityPolicy(runtimeRoot);
      }
      const observed = await observeJev({ root: observationRoot, packet: retainedPacket, policy, binding, capacityPolicy });
      if (observed.state !== "completed") fail(`Coverage observation not completed: ${item.id}: ${observed.reason}`, "coverage_qualification_incomplete");
      observations.push({ file: observed.file, sha256: sha256(await readRegularFile(observed.file)), probability: observed.probability, latency_ms: observed.latency_ms, usage: observed.response.usage ?? null });
    }
    return { id: item.id, expected: item.coverage_expectation.status, packet_file: packetFile, packet_sha256: hashJson(retainedPacket), probabilities: observations.map(observed => observed.probability), observations };
  };
  const calibration = [];
  for (const item of input.corpus.items.filter(item => item.partition === "calibration")) calibration.push(await sample(item));
  const threshold = selectJevThreshold(calibration), decision = { classifier_sha256: classifier, calibration, threshold };
  const decisionFile = path.join(root, "calibration-decision.json");
  if (await exists(decisionFile)) { if (hashJson(await readJson(decisionFile)) !== hashJson(decision)) fail("Frozen threshold cannot be retuned", "coverage_calibration_invalid"); }
  else await writeJsonAtomic(decisionFile, decision);
  const heldout = [];
  for (const item of heldoutItems) heldout.push(await sample(item));
  const receipt = { ...calibrateJev(calibration, heldout, policy), corpus_sha256: input.provenance.corpus_sha256, native_qualification_key: input.key };
  await writeJsonAtomic(path.join(root, "assessment.json"), receipt);
  if (receipt.status !== "passed") fail("Coverage holdout did not pass; retain Judge-only/shadow mode", "coverage_qualification_failed");
  const bytes = `${JSON.stringify(receipt, null, 2)}\n`, digest = sha256(bytes);
  await writeJsonAtomic(path.join(hitlQualificationHome(), "coverage", `${digest}.json`), receipt);
  return { status: "passed", qualification_sha256: digest, threshold, classifier_sha256: classifier };
}
