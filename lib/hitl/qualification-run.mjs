import path from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { mkdir, stat } from "node:fs/promises";
import { homesFile } from "../homes.mjs";
import { hashJson, writeJsonAtomic } from "../runner-events.mjs";
import { commandJson } from "../process-json.mjs";
import { errorRecord } from "../operation-errors.mjs";
import { observeJudgeCleanup } from "../judge/cleanup.mjs";
import { initialFlowBoundary } from "../flow-boundaries.mjs";
import { nativeOnlyRunProfile } from "../profile-validation.mjs";
import { withRunnerLock } from "../runner-lock.mjs";
import { captureDefinitionIdentity } from "../cases/definition-identity.mjs";
import { prepareE2EInput } from "../cases/materialize-input.mjs";
import { loadCase } from "../cases/load-case.mjs";
import { loadRunProfile } from "../cases/profile-loading.mjs";
import { prepareQualificationOwner, finishQualificationOwner } from "../harness/qualification-owner.mjs";
import { runtimeEngineIdentity } from "../execution/engine-snapshot.mjs";
import { provisionRuntimeEngine } from "../execution/runtime-provision.mjs";
import { evalHome, runtimeBin, runtimeEnv } from "../execution/runtime-environment.mjs";
import { executionBudget } from "../execution/execution-scheduling.mjs";
import { readJson } from "../json-file.mjs";
import { hitlQualificationHome } from "./qualification-home.mjs";
import { qualifyCoverageFilter } from "./coverage-qualification.mjs";
import { reassessHitlQualification } from "./qualification-reassessment.mjs";
import { hitlQualificationInputs, assertHitlQualification } from "./qualification-inputs.mjs";
import { hitlQualificationContract, qualificationComparison, qualificationMismatch } from "./qualification-contract.mjs";
import { qualificationSample } from "./judge-retained.mjs";
import { verifyQualificationSample } from "./qualification-sample.mjs";
import { interactionJudge } from "./interaction-judge.mjs";
import { materializeQualificationContext } from "./qualification-context.mjs";

const sha256 = value => createHash("sha256").update(value).digest("hex");
const fail = (message, code) => { throw Object.assign(new Error(message), { code }); };
async function exists(file) { try { await stat(file); return true; } catch { return false; } }

