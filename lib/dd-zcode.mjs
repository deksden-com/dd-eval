import { observedTimeout } from "./observation-clock.mjs";
import { spawn } from "node:child_process";
import { appendFile, mkdir, readFile } from "node:fs/promises";
import path from "node:path";
import readline from "node:readline";
import { stopProcessGroup } from "./managed-daemon.mjs";

const ZCODE_HARNESS_CONTRACT = "dd-zcode-harness@1";

function fail(message, code) { const error = new Error(message); if (code) error.code = code; throw error; }
function absolute(value, label) { if (!value || !path.isAbsolute(value)) fail(`${label} must be an absolute path`); return path.resolve(value); }
function text(value, label) { if (typeof value !== "string" || !value.trim()) fail(`${label} is required`); return value.trim(); }
function now() { return new Date().toISOString(); }

function executable(command, args = []) {
  const resolved = command ?? process.env.DD_ZCODE_ACP_BIN ?? "zcode-acp";
  return /\.[cm]?js$/.test(resolved) ? { command: process.execPath, args: [resolved, ...args] } : { command: resolved, args };
}

async function commandOutput(command, args) {
  const target = executable(command, args);
  return await new Promise((resolve, reject) => {
    const child = spawn(target.command, target.args, { stdio: ["ignore", "pipe", "pipe"] });
    let stdout = ""; let stderr = "";
    child.stdout.setEncoding("utf8").on("data", (chunk) => (stdout += chunk));
    child.stderr.setEncoding("utf8").on("data", (chunk) => (stderr += chunk));
    child.on("error", reject);
    child.on("close", (code) => code === 0 ? resolve(stdout.trim()) : reject(new Error(stderr.trim() || `${target.command} exited ${code}`)));
  });
}

async function runWithStdin(command, args, stdin, env = {}) {
  const target = executable(command, args);
  return await new Promise((resolve, reject) => {
    const child = spawn(target.command, target.args, { env: { ...process.env, ...env }, stdio: ["pipe", "pipe", "pipe"] });
    let stdout = ""; let stderr = "";
    child.stdout.setEncoding("utf8").on("data", (chunk) => (stdout += chunk));
    child.stderr.setEncoding("utf8").on("data", (chunk) => (stderr += chunk));
    child.on("error", reject);
    child.on("close", (code) => code === 0 ? resolve(stdout.trim()) : reject(new Error(stderr.trim() || `${target.command} exited ${code}`)));
    child.stdin.end(stdin);
  });
}

class Journal {
  constructor(file) {
    this.file = file ? absolute(file, "--journal") : null;
    this.pending = this.file ? mkdir(path.dirname(this.file), { recursive: true }) : Promise.resolve();
    this.order = 0;
  }
  write(kind, payload) {
    if (!this.file) return;
    const line = JSON.stringify({ order: ++this.order, observed_at: now(), kind, payload });
    this.pending = this.pending.then(() => appendFile(this.file, `${line}\n`));
  }
  async flush() { await this.pending; }
}

export class AcpBridge {
  constructor(options) {
    this.options = options;
    this.nextId = 1;
    this.pending = new Map();
    this.sessionActivity = new Map();
    this.notifications = Promise.resolve();
    this.notificationError = null;
    this.bridgeStderr = "";
    this.toolCalls = new Map();
    this.failedToolCalls = new Set();
    this.assistantText = new Map();
    this.providerErrors = new Map();
    this.journal = new Journal(options.journal);
  }

  configure(options) { this.options = { ...this.options, ...options }; }

  async start() {
    const target = executable(this.options.bin, this.options.commandArgs ?? ["server"]);
    const cwd = this.options.cwd ? absolute(this.options.cwd, "--cwd") : process.cwd();
    this.child = spawn(target.command, target.args, { cwd, detached: process.platform !== "win32", stdio: ["pipe", "pipe", "pipe"], env: { ...process.env, ...(this.options.env ?? {}) } });
    this.child.stderr.setEncoding("utf8").on("data", (chunk) => { this.bridgeStderr += String(chunk); this.journal.write("bridge_stderr", { text: String(chunk) }); });
    this.child.on("error", (error) => { error.code ??= "bridge_exited"; this.rejectAll(error); });
    this.child.on("exit", (code) => { const error = new Error(`zcode-acp exited ${code}${this.bridgeStderr.trim() ? `: ${this.bridgeStderr.trim()}` : ""}`); error.code = "bridge_exited"; this.rejectAll(error); });
    readline.createInterface({ input: this.child.stdout }).on("line", (line) => this.receive(line));
    return await this.request("initialize", {
      protocolVersion: 1,
      clientCapabilities: { fs: { readTextFile: false, writeTextFile: false }, elicitation: { form: {} } },
      clientInfo: this.options.clientInfo ?? { name: "dd-zcode", version: "0.1.0" },
    });
  }

