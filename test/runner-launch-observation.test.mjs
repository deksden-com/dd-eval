import assert from "node:assert/strict";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { commandText } from "../lib/process-json.mjs";

test("launch shares observation-loss policy, exact late outcome and no replay", { timeout: 120_000 }, async () => {
  const cwd = fileURLToPath(new URL("..", import.meta.url));
  const fixture = fileURLToPath(new URL("../scripts/fixtures/runner-launch-observation.mjs", import.meta.url));
  const output = await commandText(process.execPath, ["--experimental-test-module-mocks", fixture], { cwd, env: { DD_EVAL_HOME: cwd }, phase: "control", timeoutMs: 30_000 });
  const receipt = JSON.parse(output);
  assert.equal(receipt.status, "PASS");
  assert.equal(receipt.receipts.length, 3);
  assert.ok(receipt.receipts.every(item => item.status === "PASS" && item.dispatches === 1));
});
