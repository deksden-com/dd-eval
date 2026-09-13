// Isolated native stop qualification; never targets an existing user Session.
import { mkdtemp, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { ZcodeBackend } from "../../zcode-acp/dist/backend/client.js";
import { resolveZcodeCommand } from "../../zcode-acp/dist/backend/resolve.js";
import { loadZcodeCredentials, mergeEnvWithCreds } from "../../zcode-acp/dist/backend/credentials.js";

const root = await mkdtemp(path.join(os.tmpdir(), "dd-zcode-close-tree-"));
const marker = `DD_TREE_${randomUUID().replaceAll("-", "")}`;
const backend = new ZcodeBackend(resolveZcodeCommand(), mergeEnvWithCreds(loadZcodeCredentials()));
let id = 1, sessionId;
const events = [];
const record = (event, data) => { const value = { at: new Date().toISOString(), event, ...data }; events.push(value); console.log(JSON.stringify(value)); };
const rpc = (method, params) => backend.request(id++, method, params, 15000);
const processes = () => execFileSync("ps", ["-axo", "pid,ppid,lstart,command"], { encoding: "utf8" }).split("\n").filter(line => line.includes(marker));
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
try {
  const created = await rpc("session/create", { workspace: { workspacePath: root, workspaceKey: root }, mode: "yolo" });
  sessionId = created.result?.session?.sessionId;
  if (!sessionId) throw new Error("Native Session was not created");
  await rpc("session/setMode", { sessionId, mode: "yolo" });
  record("created", { root, sessionId, backend_pid: backend.proc.pid });
  const sent = await rpc("session/send", { sessionId, content: `Isolated bounded stop diagnostic. Use one Agent subagent now. Tell it to run Bash exactly: node -e 'console.log("${marker}");setTimeout(()=>{},45000)'. Do not run this command yourself. No file edits, no other directories, no other tasks. Wait for that single subagent. On interruption stop immediately; never retry.` });
  if (sent.error) throw new Error(sent.error.message);
  let before, tree;
  const deadline = Date.now() + 90000;
  while (Date.now() < deadline) {
    await sleep(1500);
    before = processes(); tree = await rpc("session/subagents", { sessionId });
    if (before.length && tree.result?.running?.length) break;
  }
  record("before", { processes: before, tree });
  if (!before?.length || !tree.result?.running?.length) throw new Error("No live child/tool observed: qualification is inconclusive");
  record("stop", { response: await rpc("session/stop", { sessionId }) });
  await sleep(4000);
  record("close", { response: await rpc("session/close", { sessionId }) });
  await sleep(2000);
  const remaining = processes();
  const children = [];
  for (const child of tree.result.running) {
    const childId = child.childSessionId ?? child.sessionId;
    if (childId) children.push({ sessionId: childId, response: await rpc("session/read", { sessionId: childId }) });
  }
  record("after", { processes: remaining, children: children.map(child => ({ sessionId: child.sessionId, status: child.response.result?.projection?.status, error: child.response.error })) });
  if (remaining.length) throw new Error("Child process survived root close");
  record("physical_tree_passed", { sessionId });
} catch (error) { record("failed", { message: error.message }); process.exitCode = 1; }
finally {
  if (sessionId) await rpc("session/close", { sessionId }).catch(() => {});
  await backend.close();
  record("backend_closed", { remaining: processes() });
  await writeFile(path.join(root, "receipt.json"), JSON.stringify(events, null, 2));
}
