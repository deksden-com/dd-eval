import assert from "node:assert/strict";
import test from "node:test";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { isObservationLoss, OPERATION_ERROR_CONTRACT_VERSION } from "../lib/operation-errors.mjs";

test("local quiet/output loss is not a provider terminal; paired runtime agrees", { skip: !process.env.DD_FLOW_SOURCE_ROOT }, async () => {
  const native = await import(pathToFileURL(path.join(process.env.DD_FLOW_SOURCE_ROOT, "src/harness-runtime/lib/operation-errors.mjs")));
  assert.equal(OPERATION_ERROR_CONTRACT_VERSION, native.OPERATION_ERROR_CONTRACT_VERSION);
  for (const code of ["subject_liveness_timeout", "command_observation_lost", "command_output_limit", "operation_output_limit", "harness_adapter_invalid"]) {
    assert.equal(isObservationLoss({ code }), true, code);
    assert.equal(native.isObservationLoss({ code }), true, code);
  }
  for (const code of ["ownership_lost", "profile_integrity_violation", "native_outcome_observation_failed", "agy_provider_quota_exhausted"]) {
    assert.equal(isObservationLoss({ code }), false, code);
    assert.equal(native.isObservationLoss({ code }), false, code);
  }
});
