import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";

import { AcpBridge } from "./dd-zcode.mjs";

export const GROK_BASELINE = Object.freeze({ grok: "1.0.12", acp: 1, dd_harness: "dd-grok-harness@1" });

function fail(message, code) { const error = new Error(message); if (code) error.code = code; throw error; }
function absolute(value, label) { if (!value || !path.isAbsolute(value)) fail(`${label} must be an absolute path`); return path.resolve(value); }
function text(value, label) { if (typeof value !== "string" || !value.trim()) fail(`${label} is required`); return value.trim(); }
function executable(command, args = []) { const resolved = command ?? process.env.DD_GROK_BIN ?? "grok"; return /\.[cm]?js$/.test(resolved) ? { command: process.execPath, args: [resolved, ...args] } : { command: resolved, args }; }

async function commandOutput(command, args) {
  const target = executable(command, args);
  return await new Promise((resolve, reject) => {
    const child = spawn(target.command, target.args, { stdio: ["ignore", "pipe", "pipe"] }); let stdout = ""; let stderr = "";
    child.stdout.setEncoding("utf8").on("data", (chunk) => (stdout += chunk)); child.stderr.setEncoding("utf8").on("data", (chunk) => (stderr += chunk));
    child.on("error", reject); child.on("close", (code) => code === 0 ? resolve(stdout.trim()) : reject(new Error(stderr.trim() || `${target.command} exited ${code}`)));
  });
}

function profile(options) { return { provider: "xai", model: options.model ?? null, reasoning: options.reasoning ?? null, mode: options.mode ?? "bypassPermissions" }; }
function requiredProfile(options) { const result = profile(options); text(result.model, "--model"); text(result.reasoning, "--reasoning"); return result; }
function requireJournal(options) { absolute(options.journal, "--journal"); }
function receipt(options, value) { return options.daemonId ? { daemon_id: options.daemonId, ...value } : value; }
function unwrap(value) { return value?.result ?? value ?? {}; }
function extension(method) { return method.startsWith("_") ? method : `_${method}`; }
function usageScope(options, providerSessionId) { return providerSessionId === options.rootProviderSessionId ? "execution_tree_inclusive" : "physical_session"; }
function emptyToolCalls() { return { total: 0, failures: 0, by_tool: {} }; }
function sessionToolCalls(options, bridge, sessionId) { return options.toolUsage ? (options.toolUsage.get(sessionId) ?? emptyToolCalls()) : bridge.toolSummary(); }
function recordToolCalls(options, bridge, sessionId, cursor) {
  const result = options.toolUsage
    ? sessionToolCalls(options, bridge, sessionId)
    : typeof bridge.toolSummarySince === "function"
      ? bridge.toolSummarySince(cursor)
      : bridge.toolSummary();
  options.toolUsage?.set(sessionId, result);
  return result;
}

function bridgeOptions(options) {
  const requested = profile(options);
  const grokHome = options.grokHome ? absolute(options.grokHome, "--grok-home") : null;
  return {
    ...options,
    // AcpBridge defaults to zcode-acp; Grok must always name its own executable.
    bin: options.bin ?? process.env.DD_GROK_BIN ?? "grok",
    commandArgs: ["agent", "--no-leader", "--always-approve", "--model", requested.model ?? "grok-4.6", "--reasoning-effort", requested.reasoning ?? "high", "stdio"],
    env: { ...(grokHome ? { HOME: grokHome, GROK_HOME: grokHome } : {}), ...(options.authPath ? { GROK_AUTH_PATH: absolute(options.authPath, "--auth-path") } : {}) },
    clientInfo: { name: "dd-grok", version: "0.1.0" }, permission: "allow"
  };
}

async function withBridge(options, operation) {
  const bridge = new AcpBridge(bridgeOptions(options));
  try { const initialized = await bridge.start(); return await operation(bridge, initialized); }
  finally { await bridge.close(); }
}

export function observedProfile(initialized, requested) {
  const state = initialized?._meta?.modelState ?? {};
  const model = state.currentModelId ?? requested.model ?? null;
  const available = (state.availableModels ?? []).find((item) => item?.modelId === model);
  return { provider: "xai", model, reasoning: available?._meta?.reasoningEffort ?? requested.reasoning ?? null, mode: requested.mode ?? "bypassPermissions" };
}

export function assertProfile(requested, observed) {
  const mismatches = ["provider", "model", "reasoning", "mode"].flatMap((key) => requested[key] && requested[key] !== observed[key] ? [{ key, requested: requested[key], observed: observed[key] }] : []);
  if (mismatches.length) fail(`observed Grok Build profile mismatch: ${JSON.stringify(mismatches)}`, "profile_mismatch");
  return { status: "matched", requested, observed };
}

