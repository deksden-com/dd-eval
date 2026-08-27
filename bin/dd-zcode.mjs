#!/usr/bin/env node
import { cancelSession, createSession, doctor, forkSession, inspectSession, promptFromFile, promptSession } from "../lib/dd-zcode.mjs";

function parse(argv) {
  const positional = []; const options = {};
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith("--")) { positional.push(token); continue; }
    const key = token.slice(2); if (key === "json") { options[key] = true; continue; }
    const value = argv[++index]; if (value === undefined) throw new Error(`--${key} requires a value`); options[key] = value;
  }
  return { positional, options };
}

function common(options) {
  return {
    bin: options["zcode-acp-bin"], zcodePath: options["zcode-path"], journal: options.journal,
    cwd: options.cwd, sessionId: options["session-id"], provider: options.provider,
    model: options.model, reasoning: options.reasoning, mode: options.mode,
    permission: options.permission ?? "deny", ddFlowBin: options["dd-flow-bin"],
    ddFlowHome: options["dd-flow-home"], projectRoot: options["project-root"],
    timeoutMs: options.timeout ? Number(options.timeout) * 1000 : undefined,
  };
}

try {
  const { positional, options } = parse(process.argv.slice(2)); const [family, command] = positional; let result;
  const answers = options["answers-file"] ? JSON.parse(await promptFromFile(options["answers-file"])) : undefined;
  if (family === "doctor") result = await doctor(common(options));
  else if (family === "session" && command === "create") result = await createSession(common(options));
  else if (family === "session" && command === "prompt") result = await promptSession({ ...common(options), answers, prompt: options["prompt-file"] ? await promptFromFile(options["prompt-file"]) : options.prompt });
  else if (family === "session" && ["inspect", "status", "resume"].includes(command)) result = await inspectSession(common(options));
  else if (family === "session" && command === "cancel") result = await cancelSession(common(options));
  else if (family === "session" && command === "fork") result = await forkSession({ ...common(options), target: JSON.parse(options["target-json"] ?? "null") });
  else throw new Error("usage: dd-zcode doctor | session create|prompt|inspect|status|resume|cancel|fork [options] --json");
  process.stdout.write(`${JSON.stringify({ ok: true, ...result })}\n`);
} catch (error) {
  process.stderr.write(`${JSON.stringify({ ok: false, error: error.message })}\n`); process.exit(1);
}
