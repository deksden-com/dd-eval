#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import { callDaemon, serveDaemon, startDaemon, stopDaemon } from "../lib/dd-opencode-daemon.mjs";

function parse(argv) { const positional = [], options = {}; for (let i = 0; i < argv.length; i += 1) { const token = argv[i]; if (!token.startsWith("--")) { positional.push(token); continue; } const key = token.slice(2); if (["json","cancel-tree"].includes(key)) options[key] = true; else { if (argv[i + 1] === undefined) throw new Error(`--${key} requires a value`); options[key] = argv[++i]; } } return { positional, options }; }
const prompt = async options => options["prompt-file"] ? await readFile(options["prompt-file"], "utf8") : options.prompt;
try {
  const { positional, options } = parse(process.argv.slice(2)), [family, command] = positional; const common = { stateDir: options["state-dir"], cwd: options.cwd, bin: options["opencode-bin"], provider: options.provider, model: options.model, variant: options.variant, agent: options.agent, authPath: options["auth-path"], projectRoot: options["project-root"], ddFlowBin: options["dd-flow-bin"], ddFlowHome: options["dd-flow-home"], sessionArchive: options["session-archive"], timeoutMs: options.timeout ? Number(options.timeout) * 1000 : undefined }; let result;
  if (family === "daemon" && command === "start") result = await startDaemon({ ...common, entryPath: process.argv[1] });
  else if (family === "daemon" && command === "serve") { await serveDaemon(common.stateDir); process.exit(0); }
  else if (family === "daemon" && command === "status") result = await callDaemon(common.stateDir, "daemon.status");
  else if (family === "doctor") result = await callDaemon(common.stateDir, "daemon.doctor");
  else if (family === "daemon" && command === "stop") result = await stopDaemon({ stateDir: common.stateDir, cancelTree: options["cancel-tree"], timeoutMs: common.timeoutMs });
  else if (family === "session") { const operation = ["status","resume"].includes(command) ? "inspect" : command; const params = { sessionId: options["session-id"], title: options.title, messageId: options["message-id"], archiveFile: options["archive-file"], ...(command === "prompt" ? { prompt: await prompt(options) } : {}) }; result = await callDaemon(common.stateDir, `session.${operation}`, params, common.timeoutMs ?? 1_800_000); }
  else throw new Error("usage: dd-opencode daemon start|status|stop | session create|prompt|inspect|fork|cancel|archive [options] --json");
  process.stdout.write(`${JSON.stringify({ ok: true, ...result })}\n`);
} catch (error) { process.stderr.write(`${JSON.stringify({ ok: false, error: error.message, ...(error.code ? { code: error.code, retryable: error.retryable === true, details: error.details } : {}) })}\n`); process.exit(1); }
