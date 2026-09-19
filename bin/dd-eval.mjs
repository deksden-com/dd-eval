#!/usr/bin/env node
import { addHome, listHomes, removeHome } from "../lib/homes.mjs";
import { parse, resolveEvalReference, validateCommand } from "../lib/cli-input.mjs";
import { canonicalAccept, canonicalBoundaryAccept, canonicalBuild, canonicalEngineCapture, canonicalQualificationRecover, canonicalQualify, canonicalResume, canonicalStatus, evalJudge, evalPreflight, evalRun, fixturesValidate, harnessCapacityCheck, harnessCompatibilityQualify, runnerCancel, runnerCheckpoints, runnerFork, runnerRecover, runnerReconcile, runnerResume, runnerStatus } from "../lib/runner.mjs";
import { gcApply, gcPlan, storageList, storageStatus } from "../lib/storage.mjs";
import { runnerRecoveryInspect } from "../lib/runner.mjs";
import { runnerControlReconcile, runnerControlRequest, runnerControlStatus } from "../lib/runner.mjs";
import { requestEvalResume, requestEvalRun, requestRunnerContinuation } from "../lib/eval-resume-worker.mjs";

function usage() {
  return `dd-eval — deterministic evaluation runner

Usage:
  dd-eval homes list
  dd-eval homes add --path <home> [--label <name>]
  dd-eval homes remove --id <id>
  dd-eval runner fixtures validate --case <case-id> [--revision REV-NNN]
  dd-eval runner eval preflight --profile <run-profile.json>
  dd-eval harness capacity check --profile <profile-id> --max <n> [--project-root <path>] [--write-profile true|false]
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
  dd-eval runner control status --eval <path> [--execution <id>]
  dd-eval runner control pause|stop --eval <path> --request-id <id>
  dd-eval runner control reconcile --eval <path> --from <request-id>
  dd-eval runner control resume --eval <path> --from <control-request-id> --request-id <id> [--wait-ms <0..60000>]
  dd-eval runner resume --eval <path>
  dd-eval runner cleanup --eval <path> --request-id <id>
  dd-eval runner recover --eval <path> --from <recovery-id> [--execution <id>]
  dd-eval runner recovery inspect --eval <path> [--execution <id>]
  dd-eval runner checkpoints --eval <path> [--execution <id>]
  dd-eval runner fork --eval <source-eval> --execution <id> --from <checkpoint-id> --output <new-eval-root> --engine-version <exact-version> --request-id <id> [--integrity-checksum <sha256>] [--start true]
  dd-eval runner reconcile --eval <path>
  dd-eval runner cancel --eval <path> [--execution <id>]
  dd-eval storage ls [--case <case-id>]
  dd-eval storage status
  dd-eval gc plan
  dd-eval gc apply --plan <file>

Operator control resume starts durable recovery preparation and applies a proven
all-role release. --wait-ms defaults to 0; pending is not resumed work.
An independent EVAL observer continues reconciliation after release.
accepted confirms the EVAL request; runtime_accepted may still be null.
`;
}

function required(options, key) { if (!options[key]) throw Object.assign(new Error(`--${key} is required`), { code: "usage" }); return options[key]; }
function optionalBoolean(options, key) {
  if (options[key] === undefined) return undefined;
  if (options[key] === "true") return true;
  if (options[key] === "false") return false;
  throw Object.assign(new Error(`--${key} must be true or false`), { code: "usage" });
}