  receive(line) {
    let message;
    try { message = JSON.parse(line); } catch { this.journal.write("malformed", { line }); return; }
    this.journal.write("inbound", message);
    if (typeof message.params?.sessionId === "string" && isProductiveSessionNotification(message)) this.sessionActivity.set(message.params.sessionId, Date.now());
    const update = message.params?.update;
    // ZCode emits this as `session/update`; Grok Build wraps the same ACP
    // payload in `_x.ai/session_notification`.  Preserve either provider's
    // native error before its generic JSON-RPC terminal response arrives.
    if (typeof message.params?.sessionId === "string" && update?.sessionUpdate === "retry_state" && update.type === "failed") {
      this.providerErrors.set(message.params.sessionId, update);
    }
    if (message.method === "session/update" && message.params?.update?.sessionUpdate === "agent_message_chunk" && message.params.update.content?.type === "text") {
      const sessionId = message.params.sessionId;
      this.assistantText.set(sessionId, `${this.assistantText.get(sessionId) ?? ""}${message.params.update.content.text ?? ""}`);
    }
    this.observeToolCall(message);
    if (message.id !== undefined && message.method) { void this.answer(message).catch((error) => this.rejectAll(error)); return; }
    if (message.id !== undefined) {
      const pending = this.pending.get(message.id);
      if (!pending) return;
      clearTimeout(pending.timer); if (pending.idleTimer) clearInterval(pending.idleTimer); this.pending.delete(message.id);
      if (message.error) {
        const details = message.error.data?.details ?? message.error.data?.message ?? null;
        const provider = this.providerErrors.get(pending.sessionId);
        this.providerErrors.delete(pending.sessionId);
        const providerDetails = provider?.message ?? null;
        const messageText = [message.error.message, details, providerDetails].filter(Boolean).join(": ") || JSON.stringify(message.error);
        const error = new Error(messageText);
        error.code = /rate limit/i.test(messageText) ? "provider_rate_limited" : /payment required|usage balance exhausted/i.test(messageText) ? "provider_quota_exhausted" : "acp_request_failed";
        error.retryable = /rate limit/i.test(messageText);
        error.details = { acp_code: message.error.code ?? null, ...(details ? { provider_details: details } : {}), ...(providerDetails ? { provider_update: provider } : {}) };
        pending.reject(error);
      }
      else { this.providerErrors.delete(pending.sessionId); pending.resolve(message.result ?? {}); }
      return;
    }
    if (message.method) this.notifications = this.notifications
      .then(async () => await this.options.onNotification?.(message))
      .catch((error) => { this.notificationError ??= error; });
  }

  observeToolCall(message) {
    if (message.method !== "session/update") return;
    const update = message.params?.update;
    const id = update?.toolCallId;
    if (!id) return;
    if (update.sessionUpdate === "tool_call") this.toolCalls.set(id, update?._meta?.claudeCode?.toolName ?? update.title?.split(":", 1)[0] ?? "unknown");
    if (update.sessionUpdate === "tool_call_update" && ["failed", "error"].includes(update.status)) this.failedToolCalls.add(id);
  }

  toolSummary() {
    const by_tool = {};
    for (const name of this.toolCalls.values()) by_tool[name] = (by_tool[name] ?? 0) + 1;
    return { total: this.toolCalls.size, failures: this.failedToolCalls.size, by_tool };
  }
  toolCursor() { return new Set(this.toolCalls.keys()); }
  assistantTextCursor(sessionId) { return (this.assistantText.get(sessionId) ?? "").length; }
  assistantTextSince(sessionId, cursor) { return (this.assistantText.get(sessionId) ?? "").slice(cursor); }
  toolSummarySince(cursor) {
    const by_tool = {}; let total = 0; let failures = 0;
    for (const [id, name] of this.toolCalls) {
      if (cursor.has(id)) continue;
      total += 1; by_tool[name] = (by_tool[name] ?? 0) + 1;
      if (this.failedToolCalls.has(id)) failures += 1;
    }
    return { total, failures, by_tool };
  }

