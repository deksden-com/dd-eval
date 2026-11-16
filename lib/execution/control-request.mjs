import path from "node:path";
import { readFile } from "node:fs/promises";
import { evalRuntimeEnv } from "./runtime-environment.mjs";
import { commandJson } from "../process-json.mjs";
import { appendEvent, readEvents, reduceEvents, sha256 } from "../runner-events.mjs";

const fail = (message, code = "validation") => { throw Object.assign(new Error(message), { code }); };

/** Record and dispatch an idempotent pause or stop request for the EVAL scope. */
export async function runnerControlRequest({ evalRoot, requestId, mode }) {
  if (!["pause", "stop"].includes(mode) || typeof requestId !== "string" || !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(requestId)) fail("Control requires pause or stop and a bounded request identity", "control_request_invalid");
  const root = path.resolve(evalRoot), manifestPath = path.join(root, "manifest.json"), manifestBytes = await readFile(manifestPath, "utf8"), manifest = JSON.parse(manifestBytes), eventsFile = path.join(root, "events.jsonl");
  validateControlManifest(manifest);
  if (typeof manifest.runtime_control_bin !== "string" || !path.isAbsolute(manifest.runtime_control_bin)) fail("EVAL manifest must retain its absolute control executable", "runtime_scope_identity_missing");
  const env = evalRuntimeEnv(path.join(root, "control-runtime"), manifest, { DD_FLOW_BIN: manifest.runtime_control_bin });
  const requested = await appendEvent(eventsFile, { id: `scope-control:${sha256(JSON.stringify([manifest.run_id, requestId]))}`, deduplicate: true, source: "dd-eval://runner", runId: manifest.run_id, type: "dev.dd.eval.control.requested", data: { mode, request_id: requestId, scope_id: manifest.run_id }, validateDuplicate: existing => {
    if (existing.data.mode !== mode) fail("Control request identity was reused for another mode", "control_request_conflict");
  }, beforeAppend: events => {
    const prior = reduceEvents(events);
    if (prior.cancellation) fail("Terminal EVAL cancellation cannot be resumed by operator control", "runtime_scope_stopped");
    if (prior.control?.mode === "stop" && mode === "pause") fail("Pause cannot weaken an existing stop", "control_request_conflict");
  } });
  if (requested.data.mode !== mode) fail("Control request identity was reused for another mode", "control_request_conflict");
  const scopeManifest = { schema_id: "dd-flow/runtime-scope-manifest@1", scope_id: manifest.run_id, manifest_path: manifestPath, manifest_sha256: sha256(manifestBytes), execution_ids: manifest.executions.map(execution => execution.id) };
  const receipt = await commandJson(manifest.runtime_control_bin, ["runtime", "scope", "control", "--scope-id", manifest.run_id, "--request-id", requestId, "--mode", mode, "--manifest-json", JSON.stringify(scopeManifest)], { cwd: root, env });
  if (receipt.scope_id !== manifest.run_id || receipt.control?.request_id !== requestId || receipt.control?.requested_mode !== mode || receipt.control?.dispatch_blocked !== true || !Number.isSafeInteger(receipt.control.generation)) fail("Runtime control returned another scope or request", "runtime_scope_inventory_invalid");
  await appendEvent(eventsFile, { source: "dd-eval://runner", runId: manifest.run_id, type: "dev.dd.eval.control.observed", data: { mode, request_id: requestId, request_sequence: requested.data.sequence, receipt } });
  return { root, run_id: manifest.run_id, state: reduceEvents(await readEvents(eventsFile)).state, receipt };
}

/** Validate retained execution identities before scope control. */
export function validateControlManifest(manifest) {
  if (!manifest || typeof manifest !== "object" || Array.isArray(manifest)
    || typeof manifest.run_id !== "string" || !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(manifest.run_id)
    || !Array.isArray(manifest.executions) || !manifest.executions.length
    || manifest.executions.some(execution => !execution || typeof execution !== "object" || Array.isArray(execution)
      || typeof execution.id !== "string" || !/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(execution.id))
    || new Set(manifest.executions.map(execution => execution.id)).size !== manifest.executions.length) {
    fail("Invalid retained EVAL control manifest", "control_input_invalid");
  }
}