try {
  const argv = process.argv.slice(2);
  if (!argv.length || argv[0] === "help" || argv.includes("--help") || argv.includes("-h")) { process.stdout.write(usage()); process.exit(0); }
  const { positional, options } = parse(argv); validateCommand({ positional, options });
  // Validate every scalar CLI spelling before dispatch can create a home,
  // register a run, or launch a worker.  A corrected invocation is therefore
  // always safe to repeat.
  for (const key of ["write-profile", "detach", "start"]) optionalBoolean(options, key);
  if (options["wait-ms"] !== undefined && (!/^\d+$/.test(options["wait-ms"]) || Number(options["wait-ms"]) > 60_000)) throw Object.assign(new Error("--wait-ms must be an integer between 0 and 60000"), { code: "control_request_invalid" });
  if (options.eval) options.eval = resolveEvalReference(options.eval);
  const [family, command, action] = positional;
  if (!family || family === "help" || family === "--help") { process.stdout.write(usage()); process.exit(0); }
  let result;
  if (family === "homes" && command === "list") result = await listHomes();
  else if (family === "homes" && command === "add") result = await addHome(required(options, "path"), options.label);
  else if (family === "homes" && command === "remove") result = await removeHome(required(options, "id"));
  else if (family === "runner" && command === "fixtures" && action === "validate") result = await fixturesValidate({ caseId: required(options, "case"), ...(options.revision ? { revision: options.revision } : {}) });
  else if (family === "runner" && command === "eval" && action === "preflight") result = await evalPreflight({ profileFile: required(options, "profile") });
  else if (family === "harness" && command === "capacity" && action === "check") result = await harnessCapacityCheck({ profileId: required(options, "profile"), maximum: required(options, "max"), ...(options["project-root"] ? { projectRoot: options["project-root"] } : {}), ...(options["write-profile"] ? { writeProfile: optionalBoolean(options, "write-profile") } : {}) });
  else if (family === "harness" && command === "compatibility" && action === "qualify") result = await harnessCompatibilityQualify({ profileId: required(options, "profile"), ...(options["project-root"] ? { projectRoot: options["project-root"] } : {}) });
  else if (family === "runner" && command === "canonical" && action === "build") result = await canonicalBuild({ profileFile: required(options, "profile"), projectRoot: required(options, "project-root"), flowRoot: required(options, "flow-root") });
  else if (family === "runner" && command === "canonical" && action === "status") result = await canonicalStatus({ buildRoot: required(options, "build") });
  else if (family === "runner" && command === "canonical" && action === "resume") result = await canonicalResume({ buildRoot: required(options, "build"), detachTurns: optionalBoolean(options, "detach") ?? false });
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
  else if (family === "runner" && command === "eval" && action === "run") result = await requestEvalRun({ profileFile: required(options, "profile") });
  else if (family === "runner" && command === "eval" && action === "judge") result = await evalJudge({ evalRoot: required(options, "eval"), ...(options.profile ? { profileId: options.profile } : {}) });
  else if (family === "runner" && command === "status") result = await runnerStatus({ evalRoot: required(options, "eval") });
  else if (family === "runner" && command === "control" && action === "status") {
    if (positional.length !== 3 || Object.keys(options).some(key => !["eval", "execution"].includes(key))) throw new Error("Use runner control status --eval <path> [--execution <id>]");
    result = await runnerControlStatus({ evalRoot: required(options, "eval"), ...(options.execution ? { executionId: options.execution } : {}) });
  }
  else if (family === "runner" && command === "control" && ["pause", "stop"].includes(action)) {
    if (positional.length !== 3 || Object.keys(options).some(key => !["eval", "request-id"].includes(key))) throw new Error("Use runner control pause|stop --eval <path> --request-id <id>");
    result = await runnerControlRequest({ evalRoot: required(options, "eval"), requestId: required(options, "request-id"), mode: action });
  }
  else if (family === "runner" && command === "control" && action === "reconcile") {
    if (positional.length !== 3 || Object.keys(options).some(key => !["eval", "from"].includes(key))) throw new Error("Use runner control reconcile --eval <path> --from <request-id>");
    result = await runnerControlReconcile({ evalRoot: required(options, "eval"), requestId: required(options, "from") });
  }
  else if (family === "runner" && command === "control" && action === "resume") {
    if (positional.length !== 3 || Object.keys(options).some(key => !["eval", "from", "request-id", "wait-ms"].includes(key))) throw new Error("Use runner control resume --eval <path> --from <control-request-id> --request-id <id> [--wait-ms <0..60000>]");
    result = await requestEvalResume({ evalRoot: required(options, "eval"), requestId: required(options, "request-id"), fromRequestId: required(options, "from"), ...(options["wait-ms"] !== undefined ? { waitMs: Number(options["wait-ms"]) } : {}) });
  }
  else if (family === "runner" && command === "resume") result = await requestRunnerContinuation({ evalRoot: required(options, "eval") });
  else if (family === "runner" && command === "cleanup") result = await requestRunnerContinuation({ evalRoot: required(options, "eval"), kind: "cleanup", requestId: required(options, "request-id") });
  else if (family === "runner" && command === "recover") result = await runnerRecover({ evalRoot: required(options, "eval"), fromRecoveryId: required(options, "from"), ...(options.execution ? { executionId: options.execution } : {}) });
  else if (family === "runner" && command === "recovery" && positional[2] === "inspect") result = await runnerRecoveryInspect({ evalRoot: required(options, "eval"), ...(options.execution ? { executionId: options.execution } : {}) });
  else if (family === "runner" && command === "checkpoints") result = await runnerCheckpoints({ evalRoot: required(options, "eval"), ...(options.execution ? { executionId: options.execution } : {}) });
  else if (family === "runner" && command === "fork") result = await runnerFork({ evalRoot: required(options, "eval"), executionId: required(options, "execution"), from: required(options, "from"), output: required(options, "output"), engineVersion: required(options, "engine-version"), requestId: required(options, "request-id"), ...(options["integrity-checksum"] ? { integrityChecksum: options["integrity-checksum"] } : {}), ...(options.start ? { start: optionalBoolean(options, "start") } : {}) });
  else if (family === "runner" && command === "reconcile") result = await runnerReconcile({ evalRoot: required(options, "eval") });
  else if (family === "runner" && command === "cancel") result = await runnerCancel({ evalRoot: required(options, "eval"), ...(options.execution ? { executionId: options.execution } : {}) });
  else if (family === "storage" && command === "ls") result = await storageList({ ...(options.case ? { caseId: options.case } : {}) });
  else if (family === "storage" && command === "status") result = await storageStatus();
  else if (family === "gc" && command === "plan") result = await gcPlan();
  else if (family === "gc" && command === "apply") result = await gcApply({ planFile: required(options, "plan") });
  else throw new Error(`unknown command: ${positional.join(" ")}`);
  process.stdout.write(`${JSON.stringify({ ok: true, ...result })}\n`);
} catch (error) {
  process.stderr.write(`${JSON.stringify({ ok: false, error: error.message, code: error.code ?? "operation_failed", ...(error.retryable === true ? { retryable: true } : {}), ...(error.details !== undefined ? { details: error.details } : {}) })}\n`);
  process.exit(["control_request_invalid", "usage"].includes(error.code) ? 2 : 1);
}
