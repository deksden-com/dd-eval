// Read-only adversarial checks for the September 3 fix audit.
// Run: node tools/audit-runtime-fix-boundaries.mjs
// Commands below are inspected as strings, NEVER executed.
import assert from "node:assert/strict";
import { AcpBridge } from "../lib/dd-zcode.mjs";
import { runtimeIntegrityViolation } from "../lib/runner.mjs";

const results = [];
async function check(name, action) {
  try { await action(); results.push({ name, passed: true }); }
  catch (error) { results.push({ name, passed: false, expected: error.expected, actual: error.actual, message: error.message }); }
}
const root = "/tmp/eval/dd-flow-home";
for (const [name, command, expected] of [
  ["workspace reads are permitted", `sed -n '1,8p' ${root}/projects/P/file`, false],
  ["private engine execution is rejected", `node ${root}/engines/pkg/private.mjs`, true],
  ["private engine Python mutation is rejected", `python -c 'open("${root}/engines/pkg/index.js","w").write("changed")'`, true],
  ["runtime database mutation is rejected", `sqlite3 ${root}/db.sqlite 'UPDATE works SET status="completed"'`, true],
  ["mentioning public CLI does not authorize a private invocation", `node ${root}/bin/private.mjs; ${root}/bin/dd-flow version`, true],
  ["copying engine text out for inspection is permitted", `cp ${root}/engines/pkg/index.js /tmp/audit-copy.js`, false],
]) await check(name, () => assert.equal(runtimeIntegrityViolation(command, root), expected));

const bridge = new AcpBridge({});
bridge.send = () => {}; // In-memory transport; no provider, process or model call.
const receive = (value) => bridge.receive(JSON.stringify(value));
const first = bridge.request("session/prompt", { sessionId: "s" }, 1000).catch((error) => error);
receive({ method: "_x.ai/session_notification", params: { sessionId: "s", update: { sessionUpdate: "retry_state", type: "failed", message: "402 Payment Required" } } });
receive({ id: 1, error: { code: -32603, message: "Internal error" } });
await check("native quota evidence is retained", async () => assert.equal((await first).code, "provider_quota_exhausted"));
const second = bridge.request("session/prompt", { sessionId: "s" }, 1000).catch((error) => error);
receive({ id: 2, error: { code: -32602, message: "Invalid prompt" } });
await check("provider evidence does not leak to the next request", async () => assert.equal((await second).code, "acp_request_failed"));
bridge.sessionActivity.set("s", 1);
receive({ method: "_x.ai/session_notification", params: { sessionId: "s", update: { sessionUpdate: "retry_state", type: "retrying", message: "provider retry" } } });
await check("recognized native activity refreshes liveness", () => assert.notEqual(bridge.sessionActivity.get("s"), 1));
await bridge.flush();
console.log(JSON.stringify({ checks: results.length, passed: results.filter((item) => item.passed).length, results }, null, 2));
process.exitCode = results.some((item) => !item.passed) ? 1 : 0;