/** Explicit, non-scored Judge qualification; preflight itself never creates Sessions. */
export async function qualifyHitlDefinition({ profileFile }) {
  const runProfile = await loadRunProfile(profileFile);
  const loaded = await loadCase(runProfile.value.case_id);
  const definition = await captureDefinitionIdentity(loaded, runProfile);
  const input = await hitlQualificationInputs({ loaded, runProfile, definition });
  if (!input) fail("case does not declare a HITL qualification corpus", "definition_qualification_not_required");
  await mkdir(hitlQualificationHome(), { recursive: true });
  // Shared lock also fences overlapping corpus revisions from paying twice
  // for the same case. Different Subject harnesses share the same Judge tasks.
  return withRunnerLock(path.join(hitlQualificationHome(), "qualification"), async () => {
    const assessed = await reassessHitlQualification(input);
    for (const result of assessed.results) if (result.samples.length && !result.passed && !result.samples.every(sample => sample.comparison.semantic_review_required)) {
      const sample = result.samples.find(sample => !sample.comparison.passed), item = input.corpus.items.find(item => item.id === result.id);
      throw Object.assign(new Error(`Retained Judge verdict differs from current expectation: ${item.id}`), { code: "definition_qualification_mismatch", details: qualificationMismatch(input, item, result.stage, sample.assessment_observed, sample.comparison, sample.receipt_file) });
    }
    if (!assessed.missing.length && await exists(path.join(input.root, "receipt.json"))) return { status: "passed", native_calls: 0, ...(await assertHitlQualification({ loaded, runProfile, definition })), ...(runProfile.coveragePolicy ? { coverage: await qualifyCoverageFilter(input, assessed.results, runProfile.coveragePolicy) } : {}) };
    const attempt = path.join(input.root, `operation-${randomUUID()}`);
    const projectRoot = path.join(attempt, "project"); const runtimeRoot = path.join(attempt, "dd-flow-home");
    const results = assessed.results;
    let runtimeOwner = null, primaryError = null;
    await mkdir(attempt, { recursive: true });
    try {
      if (assessed.missing.length) {
        await mkdir(projectRoot, { recursive: true });
        await prepareE2EInput({ projectRoot, inputCheckpoint: loaded.inputCheckpoint, flowId: initialFlowBoundary(loaded).flow, integrationBranch: loaded.value.flow.git_policy?.integration_branch });
        input.provenance.engine = runtimeEngineIdentity(await provisionRuntimeEngine(projectRoot, runtimeRoot));
        await commandJson(runtimeBin(runtimeRoot), ["project", "register", "--root", projectRoot], { cwd: projectRoot, env: runtimeEnv(runtimeRoot) });
        runtimeOwner = await prepareQualificationOwner({ home: evalHome(), caseId: loaded.value.id, runtimeRoot,
          resourceHome: path.resolve(runtimeEnv(runtimeRoot).DD_FLOW_RESOURCE_HOME), registryFile: homesFile(),
          engine: input.provenance.engine, perHarness: executionBudget("qualification", runProfile.value).per_harness });
        for (const item of input.corpus.items.filter(item => assessed.missing.includes(item.id))) {
          const stage = item.stage ?? input.corpus.stage;
          const context = await materializeQualificationContext({ qualified: input, item, caseRoot: loaded.root, output: path.join(attempt, "contexts", `${sha256(item.id)}.json`) });
          const qualificationIntent = path.join(attempt, "native-intents", `${sha256(item.id)}.json`);
          await writeJsonAtomic(qualificationIntent, { schema_id: "dd-eval/qualification-intent@2", state: "prepared", id: item.id, native_key: input.tasks[item.id].key, identity: input.tasks[item.id].identity, provenance: input.provenance });
          let judgment;
          try { judgment = await interactionJudge({ runProfile: { ...nativeOnlyRunProfile(runProfile), qualificationJudgeProfile: input.profile }, fixture: input.fixtures[stage], question: item.question, attempt, stage, projectRoot, runtimeRoot, contextFile: context?.path ?? null, qualificationIntent, runtimeBudget: runtimeOwner.budget, resourceHome: runtimeOwner.resourceHome }); }
          catch (error) {
            const retained = error.details?.retained_verdict;
            if (retained?.verdict?.verdict) {
              const observed = retained.verdict.verdict;
              const comparison = await qualificationComparison(input, item, observed, retained.receipt_file);
              const result = results.find(result => result.id === item.id);
              try { result.samples.push(await qualificationSample({ id: item.id, observed, receipt_file: retained.receipt_file, cleanup: { status: "failed", error: errorRecord(error) } }, attempt, input.profile, input.fixtures[stage].sha256)); }
              catch (sampleError) { error.details = { ...error.details, native_observation_error: errorRecord(sampleError) }; }
              error.details = { ...error.details, ...(comparison.passed ? {} : { semantic_mismatch: { code: "definition_qualification_mismatch", message: `Judge verdict differs from authored expectation: ${item.id}`,
                details: qualificationMismatch(input, item, stage, observed, comparison, retained.receipt_file) } }) };
            }
            throw error;
          }
          const observed = judgment.verdict;
          const comparison = await qualificationComparison(input, item, observed, judgment.receipt_file);
          const cleanup = await observeJudgeCleanup(path.dirname(judgment.receipt_file), await readJson(judgment.receipt_file));
          const result = results.find(result => result.id === item.id);
          const sample = await qualificationSample({ id: item.id, observed, comparison, receipt_file: judgment.receipt_file, cleanup }, attempt, input.profile, input.fixtures[stage].sha256);
          result.samples.push(sample);
          await verifyQualificationSample(input, item, sample, { requirePassed: false });
          result.passed = comparison.passed;
          if (!comparison.passed && !comparison.semantic_review_required) throw Object.assign(new Error(`Judge verdict requires assessment: ${item.id}`), { code: "definition_qualification_mismatch", details: qualificationMismatch(input, item, stage, observed, comparison, judgment.receipt_file, judgment.packet_file) });
        }
        // Keep retained runtime/daemon ownership until ordinary scoped cleanup
        // has proved local retirement; archived qualification keys stay intact.
      }
      if (results.some(result => !result.passed)) throw Object.assign(new Error("Compact coverage needs bound semantic adjudication; native observations are retained, do not repeat them"), { code: "definition_qualification_review_required", details: { review_required: results.filter(result => !result.passed).map(result => {
        const item = input.corpus.items.find(item => item.id === result.id), sample = result.samples[0];
        return { id: item.id, receipt_file: sample.receipt_file, verdict: sample.assessment_observed ?? sample.observed, remaining_decisions: item.coverage_expectation.remaining_decisions,
          review_file: path.join(path.dirname(sample.receipt_file), "coverage-reviews", `${hashJson(item.coverage_expectation)}.json`) };
      }) } });
      const content = { schema_id: hitlQualificationContract, key: input.key, status: "passed", identity: input.identity, results, operation: attempt, cleanup: results.every(result => result.samples.every(sample => sample.cleanup?.status === 'settled')) ? 'settled' : 'pending', provenance: input.provenance };
      const receipt = { ...content, immutable_hash: hashJson(content) };
      await mkdir(input.root, { recursive: true });
      await writeJsonAtomic(path.join(input.root, "receipt.json"), receipt);
      return { status: "passed", key: input.key, receipt_file: path.join(input.root, "receipt.json"), native_calls: assessed.missing.length, reused_cases: results.length - assessed.missing.length, results,
        ...(runProfile.coveragePolicy ? { coverage: await qualifyCoverageFilter(input, results, runProfile.coveragePolicy) } : {}) };
    } catch (error) {
      primaryError = error;
      await mkdir(attempt, { recursive: true });
      await writeJsonAtomic(path.join(attempt, "failure.json"), { schema_id: hitlQualificationContract, key: input.key, identity: input.identity, provenance: input.provenance, operation: attempt, status: "failed", results, error: errorRecord(error) });
      throw error;
    } finally {
      if (runtimeOwner) {
        try { await finishQualificationOwner(runtimeOwner, primaryError); }
        catch (error) { if (primaryError) primaryError.cleanup_error ??= errorRecord(error); else throw error; }
      }
    }
  });
}

