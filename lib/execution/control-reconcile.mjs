import path from "node:path";
import { stat } from "node:fs/promises";
import { executionState } from "./execution-state.mjs";
import { assertJudgeVerdict } from "../judge-cleanup.mjs";
import { readJson } from "../json-file.mjs";
import { completeOperation, controlOperationInventory, hashJson, readEvents, reduceEvents } from "../runner-events.mjs";
import { withRunnerLock } from "../runner-lock.mjs";

const fail = (message, code = "validation") => { throw Object.assign(new Error(message), { code }); };
async function exists(file) { try { await stat(file); return true; } catch { return false; } }

/** Reconcile accepted late experiment results only. No provider observation,
 * capture, assessment, new operation, or productive resume occurs here. */
export async function runnerControlReconcile({ evalRoot, requestId }) {
  const root = path.resolve(evalRoot), eventsFile = path.join(root, "events.jsonl");
  return withRunnerLock(`${root}.lifecycle`, async () => {
    const manifest = await readJson(path.join(root, "manifest.json"));
    const assertControl = events => {
      const state = reduceEvents(events);
      if (!requestId || state.cancellation || state.control?.request_id !== requestId || !["pause", "stop"].includes(state.control.mode)) fail("Reconciliation requires the current operator request", "control_request_stale");
      return state;
    };
    const events = await readEvents(eventsFile), requested = assertControl(events).control;
    const inventory = controlOperationInventory(events, manifest.run_id), reconciled = [];
    for (const operation of inventory.operations.filter(item => item.disposition === "reconcile")) {
      if (operation.operation === "final_judge" && operation.execution_id === null) {
        const acceptedJudge = source => {
          const matches = source.filter(event => event.type === "dev.dd.eval.final_judge.result_ready" && event.data?.operation_id === operation.operation_id);
          const result = matches.at(-1)?.data.result;
          if (!result) return null;
          if (result.schema_id !== "dd-eval/final-judge-receipt@1" || !/^[a-f0-9]{64}$/.test(result.candidate_sha256) || operation.operation_id !== `${manifest.run_id}:judge:${result.candidate_sha256}` || matches.some(event => hashJson(event.data.result) !== hashJson(result))) fail("Accepted Judge result changed its operation identity", "journal_conflict");
          return result;
        };
        const result = acceptedJudge(events);
        if (!result) continue;
        const judgeRoot = await exists(path.join(root, "judge", "result.json")) && (await readJson(path.join(root, "judge", "result.json"))).candidate_sha256 === result.candidate_sha256
          ? path.join(root, "judge") : path.join(root, "judge", "revisions", result.candidate_sha256);
        await assertJudgeVerdict(judgeRoot, result);
        await completeOperation({ eventsFile, source: "dd-eval://runner", runId: manifest.run_id, operationId: operation.operation_id, operation: operation.operation, result, beforeAppend: latest => {
          controlOperationInventory(latest, manifest.run_id);
          if (assertControl(latest).control.request_sequence !== requested.request_sequence) fail("Operator request changed during reconciliation", "control_request_stale");
          if (hashJson(acceptedJudge(latest)) !== hashJson(result)) fail("Accepted Judge result changed during reconciliation", "journal_conflict");
        } });
        reconciled.push(operation.operation_id);
        continue;
      }
      const execution = manifest.executions.find(item => item.id === operation.execution_id);
      if (!execution) continue;
      const accepted = executionState(events, manifest.run_id, execution);
      if (accepted.operation_id !== operation.operation_id || accepted.cancellation?.effective || accepted.result.state !== "candidate_ready" || accepted.result.execution !== execution.id) continue;
      const resultHash = hashJson(accepted.result);
      await completeOperation({ eventsFile, source: "dd-eval://runner", runId: manifest.run_id, executionId: execution.id, operationId: operation.operation_id, operation: operation.operation, result: accepted.result, beforeAppend: latest => {
        controlOperationInventory(latest, manifest.run_id);
        if (assertControl(latest).control.request_sequence !== requested.request_sequence) fail("Operator request changed during reconciliation", "control_request_stale");
        const current = executionState(latest, manifest.run_id, execution);
        if (current.operation_id !== accepted.operation_id || current.generation !== accepted.generation || current.cancellation?.effective || hashJson(current.result) !== resultHash) fail("Accepted execution changed during reconciliation", "execution_generation_stale");
      } });
      reconciled.push(operation.operation_id);
    }
    const latest = await readEvents(eventsFile), state = assertControl(latest);
    return { root, run_id: manifest.run_id, request_id: requestId, state: state.state, reconciled, journal: controlOperationInventory(latest, manifest.run_id) };
  });
}
