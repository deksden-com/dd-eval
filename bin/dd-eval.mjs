#!/usr/bin/env node
import {
  addSession,
  checkpoint,
  defaultSource,
  finalize,
  judgeAccept,
  judgePrepare,
  prepare,
  sync,
  validateInput
} from "../lib/dd-eval.mjs";

function usage() {
  return `dd-eval

Usage:
  dd-eval validate --case <case-id> [--source <dd-tasks>]
  dd-eval prepare --case <case-id> --stages <csv> [--e2e] --controller-profile <id> --subject-profile <id> --judge-profile <id> --output <path> [--source <dd-tasks>]
  dd-eval session add --eval <prepared-dir> --execution <id> --role <controller|subject_base|subject|judge_base|judge> --session-id <id> [--parent-session-id <id>]
  dd-eval sync --eval <prepared-dir> --execution <id> --project-root <path> [--flow-run <id>]
  dd-eval checkpoint --eval <prepared-dir> --execution <id>
  dd-eval judge prepare --eval <prepared-dir> --execution <id>
  dd-eval judge accept --eval <prepared-dir> --execution <id> --result <judge-result.json>
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
    if (key === "e2e") { options[key] = true; continue; }
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
    result = await validateInput({ caseId: required(options, "case"), source: options.source || defaultSource() });
    result = { case_id: result.definition.id, checkpoint_id: result.checkpoint.id, source_commit: result.checkpoint.source.commit };
  } else if (family === "prepare") {
    result = await prepare({
      caseId: required(options, "case"), source: options.source || defaultSource(), output: required(options, "output"),
      controllerProfileId: required(options, "controller-profile"), subjectProfileId: required(options, "subject-profile"), judgeProfileId: required(options, "judge-profile"),
      ...(options.stages ? { stageList: options.stages } : {}), e2e: options.e2e === true
    });
  } else if (family === "session" && command === "add") {
    result = await addSession({ evalRoot: required(options, "eval"), executionId: required(options, "execution"), role: required(options, "role"), sessionId: required(options, "session-id"), ...(options["parent-session-id"] ? { parentSessionId: options["parent-session-id"] } : {}) });
  } else if (family === "sync") {
    result = await sync({ evalRoot: required(options, "eval"), executionId: required(options, "execution"), projectRoot: required(options, "project-root"), ...(options["flow-run"] ? { flowRunId: options["flow-run"] } : {}) });
  } else if (family === "checkpoint") {
    result = await checkpoint({ evalRoot: required(options, "eval"), executionId: required(options, "execution") });
  } else if (family === "judge" && command === "prepare") {
    result = await judgePrepare({ evalRoot: required(options, "eval"), executionId: required(options, "execution") });
  } else if (family === "judge" && command === "accept") {
    result = await judgeAccept({ evalRoot: required(options, "eval"), executionId: required(options, "execution"), result: required(options, "result") });
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
