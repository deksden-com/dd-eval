#!/usr/bin/env node
import { spawn } from "node:child_process";
import { cancelSession, createSession, doctor, forkSession, inspectSession, promptFromFile, promptSession } from "../lib/dd-grok.mjs";
import { callDaemon, serveDaemon, startDaemon, stopDaemon } from "../lib/dd-grok-daemon.mjs";

function parse(argv) { const positional = []; const options = {}; for (let index = 0; index < argv.length; index += 1) { const token = argv[index]; if (!token.startsWith("--")) { positional.push(token); continue; } const key = token.slice(2); if (["json", "cancel-tree", "no-flow"].includes(key)) { options[key] = true; continue; } const value = argv[++index]; if (value === undefined) throw new Error(`--${key} requires a value`); options[key] = value; } return { positional, options }; }
function common(options) { return { bin: options["grok-bin"], journal: options.journal, stateDir: options["state-dir"], cwd: options.cwd, sessionId: options["session-id"], model: options.model, reasoning: options.reasoning, mode: options.mode ?? "bypassPermissions", authPath: options["auth-path"], authMethodId: options["auth-method-id"], ddFlowBin: options["dd-flow-bin"], ddFlowHome: options["dd-flow-home"], projectRoot: options["project-root"], sessionArchive: options["session-archive"], noFlow: options["no-flow"] === true, timeoutMs: options.timeout ? Number(options.timeout) * 1000 : undefined }; }
async function readStdin() { let value = ""; process.stdin.setEncoding("utf8"); for await (const chunk of process.stdin) value += chunk; return value; }
async function hook(options) {
  const stdin = await readStdin(); const payload = JSON.parse(stdin || "{}"); const identity = await callDaemon(options["state-dir"], "hook.resolve", { sessionId: payload.sessionId ?? payload.session_id });
  const enriched = { ...payload, _meta: { ...(payload._meta ?? {}), ddGrok: identity } }; const args = ["grok", "event", "handle", "--project-root", options["project-root"], "--json"]; const command = options["dd-flow-bin"]; const target = /\.[cm]?js$/.test(command) ? { command: process.execPath, args: [command, ...args] } : { command, args };
  await new Promise((resolve, reject) => { const child = spawn(target.command, target.args, { env: { ...process.env, DD_FLOW_HOME: options["dd-flow-home"] }, stdio: ["pipe", "ignore", "pipe"] }); let stderr = ""; child.stderr.setEncoding("utf8").on("data", (chunk) => (stderr += chunk)); child.on("error", reject); child.on("close", (code) => code === 0 ? resolve() : reject(new Error(stderr || "dd-flow rejected Grok hook"))); child.stdin.end(`${JSON.stringify(enriched)}\n`); });
  return { decision: "allow" };
}

try {
  const { positional, options } = parse(process.argv.slice(2)); const [family, command] = positional; const shared = common(options); let result;
  if (family === "doctor") result = await doctor(shared);
  else if (family === "daemon" && command === "start") result = await startDaemon({ ...shared, entryPath: process.argv[1] });
  else if (family === "daemon" && command === "serve") { await serveDaemon(shared.stateDir); process.exit(0); }
  else if (family === "daemon" && command === "status") result = await callDaemon(shared.stateDir, "daemon.status");
  else if (family === "daemon" && command === "stop") result = await stopDaemon({ stateDir: shared.stateDir, cancelTree: options["cancel-tree"], timeoutMs: shared.timeoutMs });
  else if (family === "hook" && command === "handle") { process.stdout.write(`${JSON.stringify(await hook(options))}\n`); process.exit(0); }
  else if (family === "session") { const params = { ...shared, ...(command === "create" || command === "prompt" ? { prompt: options["prompt-file"] ? await promptFromFile(options["prompt-file"]) : options.prompt } : {}), ...(command === "fork" ? { target: JSON.parse(options["target-json"] ?? "null") } : {}), ...(command === "archive" ? { archiveDir: options["archive-dir"] } : {}) }; if (shared.stateDir) result = await callDaemon(shared.stateDir, `session.${["status", "resume"].includes(command) ? "inspect" : command}`, params, shared.timeoutMs ?? 1_800_000); else if (command === "create") result = await createSession(params); else if (command === "prompt") result = await promptSession(params); else if (["inspect", "status", "resume"].includes(command)) result = await inspectSession(params); else if (command === "cancel") result = await cancelSession(params); else if (command === "fork") result = await forkSession(params); else throw new Error(`unknown session command: ${command}`); }
  else throw new Error("usage: dd-grok doctor | daemon start|status|stop | session create|prompt|inspect|status|resume|cancel|fork|archive [options] --json");
  process.stdout.write(`${JSON.stringify({ ok: true, ...result })}\n`);
} catch (error) { if (process.argv[2] === "hook") { process.stdout.write(`${JSON.stringify({ decision: "deny", reason: error.message })}\n`); process.exit(2); } process.stderr.write(`${JSON.stringify({ ok: false, error: error.message, ...(error.code ? { code: error.code, retryable: error.retryable === true, details: error.details } : {}) })}\n`); process.exit(1); }