  async answer(message) {
    await this.notifications;
    let result;
    if (message.method === "session/request_permission") {
      const options = message.params?.options ?? [];
      const selected = this.options.permission === "allow" && !this.notificationError
        ? options.find((item) => item.optionId === "allow_once") ?? options[0]
        : options.find((item) => item.optionId === "deny");
      result = selected ? { outcome: { outcome: "selected", optionId: selected.optionId } } : { outcome: { outcome: "cancelled" } };
    } else if (message.method === "elicitation/create") {
      result = this.options.answers ? { action: "accept", content: this.options.answers } : { action: "decline", reason: "dd-zcode has no declared answers" };
    } else {
      this.send({ jsonrpc: "2.0", id: message.id, error: { code: -32601, message: `unsupported client request: ${message.method}` } });
      return;
    }
    this.journal.write("interaction", { method: message.method, params: message.params, result });
    this.send({ jsonrpc: "2.0", id: message.id, result });
  }

  request(method, params = {}, timeoutMs = 30_000, { idleSessionId = null, idleTimeoutMs = null } = {}) {
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      const finish = (error) => {
        const pending = this.pending.get(id); if (!pending) return;
        clearTimeout(pending.timer); if (pending.idleTimer) clearInterval(pending.idleTimer); this.pending.delete(id); reject(error);
      };
      // Productive Turns use the sliding session-activity timeout below.  A
      // second wall-clock timeout would kill an active, long-running Turn.
      const timer = Number.isFinite(timeoutMs) && timeoutMs > 0
        ? observedTimeout(() => finish(Object.assign(new Error(`${method} timed out`), { code: "rpc_timeout", details: { method, session_id: params.sessionId ?? null } })), timeoutMs)
        : null;
      const validIdleTimeout = Number.isFinite(idleTimeoutMs) && idleTimeoutMs > 0 ? idleTimeoutMs : null;
      if (idleSessionId) this.sessionActivity.set(idleSessionId, Date.now());
      if (params.sessionId) this.providerErrors.delete(params.sessionId);
      let lastTimerAt = Date.now();
      let resumedAt = null;
      const checkIdle = async () => {
        if (!this.pending.has(id)) return;
        const observedAt = Date.now();
        const observationGapMs = observedAt - lastTimerAt;
        lastTimerAt = observedAt;
        // A host pause makes wall time jump while this process cannot observe
        // native progress. Keep the SAME native request alive so its late
        // result can still be persisted. Grant one fresh observation window;
        // do not rewrite provider activity or resend the request.
        if (observationGapMs > 60_000) {
          resumedAt = observedAt;
          this.journal.write("observation_gap", { method, request_id: id, session_id: idleSessionId, observation_gap_ms: observationGapMs, observed_at: new Date(observedAt).toISOString() });
          return;
        }
        const lastActivity = this.sessionActivity.get(idleSessionId) ?? Date.now();
        if (observedAt - Math.max(lastActivity, resumedAt ?? lastActivity) < validIdleTimeout) return;
        const error = new Error(`${method} received no session update for ${validIdleTimeout}ms`);
        error.code = "subject_liveness_timeout";
        error.details = { session_id: idleSessionId, last_activity_at: new Date(lastActivity).toISOString(), idle_timeout_ms: validIdleTimeout };
        finish(error);
      };
      const idleTimer = validIdleTimeout ? setInterval(() => { void checkIdle(); }, Math.max(10, Math.min(1_000, Math.floor(validIdleTimeout / 4)))) : null;
      this.pending.set(id, { resolve, reject, timer, idleTimer, sessionId: params.sessionId ?? null });
      this.send({ jsonrpc: "2.0", id, method, params });
    });
  }

  notify(method, params = {}) { this.send({ jsonrpc: "2.0", method, params }); }
  send(message) { this.journal.write("outbound", message); this.child.stdin.write(`${JSON.stringify(message)}\n`); }
  rejectAll(error) { for (const pending of this.pending.values()) { clearTimeout(pending.timer); if (pending.idleTimer) clearInterval(pending.idleTimer); pending.reject(error); } this.pending.clear(); }
  async flush() { await this.notifications; await this.journal.flush(); if (this.notificationError) throw this.notificationError; }
  async close() {
    let flushError = null;
    try { await this.flush(); } catch (error) { flushError = error; }
    if (this.child) {
      this.child.stdin.end();
      await Promise.race([new Promise((resolve) => this.child.once("exit", resolve)), new Promise((resolve) => setTimeout(resolve, 2000))]);
      await stopProcessGroup(this.child, 2_000);
    }
    await this.journal.flush();
    if (flushError) throw flushError;
  }
}

