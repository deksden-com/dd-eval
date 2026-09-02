#!/usr/bin/env node
import { canonicalAccept, canonicalBoundaryAccept, canonicalBuild, canonicalEngineCapture, canonicalQualificationRecover, canonicalQualify, canonicalResume, canonicalStatus, evalJudge, evalRun, fixturesValidate, runnerCancel, runnerReconcile, runnerResume, runnerStatus } from "../lib/runner.mjs";
import { gcApply, gcPlan, storageList, storageStatus } from "../lib/storage.mjs";

function usage() {
  return `dd-eval — deterministic evaluation runner

Usage:
  dd-eval runner fixtures validate --case <case-id> [--revision REV-NNN]
  dd-eval runner canonical build --profile <run-profile.json> --project-root <checkpoint-checkout> --flow-root <flow-pack-checkout>
  dd-eval runner canonical status --build <path>
  dd-eval runner canonical resume --build <path> [--detach true]
  dd-eval runner canonical engine capture --build <path>
  dd-eval runner canonical boundary accept --build <path> --stage <stage> --review <file>
  dd-eval runner canonical qualify --build <path> --profile <run-profile.json>
  dd-eval runner canonical qualification recover --build <path> --receipt <qualification-receipt.json>
  dd-eval runner canonical accept --build <path> --entry <stage> --review <file>
  dd-eval runner eval run --profile <run-profile.json>
  dd-eval runner eval judge --eval <path> [--profile <judge-profile-id>]
  dd-eval runner status --eval <path>
  dd-eval runner resume --eval <path>
  dd-eval runner reconcile --eval <path>
  dd-eval runner cancel --eval <path> [--execution <id>]
  dd-eval storage ls [--case <case-id>]
  dd-eval storage status
  dd-eval gc plan
  dd-eval gc apply --plan <file>
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
  else if (family === "runner" && command === "canonical" && action === "build") result = await canonicalBuild({ profileFile: required(options, "profile"), projectRoot: required(options, "project-root"), flowRoot: required(options, "flow-root") });
  else if (family === "runner" && command === "canonical" && action === "status") result = await canonicalStatus({ buildRoot: required(options, "build") });
  else if (family === "runner" && command === "canonical" && action === "resume") result = await canonicalResume({ buildRoot: required(options, "build"), detachTurns: options.detach === "true" });
  else if (family === "runner" && command === "canonical" && action === "engine") {
    if (positional[3] !== "capture") throw new Error(`unknown command: ${positional.join(" ")}`);
    result = await canonicalEngineCapture({ buildRoot: required(options, "build") });
  }
  else if (family === "runner" && command === "canonical" && action === "boundary") {
    if (action !== "boundary" || positional[3] !== "accept") throw new Error(`unknown command: ${positional.join(" ")}`);
    result = await canonicalBoundaryAccept({ buildRoot: required(options, "build"), stage: required(options, "stage"), reviewFile: required(options, "review") });
  }
  else if (family === "runner" && command === "canonical" && action === "qualify") result = await canonicalQualify({ buildRoot: required(options, "build"), profileFile: required(options, "profile") });
  else if (family === "runner" && command === "canonical" && action === "qualification") {
    if (positional[3] !== "recover") throw new Error(`unknown command: ${positional.join(" ")}`);
    result = await canonicalQualificationRecover({ buildRoot: required(options, "build"), receiptFile: required(options, "receipt") });
  }
  else if (family === "runner" && command === "canonical" && action === "accept") result = await canonicalAccept({ buildRoot: required(options, "build"), entry: required(options, "entry"), reviewFile: required(options, "review") });
  else if (family === "runner" && command === "eval" && action === "run") result = await evalRun({ profileFile: required(options, "profile") });
  else if (family === "runner" && command === "eval" && action === "judge") result = await evalJudge({ evalRoot: required(options, "eval"), ...(options.profile ? { profileId: options.profile } : {}) });
  else if (family === "runner" && command === "status") result = await runnerStatus({ evalRoot: required(options, "eval") });
  else if (family === "runner" && command === "resume") result = await runnerResume({ evalRoot: required(options, "eval") });
  else if (family === "runner" && command === "reconcile") result = await runnerReconcile({ evalRoot: required(options, "eval") });
  else if (family === "runner" && command === "cancel") result = await runnerCancel({ evalRoot: required(options, "eval"), ...(options.execution ? { executionId: options.execution } : {}) });
  else if (family === "storage" && command === "ls") result = await storageList({ ...(options.case ? { caseId: options.case } : {}) });
  else if (family === "storage" && command === "status") result = await storageStatus();
  else if (family === "gc" && command === "plan") result = await gcPlan();
  else if (family === "gc" && command === "apply") result = await gcApply({ planFile: required(options, "plan") });
  else throw new Error(`unknown command: ${positional.join(" ")}`);
  process.stdout.write(`${JSON.stringify({ ok: true, ...result })}\n`);
} catch (error) {
  process.stderr.write(`${JSON.stringify({ ok: false, error: error.message, code: error.code ?? "operation_failed" })}\n`);
  process.exit(1);
}
