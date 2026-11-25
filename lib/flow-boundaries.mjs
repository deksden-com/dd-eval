import { stages, validateFlowContour, validateStageBlueprint, materializeStageSlice } from "./entry-pack.mjs";
import { isInstalledFlow } from "./installed-flows.mjs";

const stageSet = new Set(stages);
const isObject = value => Boolean(value) && typeof value === "object" && !Array.isArray(value);
const fail = (message, code = "validation") => { const error = new Error(message); error.code = code; throw error; };

export function validateEntryPack(value, caseId, expectedFlow = null) {
  if (!isObject(value) || value.schema_id !== "dd-eval/entry-pack@1" || value.case_id !== caseId || !/^REV-\d+$/.test(value.revision ?? "")) fail("invalid entry-pack");
  if (typeof value.stage_context !== "string" || !isObject(value.entries)) fail("entry-pack has incomplete descriptors");
  if (!isObject(value.flow)) fail("entry-pack has an invalid flow contour");
  const contour = validateFlowContour(value.flow.contour);
  if (expectedFlow) {
    const expected = validateFlowContour(expectedFlow.contour);
    if (JSON.stringify(contour) !== JSON.stringify(expected) || value.flow.terminal_stage !== expectedFlow.terminal_stage) fail("entry-pack flow does not match the case contour", "entry_pack_flow_mismatch");
  } else if (contour.some(stage => !stageSet.has(stage))) fail("entry-pack has an invalid flow contour");
  if (!contour.includes(value.flow.terminal_stage)) fail("entry-pack terminal stage is outside its flow contour");
  for (const stage of value.flow.contour) if (typeof value.entries[stage] !== "string") fail(`entry-pack misses focused ${stage}`);
  return value;
}

export function flowStageCatalog(flowContour) {
  const declared = validateFlowContour(flowContour);
  return declared.every(stage => stageSet.has(stage)) ? stages : declared;
}

export function inheritedFlowStages(stage, flowContour = stages) {
  const catalog = flowStageCatalog(flowContour), index = catalog.indexOf(stage);
  if (index < 0) fail('Fork stage is outside the selected flow catalog', 'fork_checkpoint_invalid');
  return catalog.slice(0, index);
}

/** Use the latest accepted pack visit, preserving its visit/attempt identity. */
export function acceptedPackVisit(status, stage) {
  const state=status?.index?.pack_state, run=status?.run, visits=state?.visits;
  if (state?.schema_id!=='dd-flow/run-state@1' || state.run_id!==run?.id || state.project_id!==run?.project_id
    || typeof state.pack?.flow_id!=='string' || !/^[a-f0-9]{64}$/.test(state.pack?.sha256 ?? '') || !Array.isArray(visits)) return null;
  const counts=new Map();
  for (const visit of visits) {
    if (!visit || typeof visit.stage!=='string' || !/^[a-z][a-z0-9-]*$/.test(visit.stage)
      || !Number.isSafeInteger(visit.visit) || visit.visit!==(counts.get(visit.stage) ?? 0)+1
      || !Number.isSafeInteger(visit.attempt) || visit.attempt<1) return null;
    counts.set(visit.stage,visit.visit);
  }
  const accepted=visits.filter(item=>item?.status==='done'), last=accepted.at(-1), active=visits.filter(item=>item?.status!=='done'), cursor=state.cursor;
  if (!last || last.stage!==stage || !Number.isSafeInteger(last.visit) || last.visit<1 || !Number.isSafeInteger(last.attempt) || last.attempt<1
    || typeof last.outcome!=='string' || !last.outcome || last.result!==`run://${stage}/${last.visit}/result.json`) return null;
  if (cursor?.terminal) { if (active.length || visits.at(-1)!==last) return null; }
  else if (!cursor || active.length!==1 || visits.at(-1)!==active[0] || active[0]?.status!=='running'
    || active[0].stage!==cursor.stage || active[0].visit!==cursor.visit) return null;
  return last;
}

export function initialFlowBoundary(loaded) {
  const catalog = flowStageCatalog(loaded.value.flow.contour);
  const stage = catalog[0];
  const flow = loaded.value.flow.id ?? (stage === "specify" ? "sdlc" : null);
  if (flow !== "sdlc" && !isInstalledFlow(flow) || flow === "sdlc" && stage !== "specify" || isInstalledFlow(flow) && stage !== "preflight") fail("Case initial boundary does not identify a supported flow", "initial_flow_boundary_invalid");
  return { stage, flow };
}

export function validateCaseBlueprint(value, loaded) {
  return validateStageBlueprint(value, flowStageCatalog(loaded.value?.flow?.contour ?? stages));
}

export async function materializeCaseStageSlice(options, loaded) {
  return materializeStageSlice({ ...options, flowContour: flowStageCatalog(loaded.value?.flow?.contour ?? stages) });
}

export function continuationStage(lifecycle, completedStage, flowContour = stages) {
  const admitted = new Set(flowStageCatalog(flowContour));
  const projected = lifecycle?.status?.continuation;
  if (!projected) fail(`dd-flow omitted continuation after ${completedStage}`, "flow_reconciliation_failed");
  if (projected.kind === "terminal") return null;
  if (!["start_stage", "continue_stage"].includes(projected.kind) || !admitted.has(projected.stage)) {
    fail(`dd-flow did not expose a legal successor after ${completedStage}: ${projected.kind ?? "unknown"}`, "flow_reconciliation_failed");
  }
  return projected.stage;
}
