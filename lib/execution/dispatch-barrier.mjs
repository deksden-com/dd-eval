import path from "node:path";
import { operationContext } from "../operation-context.mjs";
import { readJson } from "../json-file.mjs";
import { appendEvent, readEvents } from "../runner-events.mjs";
import { assertEvalExecutionDispatch } from "./admission.mjs";

const fail = (message, code) => { throw Object.assign(new Error(message), { code }); };

/** Fence dispatch against the current durable execution generation. */
export async function executionDispatchBarrier(operation, { record = true } = {}) {
  const context = operationContext.getStore();
  if (!context?.executionId || !context.eventsFile || !context.operationId?.includes(":launch")) return;
  const manifest = await readJson(path.join(path.dirname(context.eventsFile), "manifest.json"));
  const execution = manifest.executions.find(item => item.id === context.executionId);
  if (!execution) fail("dispatch has no execution identity", "execution_generation_stale");
  if (!record) return assertEvalExecutionDispatch(await readEvents(context.eventsFile), manifest.run_id, execution, context.operationId);
  await appendEvent(context.eventsFile, { source: "dd-eval://runner", runId: context.runId, executionId: context.executionId,
    type: "dev.dd.eval.execution.dispatch_accepted", data: { operation, execution_operation_id: context.operationId },
    beforeAppend: events => assertEvalExecutionDispatch(events, manifest.run_id, execution, context.operationId) });
}

/** Observe operator/generation fences while HTTP is in flight. Reading the
 * journal is not model progress and must not emit new dispatch events. */
export async function withExecutionAdmissionSignal(action) {
  const context = operationContext.getStore();
  if (!context?.executionId || !context.eventsFile || !context.operationId?.includes(":launch")) return action(undefined);
  const controller = new AbortController();
  const probe = async () => {
    const manifest = await readJson(path.join(path.dirname(context.eventsFile), "manifest.json"));
    const execution = manifest.executions.find(item => item.id === context.executionId);
    if (!execution) fail("HTTP dispatch lost its execution identity", "execution_generation_stale");
    assertEvalExecutionDispatch(await readEvents(context.eventsFile), manifest.run_id, execution, context.operationId);
  };
  await probe();
  let pending;
  const timer = setInterval(() => {
    if (!pending && !controller.signal.aborted) pending = probe().catch(error => controller.abort(error)).finally(() => { pending = null; });
  }, 1000);
  timer.unref();
  let result;
  try { result = await action(controller.signal); }
  finally { clearInterval(timer); await pending; }
  controller.signal.throwIfAborted();
  return result;
}

