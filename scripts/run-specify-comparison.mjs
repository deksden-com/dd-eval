#!/usr/bin/env node
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runSpecifyComparison } from "../lib/specify-comparison.mjs";

const repo = fileURLToPath(new URL("../", import.meta.url));
const usage = "node scripts/run-specify-comparison.mjs --campaign <directory> --base-home <prepared engine/config home> --profile <file> [--profile <file> ...] [--poll-ms 5000]\nSubmission is asynchronous. SIGINT/SIGTERM cancel polling only, never stop the EVAL. Reuse the same campaign to observe retained IDs; uncertain launches are never repeated.";
const args = process.argv.slice(2), profiles = [];
let campaignDir, baseHome, pollMs = 5000;
for (let index = 0; index < args.length; index++) {
  const flag = args[index];
  if (flag === "--help") { console.log(usage); process.exit(0); }
  const value = args[++index];
  if (!value) throw new Error(usage);
  if (flag === "--profile") profiles.push(path.resolve(value));
  else if (flag === "--campaign") campaignDir = path.resolve(value);
  else if (flag === "--base-home") baseHome = path.resolve(value);
  else if (flag === "--poll-ms") pollMs = Number(value);
  else throw new Error(`Unknown flag ${flag}\n${usage}`);
}
if (!campaignDir || !baseHome || !profiles.length) throw new Error(usage);
const abort = new AbortController();
for (const signal of ["SIGINT", "SIGTERM"]) process.once(signal, () => abort.abort(new Error(`Comparison cancelled by ${signal}; retained EVAL remains running`)));

async function cli(variant, args) {
  // Isolate EVAL homes, not the registry which fences shared host resources.
  const env = { ...process.env, DD_EVAL_HOME: variant.home,
    DD_FLOW_BIN: path.join(baseHome, "published-engine/node_modules/@deksden-com/dd-flow-cli/dist/cli.js"),
    DD_FLOW_CONFIG_HOME: path.join(baseHome, "engine-config"), DD_FLOW_RESOURCE_HOME: process.env.DD_FLOW_RESOURCE_HOME || path.join(baseHome, "resources") };
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [path.join(repo, "bin/dd-eval.mjs"), "runner", ...args], { cwd: repo, env, stdio: ["ignore", "pipe", "inherit"] });
    const chunks = [];
    child.stdout.on("data", chunk => chunks.push(chunk));
    child.once("error", reject);
    child.once("close", code => {
      if (code !== 0) return reject(Object.assign(new Error(`runner ${args.slice(0, 2).join(" ")} exited ${code}; outcome may be unknown`), { code: "comparison_cli_failed" }));
      try { resolve(JSON.parse(Buffer.concat(chunks).toString("utf8"))); } catch (error) { reject(Object.assign(error, { code: "comparison_ack_unknown" })); }
    });
    // Do not kill submission on cancel: losing its acknowledgment invites duplicates.
  });
}
try {
  const receipt = await runSpecifyComparison({ campaignDir, baseHome, profileFiles: profiles, pollMs, signal: abort.signal,
    preflight: variant => cli(variant, ["eval", "preflight", "--profile", variant.profile_file]),
    run: variant => cli(variant, ["eval", "run", "--profile", variant.profile_file, "--expected-inputs", JSON.stringify({
      profile_sha256: variant.profile_sha256, contract_sha256: variant.contract_sha256,
      admission_sha256: variant.admission_sha256, checkpoint_sha256: variant.checkpoint_sha256, fixture_sha256: variant.fixture_sha256 })]),
    status: variant => cli(variant, ["status", "--eval", variant.ack.root]),
    onStatus: observation => console.log(JSON.stringify(observation)) });
  console.log(JSON.stringify({ state: receipt.state, receipt: path.join(campaignDir, "receipt.json"), variants: receipt.variants.map(variant => variant.ack),
    limitations: "Independent SPECIFY trajectories, not identical-input decision benchmarks; paused time is not Judge compute; one sample is not a causal speed/accuracy estimate." }));
} catch (error) { console.error(JSON.stringify({ code: error.code ?? "comparison_failed", message: error.message, receipt: path.join(campaignDir, "receipt.json") })); process.exitCode = 1; }