function isProductiveSessionNotification(message) {
  if (!["session/update", "_x.ai/session_notification"].includes(message.method)) return false;
  const update = message.params?.update;
  // Transport heartbeat is not evidence of model work. Every other documented
  // session update proves that the native session is still responsive.
  return update?.sessionUpdate !== "heartbeat" && update?.type !== "heartbeat";
}

export function observedProfile(read) {
  const model = read?.settings?.model?.current ?? {};
  return {
    provider: typeof model.providerId === "string" ? model.providerId : null,
    model: typeof model.modelId === "string" ? model.modelId : null,
    reasoning: read?.settings?.thoughtLevel?.current ?? null,
    mode: read?.settings?.mode?.current ?? read?.projection?.mode ?? null,
  };
}

export function assertProfile(requested, observed) {
  const mismatches = [];
  for (const key of ["provider", "model", "reasoning", "mode"]) if (requested[key] && requested[key] !== observed[key]) mismatches.push({ key, requested: requested[key], observed: observed[key] });
  if (mismatches.length) fail(`observed ZCode profile mismatch: ${JSON.stringify(mismatches)}`, "profile_mismatch");
  return { status: "matched", requested, observed };
}

async function resume(bridge, sessionId, cwd) {
  await bridge.request("session/resume", { sessionId: text(sessionId, "--session-id"), cwd: absolute(cwd, "--cwd"), mcpServers: [] });
  return sessionId;
}

async function inspect(bridge, sessionId) {
  const [read, subagents, usage] = await Promise.all([
    bridge.request("zcode/session/read", { sessionId }),
    bridge.request("zcode/session/subagents", { sessionId }),
    bridge.request("zcode/session/usage", { sessionId }),
  ]);
  return { read, subagents, usage, observed_profile: observedProfile(read) };
}

// The journal is the immutable transcript.  CLI receipts only need the
// operational projection; returning every message makes a routine status
// command enormous and obscures the useful facts.
function publicEvidence(evidence) {
  return {
    ...evidence,
    read: {
      projection: evidence.read?.projection ?? null,
      session: evidence.read?.session ?? null,
      settings: evidence.read?.settings ?? null,
    },
  };
}

// ACP returns the terminal turn separately from its visible transcript.  The
// probe contract needs the literal terminal answer, so extract only text parts
// from the last assistant message rather than asking a model to interpret it.
export function latestAssistantText(read) {
  const messages = Array.isArray(read?.messages) ? read.messages : [];
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message?.info?.role !== "assistant") continue;
    const text = (Array.isArray(message.parts) ? message.parts : [])
      .filter((part) => part?.type === "text" && typeof part.text === "string")
      .map((part) => part.text)
      .join("")
      .trim();
    if (text) return text;
  }
  return null;
}

async function cancelTree(bridge, sessionId, before) {
  const cancellations = [];
  for (const child of before.running ?? []) {
    const taskId = child.taskId ?? child.agentId;
    if (taskId) cancellations.push(await bridge.request("session/cancelBackgroundTask", { sessionId, taskId }));
  }
  // ZCode's stop is deliberately idempotent.  Send it once: session/read
  // returns the full transcript, so polling it while the turn is stopping can
  // make cancellation slower than the work we are trying to interrupt.
  bridge.notify("session/cancel", { sessionId });
  let after = before;
  for (let attempt = 0; attempt < 6; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 1000));
    after = await bridge.request("zcode/session/subagents", { sessionId });
    if (!(after.running ?? []).length) break;
  }
  const read = await bridge.request("zcode/session/read", { sessionId });
  const root_status = read?.projection?.status ?? read?.session?.status ?? null;
  const settled = !(after.running ?? []).length && !cancellations.some((item) => item?.cancelled === false) && root_status !== "running";
  return { cancellations, before, after, root_status, cancellation_requested: !settled, settled };
}

