#!/usr/bin/env node
import { canonicalBuild, canonicalStatus, evalRun, fixturesValidate, runnerStatus } from "../lib/runner.mjs";

function usage() {
  return `dd-eval — deterministic evaluation runner

Usage:
  dd-eval runner fixtures validate --case <case-id> [--revision REV-NNN]
  dd-eval runner canonical build --profile <run-profile.json>
  dd-eval runner canonical status --build <path>
  dd-eval runner eval run --profile <run-profile.json>
  dd-eval runner status --eval <path>
`;
}

function parse(argv) {
  const positional = []; const options = {};
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith("--")) { positional.push(token); continue; }
    const key = token.slice(2); const value = argv[index + 1];
    if (value === undefined || value.startsWith("--")) throw new Error(`--${key} requires a value`);
    options[key] = value; index += 1;
  }
  return { positional, options };
}
function required(options, key) { if (!options[key]) throw new Error(`--${key} is required`); return options[key]; }

try {
  const { positional, options } = parse(process.argv.slice(2)); const [family, command, action] = positional;
  if (!family || family === "help" || family === "--help") { process.stdout.write(usage()); process.exit(0); }
  let result;
  if (family === "runner" && command === "fixtures" && action === "validate") result = await fixturesValidate({ caseId: required(options, "case"), ...(options.revision ? { revision: options.revision } : {}) });
  else if (family === "runner" && command === "canonical" && action === "build") result = await canonicalBuild({ profileFile: required(options, "profile") });
  else if (family === "runner" && command === "canonical" && action === "status") result = await canonicalStatus({ buildRoot: required(options, "build") });
  else if (family === "runner" && command === "eval" && action === "run") result = await evalRun({ profileFile: required(options, "profile") });
  else if (family === "runner" && command === "status") result = await runnerStatus({ evalRoot: required(options, "eval") });
  else throw new Error(`unknown command: ${positional.join(" ")}`);
  process.stdout.write(`${JSON.stringify({ ok: true, ...result })}\n`);
} catch (error) {
  process.stderr.write(`${JSON.stringify({ ok: false, error: error.message, code: error.code ?? "operation_failed" })}\n`);
  process.exit(1);
}
