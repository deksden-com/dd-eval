#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import { doctor } from "../lib/dd-agy.mjs";
import { callDaemon, serveDaemon, startDaemon, stopDaemon } from "../lib/dd-agy-daemon.mjs";

function parse(argv) { const positional = [], options = {}; for (let i = 0; i < argv.length; i += 1) { const token = argv[i]; if (!token.startsWith("--")) { positional.push(token); continue; } const key = token.slice(2); if (["json","cancel-tree","tree"].includes(key)) options[key] = true; else { if (argv[i + 1] === undefined) throw new Error(`--${key} requires a value`); options[key] = argv[++i]; } } return { positional, options }; }
const prompt = async options => options["prompt-file"] ? await readFile(options["prompt-file"], "utf8") : options.prompt;
async function stdin() { let value = ""; process.stdin.setEncoding("utf8"); for await (const chunk of process.stdin) value += chunk; return value; }
async function hook(options) {
  const payload = JSON.parse(await stdin() || "{}"), event = options.event;
  const identity = await callDaemon(options["state-dir"], "hook.observe", { event, payload });
  if (event === "PreToolUse" || event === "PostToolUse") {
    const phase = event === "PreToolUse" ? "before" : "after", args = payload.toolCall?.args ?? {};
    const normalized = { schema_id: "dd-flow/agy-tool-event@1", event_id: identity.event_id, phase, daemon_id: identity.daemon_id, conversation_id: payload.conversationId, parent_conversation_id: identity.parent_conversation_id, step_index: payload.stepIdx, tool: payload.toolCall?.name, input: args, workspace_paths: payload.workspacePaths, transcript_path: payload.transcriptPath, model: payload.modelName, profile: identity.profile, ...(phase === "after" ? { error: payload.error ?? "" } : {}) };
    const command = options["dd-flow-bin"] ?? identity.dd_flow_bin, target = /\.[cm]?js$/.test(command) ? { command: process.execPath, args: [command] } : { command, args: [] };
    await new Promise((resolve, reject) => { const child = spawn(target.command, [...target.args, "agy", "event", "handle", "--project-root", options["project-root"] ?? identity.project_root, "--json"], { env: { ...process.env, DD_FLOW_HOME: options["dd-flow-home"] ?? identity.dd_flow_home }, stdio: ["pipe", "ignore", "pipe"] }); let error = ""; child.stderr.setEncoding("utf8").on("data", chunk => error += chunk); child.on("error", reject); child.on("close", code => code === 0 ? resolve() : reject(new Error(error || "dd-flow rejected Antigravity hook"))); child.stdin.end(`${JSON.stringify(normalized)}\n`); });
  }
  return event === "PreToolUse" ? { decision: "allow" } : {};
}

try {
  const { positional, options } = parse(process.argv.slice(2)), [family, command] = positional; const common = { stateDir: options["state-dir"], cwd: options.cwd, bin: options["agy-bin"], provider: options.provider, model: options.model, reasoning: options.reasoning, mode: options.mode, projectRoot: options["project-root"], ddFlowBin: options["dd-flow-bin"], ddFlowHome: options["dd-flow-home"], timeoutMs: options.timeout ? Number(options.timeout) * 1000 : undefined }; let result;
  if (family === "doctor") result = await doctor(common);
  else if (family === "daemon" && command === "start") result = await startDaemon({ ...common, entryPath: process.argv[1] });
  else if (family === "daemon" && command === "serve") { await serveDaemon(common.stateDir); process.exit(0); }
  else if (family === "daemon" && command === "status") result = await callDaemon(common.stateDir, "daemon.status");
  else if (family === "daemon" && command === "stop") result = await stopDaemon({ stateDir: common.stateDir, cancelTree: options["cancel-tree"], timeoutMs: common.timeoutMs });
  else if (family === "hook" && command === "handle") { process.stdout.write(`${JSON.stringify(await hook(options))}\n`); process.exit(0); }
  else if (family === "session") { if (command === "fork") throw Object.assign(new Error("Antigravity native headless fork is unsupported; use deterministic_replay"), { code: "agy_headless_fork_unsupported" }); const operation = command === "status" ? "inspect" : command; result = await callDaemon(common.stateDir, `session.${operation}`, { sessionId: options["session-id"], ...(command === "create" || command === "prompt" ? { prompt: await prompt(options) } : {}), tree: options.tree === true }, common.timeoutMs ?? 1_800_000); }
  else throw new Error("usage: dd-agy doctor | daemon start|status|stop | session create|prompt|inspect|resume|cancel|fork [options] --json");
  process.stdout.write(`${JSON.stringify({ ok: true, ...result })}\n`);
} catch (error) { process.stderr.write(`${JSON.stringify({ ok: false, error: error.message, ...(error.code ? { code: error.code, retryable: error.retryable === true, details: error.details } : {}) })}\n`); process.exit(1); }