// Cancel one known child without cancelling its parent turn.  The parent keeps
// its ACP listener, so later child lifecycle events still reach dd-flow.
export async function cancelChildWithBridge(bridge, options) {
  requireJournal(options);
  const identity = await controlledIdentity(bridge, options);
  const childSessionId = text(options.childSessionId, "--child-session-id");
  const before = await bridge.request("zcode/session/subagents", { sessionId: identity.adapterSessionId });
  const child = (before.running ?? []).find((item) => item.childSessionId === childSessionId);
  if (!child) fail(`ZCode has no running child ${childSessionId}`, "child_not_running");
  const taskId = child.taskId ?? child.agentId;
  if (!taskId) fail(`ZCode child ${childSessionId} has no cancellation identifier`, "child_cancel_unsupported");
  const cancellation = await bridge.request("session/cancelBackgroundTask", { sessionId: identity.adapterSessionId, taskId });
  let after = before;
  for (let attempt = 0; attempt < 6; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 1000));
    after = await bridge.request("zcode/session/subagents", { sessionId: identity.adapterSessionId });
    if (!(after.running ?? []).some((item) => item.childSessionId === childSessionId)) break;
  }
  if ((after.running ?? []).some((item) => item.childSessionId === childSessionId)) {
    fail(`ZCode child ${childSessionId} did not stop`, "partial_cancellation");
  }
  return receipt(options, {
    harness: "zcode-acp",
    provider_session_id: identity.providerSessionId,
    adapter_session_id: identity.adapterSessionId,
    child_session_id: childSessionId,
    cancellation,
    before,
    after,
  });
}

export async function cancelChild(options) {
  return await withBridge(options, async (bridge) => await cancelChildWithBridge(bridge, options));
}

async function controlledIdentity(bridge, options) {
  const providerSessionId = text(options.sessionId, "--session-id");
  const adapterSessionId = options.adapterSessionId ?? providerSessionId;
  if (!options.liveSession) await resume(bridge, adapterSessionId, options.cwd);
  const resolved = await bridge.request("zcode/session/resolve", { sessionId: adapterSessionId });
  if (resolved.providerSessionId !== providerSessionId) fail(`ZCode Session identity mismatch: expected ${providerSessionId}, observed ${resolved.providerSessionId}`, "session_identity_mismatch");
  return { providerSessionId, adapterSessionId };
}

async function applyProfile(bridge, sessionId, requested) {
  if (requested.mode) await bridge.request("session/set_mode", { sessionId, modeId: requested.mode });
  if (requested.reasoning) await bridge.request("session/setThoughtLevel", { sessionId, thoughtLevel: requested.reasoning });
  if (requested.model) await bridge.request("session/setModel", { sessionId, modelId: requested.provider ? `${requested.provider}\\${requested.model}` : requested.model });
  const read = await bridge.request("zcode/session/read", { sessionId });
  return assertProfile(requested, observedProfile(read));
}

function profile(options) { return { provider: options.provider ?? null, model: options.model ?? null, reasoning: options.reasoning ?? null, mode: options.mode ?? null }; }

function requiredProfile(options) {
  const requested = profile(options);
  for (const key of ["provider", "model", "reasoning", "mode"]) text(requested[key], `--${key}`);
  return requested;
}

function requireJournal(options) { absolute(options.journal, "--journal"); }

function receipt(options, value) { return options.daemonId ? { daemon_id: options.daemonId, ...value } : value; }

async function withBridge(options, operation) {
  const bridge = new AcpBridge(options);
  try { const initialized = await bridge.start(); return await operation(bridge, initialized); }
  finally { await bridge.close(); }
}

function flowForwarder(options, rootProviderSessionId) {
  if (!options.ddFlowBin) return undefined;
  const projectRoot = absolute(options.projectRoot, "--project-root");
  return async (notification) => {
    if (notification.method !== "session/update") return;
    const update = notification.params?.update;
    const command = update?.sessionUpdate === "tool_call" ? update.rawInput?.command ?? update.rawInput?.cmd : null;
    if (typeof command !== "string" || !command.includes("dd-flow")) return;
    const payload = zcodeLifecycleEnvelope(notification, options, rootProviderSessionId);
    const stdout = await runWithStdin(options.ddFlowBin, ["zcode", "event", "handle", "--project-root", projectRoot, "--json"], `${JSON.stringify(payload)}\n`, options.ddFlowHome ? { DD_FLOW_HOME: absolute(options.ddFlowHome, "--dd-flow-home") } : {});
    const receipt = stdout ? JSON.parse(stdout) : {};
    if (receipt.ok === false) fail(`dd-flow rejected ZCode event: ${JSON.stringify(receipt.error ?? receipt)}`);
  };
}