async function sessionInfo(bridge, sessionId) { return unwrap(await bridge.request(extension("x.ai/session/info"), { sessionId })); }
async function sessionUsage(bridge, sessionId) { try { return unwrap(await bridge.request(extension("x.ai/session/usage"), { sessionId })); } catch (error) { return { unavailable: true, error: error.message }; } }
async function subagents(bridge, sessionId) { return unwrap(await bridge.request(extension("x.ai/subagent/list_running"), { sessionId })); }

async function inspect(bridge, sessionId, options) {
  const [info, topology, usage] = await Promise.all([sessionInfo(bridge, sessionId), subagents(bridge, sessionId), sessionUsage(bridge, sessionId)]);
  return { info, subagents: topology, usage, observed_profile: observedProfile(options.initialized, profile(options)) };
}

async function forwardUsage(options, providerSessionId, usage, toolCalls) {
  if (!options.ddFlowBin || !usage || usage.unavailable) return;
  const measured = usage.usage && typeof usage.usage === "object" ? usage.usage : usage;
  const input = JSON.stringify({ provider_session_id: providerSessionId, daemon_id: options.daemonId ?? null, observed_at: new Date().toISOString(), usage: measured, tool_calls: toolCalls, usage_scope: usageScope(options, providerSessionId), completeness: measured.usageIsIncomplete ? "partial" : "complete" });
  const target = executable(options.ddFlowBin, ["grok", "usage", "ingest", "--project-root", absolute(options.projectRoot, "--project-root"), "--json"]);
  await new Promise((resolve, reject) => {
    const child = spawn(target.command, target.args, { env: { ...process.env, ...(options.ddFlowHome ? { DD_FLOW_HOME: absolute(options.ddFlowHome, "--dd-flow-home") } : {}) }, stdio: ["pipe", "ignore", "pipe"] }); let stderr = "";
    child.stderr.setEncoding("utf8").on("data", (chunk) => (stderr += chunk)); child.on("error", reject); child.on("close", (code) => code === 0 ? resolve() : reject(new Error(stderr || "dd-flow grok usage failed"))); child.stdin.end(`${input}\n`);
  });
}

async function identity(bridge, options) {
  const sessionId = text(options.sessionId, "--session-id");
  if (!options.liveSession) await bridge.request("session/load", { sessionId, cwd: absolute(options.cwd, "--cwd"), mcpServers: [] });
  return sessionId;
}

async function cancelTree(bridge, sessionId) {
  const before = await subagents(bridge, sessionId); const cancellations = [];
  for (const child of before.subagents ?? []) {
    const childId = child.sessionId ?? child.subagentId;
    if (childId) cancellations.push(await bridge.request(extension("x.ai/subagent/cancel"), { sessionId, subagentId: childId }));
  }
  bridge.notify("session/cancel", { sessionId });
  for (let attempt = 0; attempt < 50; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 100));
    const after = await subagents(bridge, sessionId);
    if (!(after.subagents ?? []).length) return { before, after, cancellations };
  }
  fail("Grok Build Session tree did not settle after cancellation", "partial_cancellation");
}

export async function doctor(options = {}) {
  const raw = await commandOutput(options.bin, ["version", "--json"]); const version = JSON.parse(raw).currentVersion?.split(" ")[0] ?? raw.trim();
  if (version !== GROK_BASELINE.grok) fail(`unsupported Grok Build version: ${version}; expected ${GROK_BASELINE.grok}`, "unsupported_version");
  return { compatible: true, versions: { grok: version, dd_harness: GROK_BASELINE.dd_harness }, baseline: GROK_BASELINE };
}

