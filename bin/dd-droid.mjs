#!/usr/bin/env node
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import os from "node:os";
import path from "node:path";
import { DROID_CONTRACT, DROID_PROTOCOL, DroidRuntime, droidVersion } from "../lib/dd-droid.mjs";
import { callDaemon, serveDaemon, startDaemon, stopDaemon } from "../lib/dd-droid-daemon.mjs";
import { errorRecord } from "../lib/operation-errors.mjs";

function parse(argv) { const positional = [], options = {}; for (let i = 0; i < argv.length; i++) { const word = argv[i]; if (!word.startsWith("--")) { positional.push(word); continue; } const key = word.slice(2); if (["json", "cancel-tree", "tree", "no-flow"].includes(key)) options[key] = true; else { if (argv[i + 1] === undefined) throw new Error(`${word} requires a value`); options[key] = argv[++i]; } } return { positional, options }; }
async function input() { let text = ""; for await (const chunk of process.stdin) text += chunk; return text; }
try {
  const { positional: [family, command], options } = parse(process.argv.slice(2));
  const config = { stateDir: options["state-dir"], cwd: options.cwd, projectRoot: options["project-root"], bin: options["droid-bin"] ?? "droid", entryPath: process.argv[1], journal: options.journal, authHome: options["auth-home"], model: options.model, provider: options.provider, reasoning: options.reasoning, mode: options.mode, ddFlowBin: options["dd-flow-bin"], ddFlowHome: options["dd-flow-home"], noFlow: options["no-flow"] === true, timeoutMs: options.timeout ? Number(options.timeout) * 1_000 : undefined };
  let result;
  if (family === "doctor") {
    const dir = await mkdtemp(path.join(os.tmpdir(), "dd-droid-doctor-"));
    const runtime = new DroidRuntime({ ...config, stateDir: dir, home: path.join(dir, "home"), cwd: config.cwd ?? process.cwd(), journal: path.join(dir, "events.jsonl"), daemonId: randomUUID(), ddFlowHome: null, ddFlowBin: null }, {}, async () => {});
    try { await runtime.start(); result = { harness: "droid-cli", observed_runtime: { droid: await droidVersion(config.bin), factory_protocol: runtime.protocol, dd_harness_contract: DROID_CONTRACT }, models: runtime.models.map(model => model.id ?? model.modelId), capabilities: { native_children: true, tree_cancel: true, selective_child_cancel: false, native_fork: false }, protocol_expected: DROID_PROTOCOL }; }
    finally { await runtime.closeTree(true); await rm(dir, { recursive: true, force: true }); }
  } else if (family === "daemon" && command === "start") result = await startDaemon(config);
  else if (family === "daemon" && command === "serve") { await serveDaemon(config.stateDir); process.exit(0); }
  else if (family === "daemon" && command === "status") result = await callDaemon(config.stateDir, "daemon.status");
  else if (family === "daemon" && command === "operation") result = await callDaemon(config.stateDir, "operation.inspect", { operationId: options["operation-id"] });
  else if (family === "daemon" && command === "stop") result = await stopDaemon({ stateDir: config.stateDir, cancelTree: options["cancel-tree"] });
  else if (family === "hook" && command === "handle") { const payload = JSON.parse(await input()); const eventId = randomUUID(); result = await callDaemon(config.stateDir, "hook.observe", { payload, eventId }, 25_000, eventId); }
  else if (family === "session") { if (command === "fork") throw new Error("Droid fork is not qualified for this adapter"); const prompt = options["prompt-file"] ? await readFile(options["prompt-file"], "utf8") : options.prompt; result = await callDaemon(config.stateDir, `session.${command === "status" ? "inspect" : command}`, { sessionId: options["session-id"], ...(prompt ? { prompt } : {}) }); }
  else throw new Error("usage: dd-droid doctor | daemon start|status|operation|stop | session create|resume|prompt|inspect|cancel");
  process.stdout.write(`${JSON.stringify(family === "hook" ? (result.hookSpecificOutput ? { hookSpecificOutput: result.hookSpecificOutput } : {}) : { ok: true, ...result })}\n`);
} catch (error) { process.stderr.write(`${JSON.stringify({ ok: false, error: errorRecord(error) })}\n`); process.exitCode = process.argv[2] === "hook" ? 2 : 1; }