export function zcodeLifecycleEnvelope(notification, options, rootProviderSessionId) {
  return { ...notification, _meta: { ddZcode: {
    rootProviderSessionId,
    observedProfile: profile(options),
    ...(options.daemonId ? { daemonId: options.daemonId } : {}),
  } } };
}

async function forwardUsage(options, providerSessionId, usage, toolCalls) {
  if (!options.ddFlowBin || !usage) return;
  const projectRoot = absolute(options.projectRoot, "--project-root");
  const payload = {
    provider_session_id: providerSessionId,
    daemon_id: options.daemonId ?? null,
    observed_at: new Date().toISOString(),
    usage,
    // ZCode exposes counters for the addressed physical session only. State
    // this explicitly so dd-flow never has to infer an aggregation model.
    usage_scope: "physical_session",
    completeness: usage?.usageIsIncomplete ? "partial" : "complete",
    ...(toolCalls ? { tool_calls: toolCalls } : {}),
  };
  await runWithStdin(options.ddFlowBin, ["zcode", "usage", "ingest", "--project-root", projectRoot, "--json"], `${JSON.stringify(payload)}\n`, options.ddFlowHome ? { DD_FLOW_HOME: absolute(options.ddFlowHome, "--dd-flow-home") } : {});
}

export async function doctor(options = {}) {
  const zcodeAcp = await commandOutput(options.bin, ["--version"]);
  const zcodeAcpCommit = await commandOutput(options.bin, ["--dd-harness-commit"]);
  const ddHarness = await commandOutput(options.bin, ["--dd-harness-version"]);
  const zcodePath = options.zcodePath ?? process.env.ZCODE_PATH ?? "/Applications/ZCode.app/Contents/Resources/glm/zcode.cjs";
  const zcode = await commandOutput(zcodePath, ["--version"]);
  return { compatible: true, observed_runtime: { zcode, zcode_acp: zcodeAcp, zcode_acp_commit: zcodeAcpCommit, dd_harness_contract: ddHarness || ZCODE_HARNESS_CONTRACT } };
}

export async function createSession(options) {
  requireJournal(options);
  return await withBridge(options, async (bridge, initialized) => await createSessionWithBridge(bridge, options, initialized));
}

export async function createSessionWithBridge(bridge, options, initialized) {
  requireJournal(options);
  const cwd = absolute(options.cwd, "--cwd"); const requested = requiredProfile(options);
  const toolCursor = bridge.toolCursor();
  let forward;
  bridge.configure({ ...options, onNotification: async (event) => { await forward?.(event); await options.onNotification?.(event); } });
  const created = await bridge.request("session/new", { cwd, mcpServers: [] });
  const resolved = await bridge.request("zcode/session/resolve", { sessionId: created.sessionId });
  const providerSessionId = resolved.providerSessionId;
  const profile_receipt = await applyProfile(bridge, created.sessionId, requested);
  forward = flowForwarder(options, providerSessionId);
  const usage = await bridge.request("zcode/session/usage", { sessionId: created.sessionId });
  await forwardUsage(options, providerSessionId, usage, bridge.toolSummarySince(toolCursor));
  await bridge.flush();
  // ZCode materializes `subagents` only after its first prompt.  Session
  // creation is intentionally nonproductive, so querying that topology here
  // would both fail on real ZCode and turn the common create contract into an
  // implicit first turn.  The first prompt/inspect records full evidence.
  const evidence = { read: null, subagents: { running: [], completed: [] }, usage, observed_profile: profile_receipt.observed, tool_calls: bridge.toolSummarySince(toolCursor) };
  return receipt(options, { harness: "zcode-acp", runtime_family: "zcode", adapter_session_id: created.sessionId, provider_session_id: providerSessionId, cwd, initialized, profile: profile_receipt, evidence: publicEvidence(evidence) });
}