export async function createSession(options) { requireJournal(options); return await withBridge(options, async (bridge, initialized) => await createSessionWithBridge(bridge, options, initialized)); }
export async function createSessionWithBridge(bridge, options, initialized) {
  requireJournal(options); const cwd = absolute(options.cwd, "--cwd"); const requested = requiredProfile(options); const prompt = text(options.prompt, "prompt");
  const created = await bridge.request("session/new", { cwd, mcpServers: [], ...(options.authMethodId ? { authMethodId: options.authMethodId } : {}) });
  const providerSessionId = text(created.sessionId, "Grok Build sessionId"); const profileReceipt = assertProfile(requested, observedProfile(initialized, requested));
  await options.onSessionCreated?.({ provider_session_id: providerSessionId, adapter_session_id: providerSessionId, cwd });
  const local = { ...options, initialized, rootProviderSessionId: providerSessionId }; await forwardUsage(local, providerSessionId, await sessionUsage(bridge, providerSessionId), sessionToolCalls(local, bridge, providerSessionId));
  const cursor = bridge.toolCursor(); const turn = await bridge.request("session/prompt", { sessionId: providerSessionId, prompt: [{ type: "text", text: prompt }] }, options.timeoutMs ?? 1_800_000);
  await bridge.flush(); const evidence = await inspect(bridge, providerSessionId, local); evidence.tool_calls = recordToolCalls(local, bridge, providerSessionId, cursor); await forwardUsage(local, providerSessionId, evidence.usage, evidence.tool_calls);
  return receipt(options, { harness: "grok-acp", runtime_family: "grok", provider_session_id: providerSessionId, adapter_session_id: providerSessionId, cwd, initialized, turn, profile: profileReceipt, evidence });
}

export async function promptSession(options) { requireJournal(options); return await withBridge(options, async (bridge, initialized) => await promptSessionWithBridge(bridge, { ...options, initialized })); }
export async function promptSessionWithBridge(bridge, options) {
  requireJournal(options); const sessionId = await identity(bridge, options); const prompt = text(options.prompt, "prompt"); const requested = requiredProfile(options); const profileReceipt = assertProfile(requested, observedProfile(options.initialized, requested));
  const local = { ...options, rootProviderSessionId: options.rootProviderSessionId ?? sessionId }; await forwardUsage(local, sessionId, await sessionUsage(bridge, sessionId), sessionToolCalls(local, bridge, sessionId));
  const cursor = bridge.toolCursor(); const turn = await bridge.request("session/prompt", { sessionId, prompt: [{ type: "text", text: prompt }] }, options.timeoutMs ?? 1_800_000); await bridge.flush();
  const evidence = await inspect(bridge, sessionId, local); evidence.tool_calls = recordToolCalls(local, bridge, sessionId, cursor); await forwardUsage(local, sessionId, evidence.usage, evidence.tool_calls);
  if (!options.allowBackground && (evidence.subagents?.subagents ?? []).length) { await cancelTree(bridge, sessionId); fail("background Grok Build subagents cannot outlive the one-shot dd-grok connection"); }
  return receipt(options, { harness: "grok-acp", provider_session_id: sessionId, adapter_session_id: sessionId, turn, profile: profileReceipt, evidence });
}

export async function inspectSession(options) { requireJournal(options); return await withBridge(options, async (bridge, initialized) => await inspectSessionWithBridge(bridge, { ...options, initialized })); }
export async function inspectSessionWithBridge(bridge, options) { requireJournal(options); const sessionId = await identity(bridge, options); const evidence = await inspect(bridge, sessionId, options); evidence.tool_calls = sessionToolCalls(options, bridge, sessionId); await forwardUsage(options, sessionId, evidence.usage, evidence.tool_calls); return receipt(options, { harness: "grok-acp", provider_session_id: sessionId, adapter_session_id: sessionId, ...evidence }); }
export async function cancelSession(options) { requireJournal(options); return await withBridge(options, async (bridge) => await cancelSessionWithBridge(bridge, options)); }
export async function cancelSessionWithBridge(bridge, options) { requireJournal(options); const sessionId = await identity(bridge, options); return receipt(options, { harness: "grok-acp", provider_session_id: sessionId, adapter_session_id: sessionId, ...await cancelTree(bridge, sessionId) }); }
export async function forkSession(options) { requireJournal(options); return await withBridge(options, async (bridge) => await forkSessionWithBridge(bridge, options)); }
export async function forkSessionWithBridge(bridge, options) {
  requireJournal(options); const sessionId = await identity(bridge, options); const target = options.target;
  if (!target || typeof target !== "object" || !target.newCwd) fail("explicit --target-json with newCwd is required");
  if ((await subagents(bridge, sessionId)).subagents?.length) fail("cannot fork while Grok Build subagents are running", "tree_not_settled");
  const source = await sessionInfo(bridge, sessionId);
  const result = unwrap(await bridge.request(extension("x.ai/session/fork"), { sourceSessionId: sessionId, sourceCwd: source.cwd ? absolute(source.cwd, "Grok Build source cwd") : absolute(options.cwd, "--cwd"), ...target }));
  const child = text(result.newSessionId, "Grok Build fork newSessionId"); return receipt(options, { harness: "grok-acp", parent_provider_session_id: sessionId, provider_session_id: child, adapter_session_id: child, target, fork: result });
}
export async function promptFromFile(file) { return await readFile(absolute(file, "--prompt-file"), "utf8"); }
