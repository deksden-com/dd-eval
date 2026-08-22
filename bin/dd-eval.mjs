#!/usr/bin/env node
import {
  addSession,
  acceptCanonicalCheckpoint,
  compareAccept,
  comparePrepare,
  captureCanonicalCheckpoint,
  checkpoint,
  defaultSource,
  finalize,
  judgeAccept,
  judgeReject,
  judgePrepare,
  prepare,
  setStarterSession,
  sync,
  validateInput
} from "../lib/dd-eval.mjs";

function usage() {
  return `dd-eval

Usage:
  dd-eval validate --case <case-id> [--require authoring|scored] [--source <dd-tasks>]
  dd-eval starter set --case <case-id> --stage <stage> --subject-profile <id> --session-id <id> --parent-session-id <protected-source-id>
  dd-eval checkpoint capture --case <case-id> --stage <stage> --project-root <path> --flow-run <RUN> --canonical-subject-session <id> --checkpoint-subject-session <id> [--revision REV-NNN] [--dd-flow-home <path>]
  dd-eval checkpoint accept --case <case-id> --stage <stage> --record <capture.json> --review <review.md>
  dd-eval prepare --case <case-id> (--focus <csv>|--segment <start..end>|--e2e) [--scenario <relative-case-path>] [--output <DD_EVAL_HOME-contained-path>] [--controller-profile <id>] [--subject-profile <id>] [--judge-profile <id>] [--source <dd-tasks>]
  dd-eval session add --eval <prepared-dir> --execution <id> --role <controller|subject_base|subject|judge> --session-id <id> [--parent-session-id <id>] [--agent-id <id>]
  dd-eval sync --eval <prepared-dir> --execution <id> --project-root <path> [--flow-run <id>]
  dd-eval checkpoint --eval <prepared-dir> --execution <id>
  dd-eval judge prepare --eval <prepared-dir> --execution <id> [--rejudge]
  dd-eval judge accept --eval <prepared-dir> --execution <id> --result <judge-result.json>
  dd-eval judge reject --eval <prepared-dir> --execution <id> --reason <why-result-cannot-be-accepted>
  dd-eval compare prepare --evals <eval-dir,...> --output <comparison-dir>
  dd-eval compare accept --comparison <comparison-dir> --result <comparison-result.json>
  dd-eval finalize --eval <prepared-dir>
`;
}

function parse(argv) {
  const positional = [];
  const options = {};
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith("--")) { positional.push(token); continue; }
    const key = token.slice(2);
    if (["e2e", "rejudge"].includes(key)) { options[key] = true; continue; }
    const value = argv[index + 1];
    if (value === undefined || value.startsWith("--")) throw new Error(`--${key} requires a value`);
    options[key] = value;
    index += 1;
  }
  return { positional, options };
}

function required(options, key) { if (!options[key]) throw new Error(`--${key} is required`); return options[key]; }

try {
  const { positional, options } = parse(process.argv.slice(2));
  const [family, command] = positional;
  if (!family || family === "help" || family === "--help") {
    process.stdout.write(usage());
    process.exit(0);
  }
  let result;
  if (family === "validate") {
    result = await validateInput({ caseId: required(options, "case"), source: options.source || defaultSource(), requireMode: options.require || "authoring" });
    result = { case_id: result.definition.id, checkpoint_id: result.checkpoint.id, source_commit: result.checkpoint.source.commit, require: options.require || "authoring" };
  } else if (family === "starter" && command === "set") {
    result = await setStarterSession({ caseId: required(options, "case"), stage: required(options, "stage"), profileId: required(options, "subject-profile"), sessionId: required(options, "session-id"), parentSessionId: required(options, "parent-session-id") });
  } else if (family === "prepare") {
    result = await prepare({
      caseId: required(options, "case"), source: options.source || defaultSource(), output: options.output,
      controllerProfileId: options["controller-profile"], subjectProfileId: options["subject-profile"], judgeProfileId: options["judge-profile"],
      ...(options.focus ? { stageList: options.focus } : {}), ...(options.segment ? { segment: options.segment } : {}), ...(options.scenario ? { scenario: options.scenario } : {}), e2e: options.e2e === true
    });
  } else if (family === "session" && command === "add") {
    result = await addSession({ evalRoot: required(options, "eval"), executionId: required(options, "execution"), role: required(options, "role"), sessionId: required(options, "session-id"), ...(options["parent-session-id"] ? { parentSessionId: options["parent-session-id"] } : {}), ...(options["agent-id"] ? { agentId: options["agent-id"] } : {}) });
  } else if (family === "sync") {
    result = await sync({ evalRoot: required(options, "eval"), executionId: required(options, "execution"), projectRoot: required(options, "project-root"), ...(options["flow-run"] ? { flowRunId: options["flow-run"] } : {}) });
  } else if (family === "checkpoint" && command === "capture") {
    result = await captureCanonicalCheckpoint({ caseId: required(options, "case"), stage: required(options, "stage"), revision: options.revision, projectRoot: required(options, "project-root"), flowRunId: required(options, "flow-run"), runtimeHome: options["dd-flow-home"] || process.env.DD_FLOW_HOME || required(options, "dd-flow-home"), canonicalSubjectSessionId: required(options, "canonical-subject-session"), checkpointSubjectSessionId: required(options, "checkpoint-subject-session"), ...(options["agent-id"] ? { agentId: options["agent-id"] } : {}) });
  } else if (family === "checkpoint" && command === "accept") {
    result = await acceptCanonicalCheckpoint({ caseId: required(options, "case"), stage: required(options, "stage"), recordFile: required(options, "record"), reviewFile: required(options, "review") });
  } else if (family === "checkpoint") {
    result = await checkpoint({ evalRoot: required(options, "eval"), executionId: required(options, "execution") });
  } else if (family === "judge" && command === "prepare") {
    result = await judgePrepare({ evalRoot: required(options, "eval"), executionId: required(options, "execution"), rejudge: options.rejudge === true });
  } else if (family === "judge" && command === "accept") {
    result = await judgeAccept({ evalRoot: required(options, "eval"), executionId: required(options, "execution"), result: required(options, "result") });
  } else if (family === "judge" && command === "reject") {
    result = await judgeReject({ evalRoot: required(options, "eval"), executionId: required(options, "execution"), reason: required(options, "reason") });
  } else if (family === "compare" && command === "prepare") {
    result = await comparePrepare({ evalRoots: required(options, "evals"), output: required(options, "output") });
  } else if (family === "compare" && command === "accept") {
    result = await compareAccept({ comparisonRoot: required(options, "comparison"), result: required(options, "result") });
  } else if (family === "finalize") {
    result = await finalize({ evalRoot: required(options, "eval") });
  } else {
    throw new Error(`unknown command: ${positional.join(" ")}`);
  }
  process.stdout.write(`${JSON.stringify({ ok: true, ...result })}\n`);
} catch (error) {
  process.stderr.write(`${JSON.stringify({ ok: false, error: error.message })}\n`);
  process.exit(1);
}
