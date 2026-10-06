import { readFile, mkdtemp, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { buildHitlPacket, validateHitlPacket } from '../lib/hitl-contract.mjs';
import { compareHitlExpectation, validateExpectedAtoms } from '../lib/hitl-corpus.mjs';
import { hashJson, writeJsonAtomic } from '../lib/runner-events.mjs';
import { interactionJudge, loadRunProfile, loadCase, committedDefinitionIdentity,
  hitlQualificationInputs, materializeQualificationContext } from '../lib/runner.mjs';

const json = async file => JSON.parse(await readFile(file, 'utf8'));
function invalid(message) { throw Object.assign(new Error(message), { code: 'judge_context_invalid' }); }

export function referencePairTrials(packets, expectations) {
  if (!Array.isArray(packets) || packets.length !== 2) invalid('Reference pair needs two frozen packets');
  packets.forEach(packet => validateHitlPacket(packet));
  if (packets[0].question !== packets[1].question || packets[0].stage !== packets[1].stage ||
      hashJson(packets[0].responses) !== hashJson(packets[1].responses)) invalid('Reference pair question/stage/canonical response identity differs');
  if (expectations?.unresolved?.classification !== 'ambiguous' || expectations?.resolved?.classification !== 'covered_by_canonical_response') invalid('Reference pair must explicitly expect unresolved ambiguity and resolved coverage');
  return Array.from({ length: 3 }, (_, index) => ['unresolved', 'resolved'].map((label, i) => ({ label: `${label}-${index + 1}`, packet: packets[i], expected: expectations[label] }))).flat();
}

/** All inputs, expectations and frozen source identities are checked before any native call. */
export async function assertSmokeTrials(trials) {
  if (!Array.isArray(trials) || !trials.length) invalid('Smoke needs explicit authored trials');
  const labels = new Set();
  for (const trial of trials) {
    if (typeof trial.label !== 'string' || !trial.label || labels.has(trial.label)) invalid('Smoke trial identity is invalid');
    labels.add(trial.label);
    validateHitlPacket(trial.packet);
    if (trial.expected?.question !== trial.packet.question) invalid('Smoke expectation/question identity differs');
    validateExpectedAtoms(trial.expected, { responses: trial.packet.responses, coverageRequired: true });
    const rebuilt = await buildHitlPacket({ stage: trial.packet.stage, question: trial.packet.question,
      subjectContext: trial.packet.subject_context, responses: trial.packet.responses });
    if (trial.packet.hitl_binding) rebuilt.hitl_binding = structuredClone(trial.packet.hitl_binding);
    if (hashJson(rebuilt) !== hashJson(trial.packet)) invalid('Frozen smoke packet grounding changed');
  }
}

/** No retry-until-PASS: the schedule is fixed, and the first failure stops dispatch. */
export async function runSmokeTrials({ trials, attempt, runProfile, runtimeRoot, projectRoot, invoke = interactionJudge }) {
  await assertSmokeTrials(trials);
  const results = [], resultsFile = path.join(attempt, 'results.json');
  for (const trial of trials) {
    // Detect changes since the initial whole-schedule admission, before this Session too.
    await assertSmokeTrials([trial]);
    const trialAttempt = path.join(attempt, trial.label);
    await mkdir(trialAttempt, { recursive: true });
    const contextFile = trial.packet.subject_context === null ? null : path.join(trialAttempt, 'subject-context.json');
    if (contextFile) await writeJsonAtomic(contextFile, trial.packet.subject_context);
    try {
      const result = await invoke({ runProfile, fixture: { responses: trial.packet.responses, sha256: hashJson(trial.packet.responses) },
        question: trial.packet.question, attempt: trialAttempt, stage: trial.packet.stage, contextFile,
        projectRoot, runtimeRoot, hitlBinding: trial.packet.hitl_binding ?? null, expectedPacket: trial.packet });
      const comparison = compareHitlExpectation(trial.expected, result.verdict, { responses: trial.packet.responses, coverageRequired: true });
      results.push({ label: trial.label, comparison, verdict: result.verdict, receipt_file: result.receipt_file });
      await writeJsonAtomic(resultsFile, results);
      if (!comparison.passed) throw Object.assign(new Error(`Judge verdict differs from authored expectation: ${trial.label}`), {
        code: 'definition_qualification_mismatch', details: { item_id: trial.expected.id, comparison, receipt_file: result.receipt_file, results_file: resultsFile } });
    } catch (error) {
      // Preserve a native receipt even when its cleanup failed; do not create a replacement Turn.
      const retained = error.details?.retained_verdict;
      if (results.at(-1)?.label !== trial.label) {
        const verdict = retained?.verdict?.verdict;
        results.push({ label: trial.label, ...(verdict ? { verdict, receipt_file: retained.receipt_file,
          comparison: compareHitlExpectation(trial.expected, verdict, { responses: trial.packet.responses, coverageRequired: true }) } : {}),
          error: { code: error.code, message: error.message } });
      }
      await writeJsonAtomic(resultsFile, results);
      throw error;
    }
  }
  return { attempt, results_file: resultsFile, results };
}

export async function main(args = process.argv.slice(2)) {
  const mode = args[0];
  if (mode !== '--corpus' && mode !== '--pair') invalid('Use --corpus <run-profile> <runtime-root> <project-root>, or --pair <unresolved-packet> <resolved-packet> <expectations.json> <judge-profile> <runtime-root> <project-root>. Implicit audit-gap smoke is unsupported.');
  const attempt = await mkdtemp(path.join(tmpdir(), 'dd-eval-hitl-smoke-'));
  let trials, runProfile, runtimeRoot, projectRoot;
  if (mode === '--corpus') {
    if (args.length !== 4) invalid('Usage: --corpus <run-profile> <runtime-root> <project-root>');
    runProfile = await loadRunProfile(args[1]);
    const loaded = await loadCase(runProfile.value.case_id);
    const qualified = await hitlQualificationInputs({ loaded, runProfile, definition: await committedDefinitionIdentity() });
    if (!qualified) invalid('Case has no authored HITL qualification corpus');
    trials = [];
    for (const [index, item] of qualified.corpus.items.entries()) {
      const stage = item.stage ?? qualified.corpus.stage;
      const context = await materializeQualificationContext({ qualified, item, caseRoot: loaded.root, output: path.join(attempt, 'contexts', `${index}.json`) });
      const packet = await buildHitlPacket({ stage, question: item.question,
        subjectContext: context ? await json(context.path) : null, responses: qualified.fixtures[stage].responses });
      trials.push({ label: `item-${index + 1}`, packet, expected: item });
    }
    [runtimeRoot, projectRoot] = args.slice(2);
  } else {
    if (args.length !== 7) invalid('Usage: --pair <unresolved-packet> <resolved-packet> <expectations.json> <judge-profile> <runtime-root> <project-root>');
    const packets = [await json(args[1]), await json(args[2])], expectations = await json(args[3]);
    trials = referencePairTrials(packets, expectations);
    runProfile = { value: { interaction_judge: { profile_id: args[4] } } };
    [runtimeRoot, projectRoot] = args.slice(5);
  }
  console.log(JSON.stringify({ attempt, mode, trials: trials.length }));
  const result = await runSmokeTrials({ trials, attempt, runProfile, runtimeRoot: path.resolve(runtimeRoot), projectRoot: path.resolve(projectRoot) });
  console.log(JSON.stringify(result));
  return result;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) await main();