export async function promptSession(options) {
  requireJournal(options);
  return await withBridge(options, async (bridge) => await promptSessionWithBridge(bridge, options));
}

export async function promptSessionWithBridge(bridge, options) {
  requireJournal(options);
  const cwd = absolute(options.cwd, "--cwd"); const prompt = text(options.prompt, "prompt"); const requested = requiredProfile(options);
  const toolCursor = bridge.toolCursor();
  let forward;
  bridge.configure({ ...options, onNotification: async (event) => { await forward?.(event); await options.onNotification?.(event); } });
  const identity = await controlledIdentity(bridge, { ...options, cwd }); forward = flowForwarder(options, identity.providerSessionId);
  const profile_receipt = await applyProfile(bridge, identity.adapterSessionId, requested);
  await forwardUsage(options, identity.providerSessionId, await bridge.request("zcode/session/usage", { sessionId: identity.adapterSessionId }), bridge.toolSummarySince(toolCursor));
  const timeoutMs = options.timeoutMs ?? (options.livenessTimeoutMs ? null : 1_800_000);
  const turn = await bridge.request("session/prompt", { sessionId: identity.adapterSessionId, prompt: [{ type: "text", text: prompt }] }, timeoutMs, {
    idleSessionId: identity.adapterSessionId,
    idleTimeoutMs: options.livenessTimeoutMs ?? null,
  });
  await bridge.flush();
  const evidence = await inspect(bridge, identity.adapterSessionId);
  evidence.tool_calls = bridge.toolSummarySince(toolCursor);
  await forwardUsage(options, identity.providerSessionId, evidence.usage, evidence.tool_calls);
  if (!options.allowBackground && (evidence.subagents.running ?? []).length) {
    await cancelTree(bridge, identity.adapterSessionId, evidence.subagents);
    fail("background ZCode subagents cannot outlive the one-shot dd-zcode connection; the live child tree was cancelled");
  }
  return receipt(options, { harness: "zcode-acp", provider_session_id: identity.providerSessionId, adapter_session_id: identity.adapterSessionId, turn, profile: profile_receipt, evidence: publicEvidence(evidence) });
}

export async function inspectSession(options) {
  requireJournal(options);
  return await withBridge(options, async (bridge) => await inspectSessionWithBridge(bridge, options));
}

export async function inspectSessionWithBridge(bridge, options) {
  requireJournal(options);
  const identity = await controlledIdentity(bridge, options);
  return receipt(options, { harness: "zcode-acp", provider_session_id: identity.providerSessionId, adapter_session_id: identity.adapterSessionId, ...publicEvidence(await inspect(bridge, identity.adapterSessionId)) });
}

export async function cancelSession(options) {
  requireJournal(options);
  return await withBridge(options, async (bridge) => await cancelSessionWithBridge(bridge, options));
}

export async function cancelSessionWithBridge(bridge, options) {
  requireJournal(options);
  const identity = await controlledIdentity(bridge, options);
  const before = await bridge.request("zcode/session/subagents", { sessionId: identity.adapterSessionId });
  return receipt(options, { harness: "zcode-acp", provider_session_id: identity.providerSessionId, adapter_session_id: identity.adapterSessionId, ...await cancelTree(bridge, identity.adapterSessionId, before) });
}

export async function forkSession(options) {
  requireJournal(options);
  return await withBridge(options, async (bridge) => await forkSessionWithBridge(bridge, options));
}

export async function forkSessionWithBridge(bridge, options) {
  requireJournal(options);
  if (!options.target || typeof options.target !== "object") fail("explicit --target-json is required");
  const identity = await controlledIdentity(bridge, options);
  const topology = await bridge.request("zcode/session/subagents", { sessionId: identity.adapterSessionId });
  if ((topology.running ?? []).length) fail("cannot fork while background children are running");
  const result = await bridge.request("session/fork", { sessionId: identity.adapterSessionId, target: options.target });
  if (!result.forkedSessionId) fail("ZCode fork returned no provider Session ID");
  return receipt(options, { harness: "zcode-acp", parent_provider_session_id: identity.providerSessionId, parent_adapter_session_id: identity.adapterSessionId, provider_session_id: result.forkedSessionId, adapter_session_id: result.forkedSessionId, target: options.target });
}

export async function promptFromFile(file) { return await readFile(absolute(file, "--prompt-file"), "utf8"); }
