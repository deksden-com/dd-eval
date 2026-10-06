import assert from "node:assert/strict";
import test from "node:test";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { errorRecord, isObservationLoss, OPERATION_ERROR_CONTRACT_VERSION } from "../lib/operation-errors.mjs";

test("raw nested Error messages and causes retain identity and shared diagnostic bounds", () => {
  const leaf = Object.assign(new Error("disk failed"), { code: "EIO" });
  const cause = new Error("writer failed", { cause: leaf });
  const nested = errorRecord({ code: "scope_failure", message: "primary", details: { cause } });
  assert.equal(nested.details.cause.message, "writer failed");
  assert.deepEqual(nested.details.cause.cause, { message: "disk failed", code: "EIO" });
  Object.defineProperty(cause, "cause", { value: cause, configurable: true });
  assert.equal(errorRecord({ code: "scope_failure", details: { cause } }).details.cause.cause, "[circular]");
  const large = Object.assign(new Error("x".repeat(100000)), { code: "EIO" });
  Object.defineProperty(large, "cause", { value: large });
  const bounded = JSON.stringify(errorRecord({ code: "scope_failure", details: { errors: Array(256).fill(large) } }));
  assert.ok(bounded.length < 150000);
  assert.ok(bounded.includes("[truncated]"));
});

test("operational fences survive repeated EVAL/FLOW oversized transport", { skip: !process.env.DD_FLOW_SOURCE_ROOT }, async () => {
  const native = await import(pathToFileURL(path.join(process.env.DD_FLOW_SOURCE_ROOT, "src/harness-runtime/lib/operation-errors.mjs")));
  const controls = { cleanup_unconfirmed: true, phase: "prepare", effect: "no_effect", recoverable: true,
    retry_command: "dd-flow work start WRK-001", retry_instruction: "Correct then retry" };
  let record = { code: "process_ownership_unconfirmed", message: "x".repeat(100000),
    details: { errors: Array(256).fill("x".repeat(1000)), ...controls },
    cause: { code: "native_timeout", message: "x".repeat(100000), details: { errors: Array(256).fill("x".repeat(1000)), ...controls } } };
  for (const serialize of [native.errorRecord, errorRecord, native.errorRecord, errorRecord]) {
    record = serialize(JSON.parse(JSON.stringify(record)));
    for (const [key, value] of Object.entries(controls)) {
      assert.deepEqual(record.details[key], value);
      assert.deepEqual(record.cause.details[key], value);
    }
    assert.ok(JSON.stringify(record).length < 150000);
  }
  for (const serialize of [native.errorRecord, errorRecord]) {
    const oversized = serialize({ code: "validation", details: { effect: "no_effect", recoverable: true, retry_command: "dd-flow ".repeat(4000) } });
    assert.equal(oversized.details.recoverable, false);
    assert.equal(oversized.details.authority_truncated, true);
    assert.equal(Object.hasOwn(oversized.details, "retry_command"), false);
  }
});

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
