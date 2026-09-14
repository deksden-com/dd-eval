// Bounded native tree experiment; owns only its freshly-created Session/workspace.
import assert from "node:assert/strict";
import { mkdtemp, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { ZcodeBackend } from "../../zcode-acp/dist/backend/client.js";
import { resolveZcodeCommand } from "../../zcode-acp/dist/backend/resolve.js";
import { loadZcodeCredentials, mergeEnvWithCreds } from "../../zcode-acp/dist/backend/credentials.js";
import { retainedSubagents, residentSession } from "../../zcode-acp/dist/handlers/extensions.js";
import { observeClosedZcodeTree } from "../../dd-flow-cli/src/harness-runtime/lib/dd-zcode.mjs";

const root = await mkdtemp(path.join(os.tmpdir(), "dd-zcode-tree-boundary-"));
const backend = new ZcodeBackend(resolveZcodeCommand(), mergeEnvWithCreds(loadZcodeCredentials()));
const events = [], ids = new Set();
let seq = 1, sessionId;
const rpc = async (method, params) => {
  const response = await backend.request(seq++, method, params, 10000);
  events.push({ at: new Date().toISOString(), method, params, response });
  return response;
};
const children = value => [...new Set([...(value?.childSessionIds ?? []), ...(value?.running ?? []).map(x => x.childSessionId), ...(value?.ended?.items ?? []).map(x => x.childSessionId)].filter(Boolean))];
console.log(JSON.stringify({ root, status: "started" }));
try {
  sessionId = (await rpc("session/create", { workspace: { workspacePath: root, workspaceKey: root }, mode: "yolo" })).result?.session?.sessionId;
  assert.ok(sessionId); ids.add(sessionId);
  await rpc("session/setMode", { sessionId, mode: "yolo" });
  const flat = process.argv.includes("--flat");
  const prompt = flat
    ? `Isolated bounded native tree diagnostic in this empty directory. No edits or external resources. Create TWO background Agent children, one immediately after the other. Each child runs Bash once: node -e 'setTimeout(()=>{},45000)'. Root must not run Bash. Wait for children. Stop immediately on interruption, never retry.`
    : `Isolated bounded native tree diagnostic in this empty directory. No edits or external resources. Use Agent to create a child whose ONLY task is to create one grandchild via Agent. The grandchild must use Bash once: node -e 'setTimeout(()=>{},45000)'. Both child and root wait for their children. Do not execute Bash in root or child. Stop immediately on interruption, never retry. If nesting is prohibited report that clearly.`;
  assert.ok(!(await rpc("session/send", { sessionId, content: prompt })).error);
  let nested = false;
  const deadline = Date.now() + 100000;
  while (Date.now() < deadline && !nested) {
    await delay(1000);
    const tree = (await rpc("session/subagents", { sessionId })).result;
    for (const child of children(tree)) {
      ids.add(child);
      const subtree = await rpc("session/subagents", { sessionId: child });
      for (const descendant of children(subtree.result)) { ids.add(descendant); nested = true; }
    }
    if (flat && children(tree).length) break;
  }
  console.log(JSON.stringify({ root, nested, ids: [...ids] }));
  assert.ok(flat ? ids.size > 1 : nested, "No nested native descendant: experiment inconclusive");
  await rpc("session/stop", { sessionId });
  await rpc("session/subagents", { sessionId });
  const close = await rpc("session/close", { sessionId });
  assert.equal(close.result?.closed, true);
  const server = { resolveSid: id => id, ensureBackend: () => backend, nextId: () => seq++ };
  const bridge = { request: (method, params) => {
    if (method === "zcode/session/resident") return residentSession(server, params);
    assert.equal(method, "zcode/session/retainedSubagents");
    return retainedSubagents(server, params);
  } };
  const proof = await observeClosedZcodeTree(bridge, sessionId, [...ids].filter(id => id !== sessionId));
  events.push({ at: new Date().toISOString(), proof });
  assert.equal(proof.settled, true, JSON.stringify(proof));
  // These are raw native reads, never ensure/resume through ACP.
  for (let i = 0; i < 2; i++) {
    for (const id of ids) {
      const tree = await rpc("session/subagents", { sessionId: id });
      for (const child of children(tree.result)) ids.add(child);
      await rpc("session/read", { sessionId: id });
    }
    await delay(1000);
  }
  console.log(JSON.stringify({ root, status: "observed", ids: [...ids], close: close.result }));
} catch (error) {
  events.push({ error: error.message });
  console.log(JSON.stringify({ root, status: "inconclusive", error: error.message }));
  process.exitCode = 1;
} finally {
  for (const id of [...ids].reverse()) await rpc("session/close", { sessionId: id }).catch(() => {});
  await backend.close();
  await writeFile(path.join(root, "receipt.json"), JSON.stringify(events, null, 2));
}
