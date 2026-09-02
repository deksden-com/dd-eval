#!/usr/bin/env node
import { cancelSession, createSession, doctor, inspectSession, promptFromFile, promptSession, startSession } from "../lib/dd-codex.mjs";
import { callDaemon, serveDaemon, startDaemon, stopDaemon } from "../lib/dd-codex-daemon.mjs";

function parse(argv) { const positional = []; const options = {}; for (let i = 0; i < argv.length; i += 1) { const token = argv[i]; if (!token.startsWith("--")) { positional.push(token); continue; } const key = token.slice(2); if (key === "json") { options[key] = true; continue; } const value = argv[++i]; if (value === undefined) throw new Error(`--${key} requires a value`); options[key] = value; } return { positional, options }; }
function common(options) { return { bin: options["codex-bin"], journal: options.journal, stateDir: options["state-dir"], cwd: options.cwd, sessionId: options["session-id"], turnId: options["turn-id"], model: options.model, reasoning: options.reasoning, timeoutMs: options.timeout ? Number(options.timeout) * 1000 : undefined }; }
try {
  const { positional, options } = parse(process.argv.slice(2)); const [family, command] = positional; const shared = common(options); let result;
  if (family === "doctor") result = await doctor(shared);
  else if (family === "daemon" && command === "start") result = await startDaemon({ ...shared, entryPath: process.argv[1] });
  else if (family === "daemon" && command === "serve") { await serveDaemon(shared.stateDir); process.exit(0); }
  else if (family === "daemon" && command === "status") result = await callDaemon(shared.stateDir, "daemon.status");
  else if (family === "daemon" && command === "stop") result = await stopDaemon(shared);
  else if (family === "session" && command === "create") result = shared.stateDir ? await callDaemon(shared.stateDir, "session.create", shared) : await createSession(shared);
  else if (family === "session" && command === "prompt") result = shared.stateDir ? await callDaemon(shared.stateDir, "session.prompt", { ...shared, prompt: options["prompt-file"] ? await promptFromFile(options["prompt-file"]) : options.prompt }, shared.timeoutMs ?? 1_800_000) : await promptSession({ ...shared, prompt: options["prompt-file"] ? await promptFromFile(options["prompt-file"]) : options.prompt });
  else if (family === "session" && command === "start") result = shared.stateDir ? await callDaemon(shared.stateDir, "session.start", { ...shared, prompt: options["prompt-file"] ? await promptFromFile(options["prompt-file"]) : options.prompt }, shared.timeoutMs ?? 30_000) : await startSession({ ...shared, prompt: options["prompt-file"] ? await promptFromFile(options["prompt-file"]) : options.prompt });
  else if (family === "session" && ["inspect", "status", "resume"].includes(command)) result = shared.stateDir ? await callDaemon(shared.stateDir, "session.inspect", shared) : await inspectSession(shared);
  else if (family === "session" && command === "cancel") result = shared.stateDir ? await callDaemon(shared.stateDir, "session.cancel", shared) : await cancelSession(shared);
  else throw new Error("usage: dd-codex doctor | daemon start|status|stop | session create|start|prompt|inspect|status|resume|cancel [--json]");
  process.stdout.write(`${JSON.stringify({ ok: true, ...result })}\n`);
} catch (error) { process.stderr.write(`${JSON.stringify({ ok: false, error: error.message, ...(error.code ? { code: error.code } : {}) })}\n`); process.exit(1); }
