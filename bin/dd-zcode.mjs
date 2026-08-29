#!/usr/bin/env node
import { cancelChild, cancelSession, createSession, doctor, forkSession, inspectSession, promptFromFile, promptSession } from "../lib/dd-zcode.mjs";
import { callDaemon, serveDaemon, startDaemon, stopDaemon } from "../lib/dd-zcode-daemon.mjs";

function parse(argv) {
  const positional = []; const options = {};
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith("--")) { positional.push(token); continue; }
    const key = token.slice(2); if (["json", "cancel-tree"].includes(key)) { options[key] = true; continue; }
    const value = argv[++index]; if (value === undefined) throw new Error(`--${key} requires a value`); options[key] = value;
  }
  return { positional, options };
}

function common(options) {
  return {
    bin: options["zcode-acp-bin"], zcodePath: options["zcode-path"], journal: options.journal,
    stateDir: options["state-dir"],
    cwd: options.cwd, sessionId: options["session-id"], adapterSessionId: options["adapter-session-id"], provider: options.provider,
    childSessionId: options["child-session-id"],
    model: options.model, reasoning: options.reasoning, mode: options.mode,
    permission: options.permission ?? "deny", ddFlowBin: options["dd-flow-bin"],
    ddFlowHome: options["dd-flow-home"], projectRoot: options["project-root"],
    timeoutMs: options.timeout ? Number(options.timeout) * 1000 : undefined,
  };
}

try {
  const { positional, options } = parse(process.argv.slice(2)); const [family, command] = positional; let result;
  const answers = options["answers-file"] ? JSON.parse(await promptFromFile(options["answers-file"])) : undefined;
  const shared = common(options);
  if (family === "doctor") result = await doctor(shared);
  else if (family === "daemon" && command === "start") result = await startDaemon({ ...shared, entryPath: process.argv[1] });
  else if (family === "daemon" && command === "serve") { await serveDaemon(shared.stateDir); process.exit(0); }
  else if (family === "daemon" && command === "status") result = await callDaemon(shared.stateDir, "daemon.status");
  else if (family === "daemon" && command === "stop") result = await stopDaemon({ stateDir: shared.stateDir, cancelTree: options["cancel-tree"], timeoutMs: shared.timeoutMs });
  else if (family === "session") {
    const params = { ...shared, answers, ...(command === "create" || command === "prompt" ? { prompt: options["prompt-file"] ? await promptFromFile(options["prompt-file"]) : options.prompt } : {}), ...(command === "fork" ? { target: JSON.parse(options["target-json"] ?? "null") } : {}) };
    if (shared.stateDir) result = await callDaemon(shared.stateDir, `session.${["status", "resume"].includes(command) ? "inspect" : command}`, params, shared.timeoutMs ?? 1_800_000);
    else if (command === "create") result = await createSession(params);
    else if (command === "prompt") result = await promptSession(params);
    else if (["inspect", "status", "resume"].includes(command)) result = await inspectSession(params);
    else if (command === "cancel") result = await cancelSession(params);
    else if (command === "cancel-child") result = await cancelChild(params);
    else if (command === "fork") result = await forkSession(params);
    else throw new Error(`unknown session command: ${command}`);
  } else throw new Error("usage: dd-zcode doctor | daemon start|status|stop | session create|prompt|inspect|status|resume|cancel|cancel-child|fork [options] --json");
  process.stdout.write(`${JSON.stringify({ ok: true, ...result })}\n`);
} catch (error) {
  process.stderr.write(`${JSON.stringify({ ok: false, error: error.message, ...(error.code ? { code: error.code, retryable: error.retryable === true, details: error.details } : {}) })}\n`); process.exit(1);
}
