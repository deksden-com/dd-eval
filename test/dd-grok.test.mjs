import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { assertProfile, createSession, forkSession, promptSession } from "../lib/dd-grok.mjs";

test("Grok Build profile drift fails closed", () => {
  const requested = { provider: "xai", model: "grok-4.6", reasoning: "high", mode: "bypassPermissions" };
  assert.equal(assertProfile(requested, requested).status, "matched");
  assert.throws(() => assertProfile(requested, { ...requested, reasoning: "low" }), /profile mismatch/);
});

test("dd-grok uses native ACP Sessions and x.ai extensions", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "dd-grok-test-")); const server = path.join(root, "fake-grok.mjs"); const journal = path.join(root, "evidence", "journal.jsonl");
  await writeFile(server, `
    import readline from "node:readline";
    if (process.argv.includes("version")) { process.stdout.write(JSON.stringify({currentVersion:"1.0.12 fake"})); process.exit(0); }
    const send = (value) => process.stdout.write(JSON.stringify(value) + "\\n");
    readline.createInterface({input:process.stdin}).on("line", (line) => { const message=JSON.parse(line); if(message.id===undefined)return; const {id,method,params={}}=message; let result={};
      if(method==="initialize") result={protocolVersion:1,_meta:{modelState:{currentModelId:"grok-4.6",availableModels:[{modelId:"grok-4.6",_meta:{reasoningEffort:"high"}}]}}};
      else if(method==="session/new") result={sessionId:"native-root"};
      else if(method==="session/load") result={};
      else if(method==="session/prompt") { send({jsonrpc:"2.0",method:"session/update",params:{sessionId:params.sessionId,update:{sessionUpdate:"tool_call",toolCallId:"tool-1",title:"Bash: true",rawInput:{command:"true"},_meta:{claudeCode:{toolName:"Bash"}}}}}); result={stopReason:"end_turn"}; }
      else if(method==="_x.ai/session/info") result={result:{sessionId:params.sessionId,data:{model:"grok-4.6"}}};
      else if(method==="_x.ai/session/usage") result={result:{sessionId:params.sessionId,totalTokens:15,inputTokens:12,outputTokens:3}};
      else if(method==="_x.ai/subagent/list_running") result={result:{subagents:[]}};
      else if(method==="_x.ai/session/fork") result={result:{newSessionId:"native-fork",parentSessionId:params.sourceSessionId}};
      send({jsonrpc:"2.0",id,result});
    });
  `);
  const common = { bin: server, cwd: root, journal, model: "grok-4.6", reasoning: "high", mode: "bypassPermissions" };
  try {
    const created = await createSession({ ...common, prompt: "prime" });
    assert.equal(created.provider_session_id, "native-root"); assert.deepEqual(created.evidence.tool_calls, { total: 1, failures: 0, by_tool: { Bash: 1 } });
    const prompted = await promptSession({ ...common, sessionId: "native-root", prompt: "work" }); assert.equal(prompted.turn.stopReason, "end_turn");
    const forked = await forkSession({ ...common, sessionId: "native-root", target: { newCwd: root } }); assert.equal(forked.provider_session_id, "native-fork");
    const lines = (await readFile(journal, "utf8")).trim().split("\n").map(JSON.parse); assert.ok(lines.some((line) => line.kind === "outbound" && line.payload.method === "_x.ai/session/fork")); assert.ok(lines.some((line) => line.kind === "outbound" && line.payload.method === "_x.ai/session/usage"));
  } finally { await rm(root, { recursive: true, force: true }); }
});
