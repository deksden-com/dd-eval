import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { chmod, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { confirmDaemonProcess, finishDaemonProcess, registerDaemonProcess, stopProcessGroup } from "../lib/managed-daemon.mjs";

test("managed daemon lifecycle registers, confirms, terminates its group, and finalizes", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "dd-managed-daemon-"));
  const flow = path.join(root, "flow.mjs"), log = path.join(root, "calls.log");
  await writeFile(flow, `#!/usr/bin/env node
import { appendFileSync } from "node:fs";
appendFileSync(${JSON.stringify(log)}, process.argv.slice(2).join(" ")+"\\n");
if (process.argv[4] === "register") process.stdout.write('{"process":{"id":"PROC-test","lease_token":"lease-test"}}\\n');
else process.stdout.write('{"ok":true}\\n');
`, { mode: 0o755 });
  await chmod(flow, 0o755);
  const config = { cwd: root, ddFlowBin: flow, ddFlowHome: root, resourceHome: path.join(root, "resources"), env: { DD_FLOW_HOME: root } };
  const child = spawn(process.execPath, ["-e", "setInterval(() => {}, 1000)"], { detached: true, stdio: "ignore" }); child.unref();
  try {
    const processRecord = await registerDaemonProcess(config, { kind: "test", owner: "test", operation: "test" });
    await confirmDaemonProcess(config, processRecord, child);
    await stopProcessGroup(child, 20);
    await finishDaemonProcess(config, processRecord, "failed", "test_cleanup");
    const calls = await readFile(log, "utf8");
    assert.match(calls, /runtime process register/);
    assert.match(calls, /runtime process confirm .*--process-group-id/);
    assert.match(calls, /runtime process finish .*--state failed/);
  } finally {
    await stopProcessGroup(child, 20).catch(() => {});
    await rm(root, { recursive: true, force: true });
  }
});
