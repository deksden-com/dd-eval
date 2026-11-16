import { stages } from "./entry-pack.mjs";
import { flowStageCatalog } from "./flow-boundaries.mjs";
import { harnessConfigKey } from "./driver-bindings.mjs";
import { validateExecutionContract, contractProfile, profileSemanticHash } from "./execution-contract.mjs";
import { executionStages } from "./interaction-fixtures.mjs";

const fail = (message, code = "validation") => { const error = new Error(message); error.code = code; throw error; };

export function qualifiedNativeFanoutCapacity(stage, selected, profile, flowContour = stages) {
  const catalog = flowStageCatalog(flowContour);
  if (!catalog.includes(stage)) fail('Native capacity stage is outside the selected flow catalog', 'selection_invalid');
  if (selected?.delegation?.mode !== 'native'
    || !['plan', 'plan-review', 'code', 'code-review', 'compose', 'review'].includes(stage)) return null;
  const coordinator = selected.coordinator;
  if (!coordinator || harnessConfigKey(coordinator.harness) !== harnessConfigKey(profile.harness)
    || coordinator.model !== profile.model || coordinator.reasoning !== profile.reasoning
    || !Number.isInteger(profile.subagent_capacity) || profile.subagent_capacity < 1 || profile.subagent_capacity > 15) {
    fail('Native capacity is not qualified for the selected stage profile', 'subagent_capacity_unqualified');
  }
  return profile.subagent_capacity;
}

function executionMayFanOut(execution) {
  const from = stages.indexOf(execution.stage); const to = stages.indexOf(execution.terminal_stage);
  return ["plan-review", "code", "code-review"].some((stage) => stages.indexOf(stage) >= from && stages.indexOf(stage) <= to);
}

export function qualifiedCoordinator(coordinator, contract, fallback) {
  if (!coordinator || typeof coordinator.id !== "string") fail("Native stage has no identified coordinator", "subagent_capacity_unqualified");
  if (contract) {
    const profile = contractProfile(contract, coordinator.id);
    if (profileSemanticHash(coordinator) !== contract.profile_sha256[coordinator.id]) fail("Coordinator differs from retained execution contract", "profile_contract_mismatch");
    return profile;
  }
  if (!fallback || harnessConfigKey(coordinator.harness) !== harnessConfigKey(fallback.harness)
    || ["model", "reasoning", "provider", "mode", "permission"].some(key => fallback[key] !== undefined && coordinator[key] !== fallback[key])) fail("Legacy coordinator lacks matching retained qualification", "subagent_capacity_unqualified");
  return fallback;
}

export function assertProfileCapacity(profile, executions, contract = null) {
  const candidates = new Map();
  if (contract) {
    validateExecutionContract(contract);
    if (contract.generic_execution) {
      if (contract.routing.delegation.mode === "native") {
        const reachable = executionStages(executions, contract.generic_execution.contour);
        for (const stage of reachable.filter(stage => ["compose", "review"].includes(stage))) {
          const id = contract.routing.stage_profiles[stage];
          candidates.set(id, contractProfile(contract, id));
        }
      }
    } else {
    for (const execution of executions) {
      const from = stages.indexOf(execution.stage), to = stages.indexOf(execution.terminal_stage);
      for (const stage of ["plan-review", "code", "code-review"].filter(stage => stages.indexOf(stage) >= from && stages.indexOf(stage) <= to)) {
        const override = contract.routing.stage_overrides?.[stage];
        const delegation = override?.delegation ?? contract.routing.delegation ?? { mode: "native" };
        if (delegation.mode === "external") continue;
        const id = override?.agent_profile_id ?? contract.routing.agent_profile_id;
        candidates.set(id, contractProfile(contract, id));
      }
    }
    }
  } else if (executions.some(executionMayFanOut)) candidates.set(profile.id, profile);
  for (const candidate of candidates.values()) {
    if (Number.isInteger(candidate.subagent_capacity) && candidate.subagent_capacity > 0) continue;
    const error = new Error(`selected contour may create native children but profile ${candidate.id} has no qualified subagent capacity`);
    error.code = "subagent_capacity_unqualified";
    error.details = { profile_id: candidate.id, next_command: `dd-eval harness capacity check --profile ${candidate.id} --max 15 --project-root <project-root>` };
    throw error;
  }
}
