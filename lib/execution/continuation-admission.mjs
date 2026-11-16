import path from "node:path";
import { assertCompletionScopes } from "./selection-scope.mjs";
import { loadCase } from "../cases/load-case.mjs";
import { assertRetainedRunDefinition } from "../cases/definition-identity.mjs";
import { runnerEntry } from "../cases/runner-entry.mjs";
import { stages } from "../entry-pack.mjs";
import { validateExecutionContract } from "../execution-contract.mjs";
import { validateCaseBlueprint } from "../flow-boundaries.mjs";
import { assertInteractionJudgePreflight } from "../hitl/interaction-fixtures.mjs";
import { assertFinalJudgeScope } from "../judge/final-judge-contract.mjs";
import { readJson } from "../json-file.mjs";
import { validateHarnessProfile, validateRunProfile } from "../profile-validation.mjs";
import { executionState } from "./execution-state.mjs";
import { infrastructureQueueStopped, terminalExecution } from "./infrastructure-stop.mjs";
import { assertProfileCapacity } from "./profile-capacity.mjs";
import { terminalOperation } from "./result-projection.mjs";
import { prepareFocusedEntries, validateExecutionDescriptorShape, validateExecutionDescriptors } from "./selection.mjs";

const isObject = value => Boolean(value) && typeof value === "object" && !Array.isArray(value);
const fail = (message, code = "validation") => { throw Object.assign(new Error(message), { code }); };

/** Read-only continuation admission. Terminal operations need cleanup, not new-launch inputs. */
export async function prepareRunnerContinuation(manifest, events = null, evalRoot = null) {
  if (!manifest || !Array.isArray(manifest.executions) || !manifest.executions.length) fail("Invalid EVAL manifest", "control_input_invalid");
  // Cleanup needs retained operation identities, not current launch profiles
  // or a newly valid productive manifest. Keep that decision identical for
  // detached and in-process continuation.
  if (events) {
    const stopped = await infrastructureQueueStopped(events, manifest, evalRoot);
    if (manifest.executions.every(execution => {
      if (!execution?.id) return false;
      const state = executionState(events, manifest.run_id, execution);
      return terminalExecution(events, manifest, execution) || stopped && !state.started
        && state.operation_id === `${manifest.run_id}:${execution.id}:launch` && state.result.state === "awaiting_provider";
    })) return null;
  }
  if (manifest.schema_id !== "dd-eval/runner-manifest@1" || typeof manifest.case_id !== "string") fail("Invalid productive EVAL manifest", "control_input_invalid");
  validateExecutionDescriptorShape(manifest.executions);
  if (!isObject(manifest.profile) || !isObject(manifest.subject_profile)) fail("Productive EVAL manifest lacks its retained profiles", "control_input_invalid");
  validateRunProfile(manifest.profile);
  validateHarnessProfile(manifest.subject_profile);
  if (manifest.execution_contract) validateExecutionContract(manifest.execution_contract);
  if (manifest.case_id !== manifest.profile.case_id || manifest.profile.subject.profile_id !== manifest.subject_profile.id) fail("EVAL profile scope differs from its manifest", "control_input_invalid");
  const loaded = await loadCase(manifest.case_id);
  validateExecutionDescriptors(manifest.executions, loaded.value.flow.contour);
  assertCompletionScopes(manifest.profile, manifest.executions, loaded.value.flow);
  assertFinalJudgeScope({ profile: manifest.profile, executions: manifest.executions, assessment: loaded.assessment });
  await assertRetainedRunDefinition(manifest, loaded);
  const entry = await runnerEntry(manifest, loaded);
  const directBlueprint = manifest.executions.some(execution => execution.mode === "e2e") ? entry.pack ? validateCaseBlueprint(await readJson(path.join(loaded.root, "entry-pack-source", "stage-context.json")), loaded) : entry.blueprint : null;
  const unstarted = manifest.executions.filter(execution => !events || !terminalOperation(events, `${manifest.run_id}:${execution.id}:launch`)?.started);
  const focusedEntries = manifest.kind === "derived" ? {} : await prepareFocusedEntries(unstarted, entry.pack, entry.packRoot);
  assertProfileCapacity(manifest.subject_profile, manifest.executions, manifest.execution_contract);
  await assertInteractionJudgePreflight({ caseRoot: loaded.root, executions: manifest.executions, runProfile: { value: manifest.profile }, flowContour: loaded.value?.flow?.contour ?? stages });
  return { loaded, ...entry, directBlueprint, focusedEntries };
}
