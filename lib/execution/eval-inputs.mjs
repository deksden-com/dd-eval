import path from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import { assertCompletionScopes } from "../completion-scope.mjs";
import { validateHarnessProfile, validateRunProfile } from "../profile-validation.mjs";
import { validateExecutionContract } from "../execution-contract.mjs";
import { validateCaseBlueprint, validateEntryPack } from "../flow-boundaries.mjs";
import { contained } from "../contained-path.mjs";
import { readJson, parseJsonBytes } from "../json-file.mjs";
import { readRegularFile } from "../regular-file.mjs";
import { assertFinalJudgeScope } from "../judge/final-judge-contract.mjs";
import { interactionFixtureManifest, executionStages, assertInteractionJudgePreflight } from "../hitl/interaction-fixtures.mjs";
import { resolveRunContract } from "./run-contract-resolution.mjs";
import { selectedEntries, validateExecutionDescriptors, prepareFocusedEntries } from "./selection.mjs";
import { assertProfileCapacity } from "./profile-capacity.mjs";

const repoRoot = fileURLToPath(new URL("../../", import.meta.url));
const sha256 = value => createHash("sha256").update(value).digest("hex");
const fail = (message, code) => { throw Object.assign(new Error(message), { code }); };

/** Validate and bind the retained inputs used to construct an EVAL manifest. */
export async function prepareEvalInputs({ runProfile, profile, loaded, validated, executions: suppliedExecutions, suppliedPack }) {
  validateRunProfile(runProfile?.value);
  validateHarnessProfile(profile);
  if (loaded?.value?.id !== runProfile.value.case_id || profile.id !== runProfile.value.subject.profile_id) fail("EVAL input profiles belong to another case or subject", "control_input_invalid");
  const executions = suppliedExecutions ?? selectedEntries({ ...runProfile.value, case_terminal_stage: loaded.value.flow.terminal_stage, case_contour: loaded.value.flow.contour });
  const executionContract = runProfile.executionContract ?? await resolveRunContract(runProfile, executionStages(executions, loaded.value.flow.contour), loaded);
  validateExecutionContract(executionContract);
  runProfile.executionContract = executionContract;
  validateExecutionDescriptors(executions, loaded.value.flow.contour);
  assertCompletionScopes(runProfile.value, executions, loaded.value.flow);
  assertFinalJudgeScope({ profile: runProfile.value, executions, assessment: loaded.assessment });
  assertProfileCapacity(profile, executions, executionContract);
  const interactionFixtures = await interactionFixtureManifest(loaded.root, executions, null, loaded.value.flow.contour);
  await assertInteractionJudgePreflight({ caseRoot: loaded.root, executions, runProfile, flowContour: loaded.value.flow.contour });
  const directBlueprint = executions.some(execution => execution.mode === "e2e") ? validateCaseBlueprint(await readJson(path.join(loaded.root, "entry-pack-source", "stage-context.json")), loaded) : null;
  const packBytes = validated ? (suppliedPack ? Buffer.from(`${JSON.stringify(suppliedPack, null, 2)}\n`) : await readRegularFile(validated.entry_pack)) : null;
  const pack = packBytes ? validateEntryPack(parseJsonBytes(packBytes, validated.entry_pack), loaded.value.id, loaded.value.flow) : null;
  const packRoot = validated ? path.dirname(validated.entry_pack) : null;
  const blueprint = pack ? validateCaseBlueprint(await readJson(contained(packRoot, pack.stage_context, "stage_context")), loaded) : null;
  const entryPackManifest = validated ? { revision: validated.revision, file: path.relative(repoRoot, validated.entry_pack), sha256: sha256(packBytes) } : null;
  const focusedEntries = await prepareFocusedEntries(executions, pack, packRoot);
  return { executions, interactionFixtures, directBlueprint, blueprint, pack, packRoot, entryPackManifest, focusedEntries, executionContract };
}
