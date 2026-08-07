#!/usr/bin/env node
import { collect, defaultSource, prepare, validateInput } from "../lib/dd-eval.mjs";

function usage() {
  return `dd-eval

Usage:
  dd-eval validate --case <case-id> [--checkpoint <checkpoint-id>] [--source <dd-tasks>]
  dd-eval prepare --case <case-id> --profile <profile-id> --output <path> [--checkpoint <checkpoint-id>] [--track planning] [--source <dd-tasks>]
  dd-eval collect --manifest <run.json> --session <session.jsonl> --output <result.json> [--timeline <timeline.json>] [--usage <usage.json>] [--flags <flags.json>]
`;
}

function parse(argv) {
  const [command, ...rest] = argv;
  const options = {};
  for (let index = 0; index < rest.length; index += 2) {
    const flag = rest[index];
    const value = rest[index + 1];
    if (!flag?.startsWith("--") || value === undefined) throw new Error(`invalid argument: ${flag ?? ""}`);
    options[flag.slice(2)] = value;
  }
  return { command, options };
}

try {
  const { command, options } = parse(process.argv.slice(2));
  if (!command || command === "help" || command === "--help") {
    process.stdout.write(usage());
    process.exit(0);
  }
  if (command === "collect") {
    for (const required of ["manifest", "session", "output"]) {
      if (!options[required]) throw new Error(`--${required} is required`);
    }
    const result = await collect(options);
    process.stdout.write(`${JSON.stringify({ ok: true, ...result })}\n`);
  } else if (command === "validate") {
    if (!options.case) throw new Error("--case is required");
    const source = options.source || defaultSource();
    const result = await validateInput({ caseId: options.case, checkpointId: options.checkpoint, source });
    process.stdout.write(`${JSON.stringify({ ok: true, case_id: result.definition.id, checkpoint_id: result.checkpoint.id, source_commit: result.checkpoint.source.commit })}\n`);
  } else if (command === "prepare") {
    if (!options.case) throw new Error("--case is required");
    if (!options.output) throw new Error("--output is required");
    const source = options.source || defaultSource();
    const result = await prepare({ caseId: options.case, checkpointId: options.checkpoint, profileId: options.profile, track: options.track, source, output: options.output });
    process.stdout.write(`${JSON.stringify({ ok: true, ...result })}\n`);
  } else {
    throw new Error(`unknown command: ${command}`);
  }
} catch (error) {
  process.stderr.write(`${JSON.stringify({ ok: false, error: error.message })}\n`);
  process.exit(1);
}
