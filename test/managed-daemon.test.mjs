import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { stopProcessGroup } from "../lib/managed-daemon.mjs";


test("managed daemon cleanup terminates a detached child tree", async () => {
  const child = spawn(process.execPath, ["-e", `
    const { spawn } = require('node:child_process');
    spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { stdio: 'ignore' });
    setInterval(() => {}, 1000);
  `], { detached: true, stdio: "ignore" });
  child.unref();
  try {
    await new Promise((resolve) => setTimeout(resolve, 40));
    await stopProcessGroup(child, 50);
    assert.throws(() => process.kill(-child.pid, 0), { code: "ESRCH" });
  } finally {
    await stopProcessGroup(child, 20).catch(() => {});
  }
});


test("leader exit allows helpers to finish naturally without signaling an unowned group", { skip: process.platform === "win32" }, async () => {
  const script = `const {spawn}=require("node:child_process"); spawn(process.execPath,["-e","setTimeout(()=>{},300)"],{stdio:"ignore"}).unref();`;
  const child = spawn(process.execPath, ["-e", script], { detached: true, stdio: "ignore" });
  await once(child, "exit");
  assert.equal(child.exitCode, 0);
  await stopProcessGroup(child, 1_000);
  assert.throws(() => process.kill(-child.pid, 0), { code: "ESRCH" });
});

test("owned cleanup escalates when its live provider ignores SIGTERM", async () => {
  const child = spawn(process.execPath, ["-e", 'process.on("SIGTERM", () => {}); process.stdout.write("ready"); setInterval(() => {}, 1000)'], { detached: true, stdio: ["ignore", "pipe", "ignore"] });
  await new Promise(resolve => child.stdout.once("data", resolve));
  await stopProcessGroup(child, 50);
  assert.throws(() => process.kill(-child.pid, 0), { code: "ESRCH" });
});

test("signal-terminated leader does not authorize signaling its remaining group", { skip: process.platform === "win32" }, async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "dd-signal-exit-"));
  const marker = path.join(root, "finished");
  const helper = `setTimeout(() => require("node:fs").writeFileSync(${JSON.stringify(marker)}, "natural exit"), 200); process.send("ready");`;
  const script = `const {spawn}=require("node:child_process"); const helper=spawn(process.execPath,["-e",${JSON.stringify(helper)}],{stdio:["ignore","ignore","ignore","ipc"]}); helper.once("message",()=>process.kill(process.pid,"SIGKILL"));`;
  const child = spawn(process.execPath, ["-e", script], { detached: true, stdio: "ignore" });
  try {
    await once(child, "exit");
    assert.equal(child.signalCode, "SIGKILL");
    await stopProcessGroup(child, 1_000);
    assert.equal(await readFile(marker, "utf8"), "natural exit");
  } finally {
    await new Promise(resolve => setTimeout(resolve, 300));
    await rm(root, { recursive: true, force: true });
  }
});

test("leader exit during SIGTERM grace prevents SIGKILL of its remaining helper", { skip: process.platform === "win32" }, async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "dd-grace-exit-"));
  const marker = path.join(root, "finished");
  const helper = `process.on("SIGTERM",()=>{});setTimeout(()=>{require("node:fs").writeFileSync(${JSON.stringify(marker)},"natural exit");process.exit(0);},300);process.send("ready");`;
  const script = `const {spawn}=require("node:child_process");const helper=spawn(process.execPath,["-e",${JSON.stringify(helper)}],{stdio:["ignore","ignore","ignore","ipc"]});helper.once("message",()=>process.stdout.write("ready"));setInterval(()=>{},1000);`;
  const child = spawn(process.execPath, ["-e", script], { detached: true, stdio: ["ignore", "pipe", "ignore"] });
  try {
    await new Promise(resolve => child.stdout.once("data", resolve));
    await stopProcessGroup(child, 50);
    assert.equal(await readFile(marker, "utf8"), "natural exit");
  } finally { child.kill(); await new Promise(resolve => setTimeout(resolve, 350)); await rm(root, { recursive: true, force: true }); }
});
