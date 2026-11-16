import test from "node:test";
import assert from "node:assert/strict";
import { evalHome, evalRuntimeEnv, runtimeBin, runtimeEnv } from "../lib/execution/runtime-environment.mjs";
import { evalHome as runnerHome, evalRuntimeEnv as runnerEnv } from "../lib/runner.mjs";

test("runtime environment retains the runner API and explicit scope", () => {
  assert.equal(runnerHome, evalHome);
  assert.equal(runnerEnv, evalRuntimeEnv);
  assert.throws(() => evalHome("relative"), { code: "validation" });
  assert.equal(runtimeBin("/owned/runtime"), "/owned/runtime/bin/dd-flow");
  assert.equal(runtimeEnv("/owned/runtime", { DD_FLOW_RESOURCE_HOME: "/override" }).DD_FLOW_RESOURCE_HOME, "/override");
  const env = evalRuntimeEnv("/owned/runtime", { runtime_resource_home: "/owned/resources", eval_registry_file: "/owned/registry.json" });
  assert.equal(env.DD_FLOW_RESOURCE_HOME, "/owned/resources");
  assert.equal(env.DD_EVAL_REGISTRY_FILE, "/owned/registry.json");
  assert.throws(() => evalRuntimeEnv("/owned/runtime", { runtime_resource_home: "relative" }), { code: "runtime_scope_identity_missing" });
});
