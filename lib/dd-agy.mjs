import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const DEFAULT_MODEL = "gemini-3.1-pro-high";

export class AgyError extends Error {
  constructor(code, message, retryable = false, details) { super(message); this.code = code; this.retryable = retryable; this.details = details; }
}

export function executable(bin, args = []) {
  return /\.[cm]?js$/.test(bin) ? { command: process.execPath, args: [bin, ...args] } : { command: bin, args };
}

export async function runAgy(bin, args, options = {}) {
  const target = executable(bin, args);
  return await new Promise((resolve, reject) => {
    const child = spawn(target.command, target.args, { cwd: options.cwd, env: options.env ?? process.env, stdio: ["pipe", "pipe", "pipe"] });
    let stdout = "", stderr = "", settled = false;
    const timer = setTimeout(() => { child.kill("SIGTERM"); finish(new AgyError("agy_timeout", `${args[0] ?? "agy"} timed out`, true)); }, options.timeoutMs ?? 30_000);
    const finish = (error, value) => { if (settled) return; settled = true; clearTimeout(timer); error ? reject(error) : resolve(value); };
    child.stdout.setEncoding("utf8").on("data", chunk => stdout += chunk);
    child.stderr.setEncoding("utf8").on("data", chunk => stderr += chunk);
    child.on("error", error => finish(error));
    child.on("close", code => code === 0 ? finish(null, { stdout, stderr, code }) : finish(new AgyError("agy_cli_failed", stderr.trim() || stdout.trim() || `agy exited ${code}`, false, { exit_code: code })));
    child.stdin.end(options.stdin ?? "");
  });
}

export function usageSnapshot(result = {}, toolCalls = {}) {
  const usage = result.usage && typeof result.usage === "object" ? result.usage : {};
  const numberOrNull = value => value == null || !Number.isFinite(Number(value)) ? null : Number(value);
  return {
    // A missing counter is unknown, not a measured zero.
    input_tokens: numberOrNull(usage.input_tokens), output_tokens: numberOrNull(usage.output_tokens),
    reasoning_tokens: numberOrNull(usage.thinking_tokens), cache_read_tokens: numberOrNull(usage.cache_read_tokens),
    total_tokens: numberOrNull(usage.total_tokens), tool_calls: toolCalls
  };
}

export function observedProfile(init = {}, requested = {}) {
  return { provider: requested.provider ?? "google", model: init.model ?? requested.model ?? null, reasoning: requested.reasoning ?? null, mode: requested.mode ?? null, permission_mode: init.permission_mode ?? null };
}

export function assertProfile(requested, observed) {
  for (const key of ["provider", "model", "reasoning", "mode"]) if ((requested[key] ?? null) !== (observed[key] ?? null)) throw new AgyError("agy_profile_drift", `Antigravity ${key} drift`, false, { requested: requested[key] ?? null, observed: observed[key] ?? null });
  if (requested.permission_mode && observed.permission_mode !== requested.permission_mode) throw new AgyError("agy_profile_drift", "Antigravity permission mode drift", false, { requested: requested.permission_mode, observed: observed.permission_mode });
  return { requested, observed, matched: true };
}

export async function doctor(options = {}) {
  const bin = options.bin ?? process.env.DD_AGY_BIN ?? "agy", temporary = await mkdtemp(path.join(os.tmpdir(), "dd-agy-doctor-"));
  try {
    const version = (await runAgy(bin, ["--version"], { timeoutMs: 10_000 })).stdout.trim();
    const models = await runAgy(bin, [`--gemini_dir=${temporary}`, "--app_data_dir=runtime", "models"], { timeoutMs: options.timeoutMs ?? 30_000 });
    const modelIds = models.stdout.split(/\r?\n/).map(line => line.split(/\s+/)[0]).filter(Boolean);
    if (!modelIds.includes(options.model ?? DEFAULT_MODEL)) throw new AgyError("agy_model_unavailable", `required Antigravity model is unavailable: ${options.model ?? DEFAULT_MODEL}`);
    return { compatible: true, observed_runtime: { agy: version, dd_harness_contract: "dd-agy-harness@1" }, isolation: { gemini_dir: "verified", app_data_dir: "verified" }, auth: "available", models: modelIds };
  } finally { await rm(temporary, { recursive: true, force: true }); }
}
