import { spawn } from "node:child_process";
import { appendFile, mkdir, readFile } from "node:fs/promises";
import path from "node:path";
import readline from "node:readline";

// Minimal JSON-RPC wrapper around the public Codex app-server protocol.  It is
// intentionally one-shot: the provider owns durable Threads, while the caller
// owns the runner journal and can safely resume after a process restart.
function fail(message, code) { const error = new Error(message); if (code) error.code = code; throw error; }
function required(value, label) { if (typeof value !== "string" || !value.trim()) fail(`${label} is required`); return value.trim(); }
function absolute(value, label) { const resolved = path.resolve(required(value, label)); if (!path.isAbsolute(resolved)) fail(`${label} must be absolute`); return resolved; }
function now() { return new Date().toISOString(); }

class Journal {
  constructor(file) { this.file = file ? absolute(file, "--journal") : null; this.pending = this.file ? mkdir(path.dirname(this.file), { recursive: true }) : Promise.resolve(); this.order = 0; }
  write(kind, payload) { if (!this.file) return; this.pending = this.pending.then(() => appendFile(this.file, `${JSON.stringify({ order: ++this.order, observed_at: now(), kind, payload })}\n`)); }
  flush() { return this.pending; }
}

export class CodexBridge {
  constructor(options = {}) { this.options = options; this.nextId = 1; this.pending = new Map(); this.turns = new Map(); this.finalMessages = new Map(); this.journal = new Journal(options.journal); this.stderr = ""; }

  async start() {
    const bin = this.options.bin ?? process.env.DD_CODEX_BIN ?? "codex";
    this.child = spawn(bin, ["app-server"], { cwd: this.options.cwd ? absolute(this.options.cwd, "--cwd") : process.cwd(), env: { ...process.env, ...(this.options.env ?? {}) }, stdio: ["pipe", "pipe", "pipe"] });
    this.child.stderr.setEncoding("utf8").on("data", (chunk) => { this.stderr += String(chunk); this.journal.write("stderr", { text: String(chunk) }); });
    this.child.on("error", (error) => this.rejectAll(error));
    this.child.on("exit", (code) => this.rejectAll(Object.assign(new Error(`Codex app-server exited ${code}${this.stderr.trim() ? `: ${this.stderr.trim()}` : ""}`), { code: "bridge_exited" })));
    readline.createInterface({ input: this.child.stdout }).on("line", (line) => this.receive(line));
    await this.request("initialize", { clientInfo: { name: "dd-codex", version: "0.1.0" }, capabilities: { optOutNotificationMethods: [], experimentalApi: true } });
  }

  receive(line) {
    let message; try { message = JSON.parse(line); } catch { this.journal.write("malformed", { line }); return; }
    // app-server currently returns complete turns even for `includeTurns:
    // false`.  The individual item notifications are already journalled, so
    // retain a compact read receipt instead of writing the same transcript on
    // every status poll.
    const request = message.id !== undefined ? this.pending.get(message.id) : null;
    if (request?.method === "thread/read") {
      const thread = message.result?.thread ?? message.result ?? {};
      this.journal.write("inbound", { jsonrpc: message.jsonrpc, id: message.id, result: { thread: {
        id: thread.id ?? null, status: thread.status ?? null, updatedAt: thread.updatedAt ?? null,
        turns: Array.isArray(thread.turns) ? thread.turns.map((turn) => ({ id: turn?.id ?? null, status: turn?.status ?? null, startedAt: turn?.startedAt ?? null, completedAt: turn?.completedAt ?? null })) : []
      } } });
    } else this.journal.write("inbound", message);
    if (message.id !== undefined && message.method) { void this.answerRequest(message); return; }
    if (message.id !== undefined) {
      const pending = this.pending.get(message.id); if (!pending) return;
      clearTimeout(pending.timer); this.pending.delete(message.id);
      message.error ? pending.reject(Object.assign(new Error(message.error.message ?? JSON.stringify(message.error)), { code: "rpc_error", details: message.error })) : pending.resolve(message.result ?? {});
      return;
    }
    if (message.method === "turn/completed") this.turns.set(message.params?.turn?.id ?? message.params?.threadId, { status: "completed", value: message.params });
    if (message.method === "turn/started") this.turns.set(message.params?.turn?.id ?? message.params?.threadId, { status: "running", value: message.params });
    const threadId = message.params?.threadId;
    if (threadId && message.method === "item/started") this.finalMessages.delete(threadId);
    if (threadId && message.method === "item/completed" && message.params?.item?.type === "agentMessage") this.finalMessages.set(threadId, { item: message.params.item, completedAt: Date.now() });
  }

  async answerRequest(message) {
    // Eval runs are non-interactive. A request is evidence for the runner, not
    // permission to continue. Do not silently approve a tool or elicitation.
    // A JSON-RPC error is deliberately used instead of inventing a generic
    // `{ decision: "deny" }` payload: app-server request methods have distinct
    // result schemas, while every one must fail closed in a non-interactive
    // eval.  The runner can classify this journalled request as infrastructure
    // or unexpected interaction without corrupting the provider protocol.
    const error = { code: -32001, message: `dd-codex refuses interactive request: ${message.method}` };
    this.journal.write("request_refused", { method: message.method, params: message.params, error });
    this.send({ jsonrpc: "2.0", id: message.id, error });
  }

  request(method, params = {}, timeoutMs = this.options.timeoutMs ?? 120_000) {
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { this.pending.delete(id); reject(Object.assign(new Error(`${method} timed out`), { code: "rpc_timeout" })); }, timeoutMs);
      this.pending.set(id, { resolve, reject, timer, method }); this.send({ jsonrpc: "2.0", id, method, params });
    });
  }
  send(value) { this.journal.write("outbound", value); this.child.stdin.write(`${JSON.stringify(value)}\n`); }
  rejectAll(error) { for (const pending of this.pending.values()) { clearTimeout(pending.timer); pending.reject(error); } this.pending.clear(); }
  async close() { if (!this.child) return; this.child.stdin.end(); await Promise.race([new Promise((resolve) => this.child.once("exit", resolve)), new Promise((resolve) => setTimeout(resolve, 2_000))]); if (this.child.exitCode === null) this.child.kill("SIGTERM"); await this.journal.flush(); }
}

async function withBridge(options, action) { const bridge = new CodexBridge(options); try { await bridge.start(); return await action(bridge); } finally { await bridge.close(); } }
function profile(options) { return { harness: "codex-desktop", model: options.model ?? null, reasoning: options.reasoning ?? null }; }
function threadId(result) { const id = result?.thread?.id ?? result?.threadId; return required(id, "Codex thread id"); }

export async function doctor(options = {}) {
  return await withBridge(options, async (bridge) => ({ harness: "codex-desktop", app_server: "available", requested_profile: profile(options), observed_at: now() }));
}

export async function createSession(options) {
  return await withBridge(options, async (bridge) => await createSessionWithBridge(bridge, options));
}

export async function createSessionWithBridge(bridge, options) {
  const cwd = absolute(options.cwd, "--cwd");
  // dd-codex is the eval-only adapter. Its CODEX_HOME is generated by
  // dd-flow, so trust only that managed PreToolUse hook for this thread and
  // do not load user plugin hooks into the isolated evaluator.
  const result = await bridge.request("thread/start", {
    cwd,
    model: options.model ?? null,
    approvalPolicy: "never",
    sandbox: "danger-full-access",
    ephemeral: false,
    config: { bypass_hook_trust: true, "features.plugins": false }
  });
  // ThreadStartParams has no reasoning-effort field.  The first turn applies
  // it, so reporting the Desktop default here would be a false profile drift.
  return { harness: "codex-desktop", provider_session_id: threadId(result), adapter_session_id: threadId(result), observed_profile: { model: result.model ?? options.model ?? null }, cwd: result.cwd ?? cwd };
}

export async function promptSession(options) {
  return await withBridge(options, async (bridge) => await promptSessionWithBridge(bridge, options));
}

export async function startSession(options) {
  return await withBridge(options, async (bridge) => await startSessionWithBridge(bridge, options));
}

export async function startSessionWithBridge(bridge, options) {
  const sessionId = required(options.sessionId, "--session-id"); const cwd = absolute(options.cwd, "--cwd"); const prompt = required(options.prompt, "--prompt");
  await ensureThreadLoaded(bridge, sessionId, options, cwd);
  bridge.finalMessages?.delete(sessionId);
  const started = await bridge.request("turn/start", { threadId: sessionId, input: [{ type: "text", text: prompt }], cwd, model: options.model ?? null, effort: options.reasoning ?? null, approvalPolicy: "never", sandboxPolicy: { type: "dangerFullAccess" } }, options.timeoutMs ?? 30_000);
  const turn = started?.turn ?? started; const turnId = turn?.id ?? null;
  if (typeof turnId !== "string" || !turnId) throw new Error("Codex did not return a Turn id");
  return { harness: "codex-desktop", provider_session_id: sessionId, adapter_session_id: sessionId, turn_id: turnId, status: "started", observed_profile: { model: options.model ?? null, reasoning: options.reasoning ?? null } };
}

export async function promptSessionWithBridge(bridge, options) {
  const sessionId = required(options.sessionId, "--session-id"); const cwd = absolute(options.cwd, "--cwd"); const prompt = required(options.prompt, "--prompt");
  await ensureThreadLoaded(bridge, sessionId, options, cwd);
  // A final-message fallback belongs only to the Turn that produced it.  A
  // new Turn may start before app-server emits its first item notification;
  // clearing here prevents the previous receipt from completing the new Turn.
  bridge.finalMessages?.delete(sessionId);
  const started = await bridge.request("turn/start", { threadId: sessionId, input: [{ type: "text", text: prompt }], cwd, model: options.model ?? null, effort: options.reasoning ?? null, approvalPolicy: "never", sandboxPolicy: { type: "dangerFullAccess" } }, options.timeoutMs ?? 1_800_000);
  const turn = started?.turn ?? started; const turnId = turn?.id ?? null;
  const completed = await waitForTurn(bridge, sessionId, turnId, options.timeoutMs ?? 1_800_000, options, cwd);
  const thread = await readCompletedThread(bridge, sessionId);
  const assistantText = latestAssistantText(thread) ?? latestAssistantText(completed);
  return { harness: "codex-desktop", provider_session_id: sessionId, adapter_session_id: sessionId, turn_id: turnId, status: "completed", turn: completed, ...(thread ? { thread } : {}), ...(assistantText ? { assistant_text: assistantText } : {}), observed_profile: { model: thread?.model ?? options.model ?? null, reasoning: thread?.reasoningEffort ?? null } };
}

async function ensureThreadLoaded(bridge, sessionId, options, cwd) {
  const value = await bridge.request("thread/read", { threadId: sessionId, includeTurns: false }, 10_000);
  const thread = value?.thread ?? value;
  if (thread?.status?.type !== "notLoaded") return;
  await bridge.request("thread/resume", {
    threadId: sessionId,
    cwd,
    model: options.model ?? null,
    approvalPolicy: "never",
    sandbox: "danger-full-access",
    config: { bypass_hook_trust: true, "features.plugins": false }
  }, 30_000);
}

async function waitForTurn(bridge, sessionId, turnId, timeoutMs, options, cwd) {
  const deadline = Date.now() + timeoutMs;
  // app-server can briefly expose the new Turn as `interrupted` between the
  // turn/start response and its turn/started notification. Give that snapshot
  // one event-loop grace window before treating failure as authoritative.
  const failureNotBefore = Date.now() + 1_000;
  let nextStoredReadAt = Date.now();
  while (Date.now() < deadline) {
    const known = bridge.turns.get(turnId) ?? bridge.turns.get(sessionId); if (known?.status === "completed") return terminalTurn(known.value, turnId);
    if (Date.now() >= nextStoredReadAt) {
      const stored = await readTurn(bridge, sessionId, turnId, false);
      if (stored?.turn && isAuthoritativeTerminal(bridge, turnId, stored.turn.status, stored.threadStatus, failureNotBefore)) return terminalTurn({ turn: stored.turn }, turnId);
      // A loaded app-server can retain a stale `active` Thread state after a
      // provider-side interruption. The persisted turn page is independent of
      // that live subscription and is the compact authority for its terminal
      // status; unlike `includeTurns`, it never hydrates the whole history.
      const persisted = await readPersistedTurn(bridge, sessionId, turnId);
      if (persisted && isAuthoritativeTerminal(bridge, turnId, persisted.status, stored?.threadStatus, failureNotBefore)) return terminalTurn({ turn: persisted }, turnId);
      // Desktop may unload an idle Thread immediately after an interrupted
      // Turn. Reload it once before polling again: otherwise the compact
      // status remains `notLoaded` forever and hides the terminal Turn.
      if (stored?.threadStatus === "notLoaded") {
        await ensureThreadLoaded(bridge, sessionId, options, cwd);
        const hydrated = await readTurn(bridge, sessionId, turnId, true);
        if (hydrated?.turn && isAuthoritativeTerminal(bridge, turnId, hydrated.turn.status, hydrated.threadStatus, failureNotBefore)) return terminalTurn({ turn: hydrated.turn }, turnId);
      }
      // Some app-server versions correctly omit turns for a compact read.
      // Once the thread is idle, hydrate exactly once to recover the terminal
      // turn instead of waiting for the global timeout.
      if (stored?.threadStatus === "idle") {
        const hydrated = await readTurn(bridge, sessionId, turnId, true);
        // "idle" only describes the Thread.  Some app-server builds retain
        // an inProgress Turn after emitting the final agent message; treating
        // that stale Turn as terminal incorrectly aborts an otherwise usable
        // worker session.
        if (hydrated?.turn && isAuthoritativeTerminal(bridge, turnId, hydrated.turn.status, hydrated.threadStatus, failureNotBefore)) return terminalTurn({ turn: hydrated.turn }, turnId);
      }
      // Some app-server builds emit a final agent message but omit both the
      // terminal event and the compact turn record. Wait briefly, hydrate once,
      // then preserve that message as the terminal receipt if still omitted.
      const final = bridge.finalMessages?.get(sessionId);
      // Agent messages are streamed as completed items while a Turn is still
      // reasoning and calling tools.  They are terminal evidence only after
      // app-server reports the Thread idle.
      if (final && stored?.threadStatus === "idle" && Date.now() - final.completedAt >= 1_000) {
        const hydrated = await readTurn(bridge, sessionId, turnId, true);
        if (hydrated?.turn && isAuthoritativeTerminal(bridge, turnId, hydrated.turn.status, hydrated.threadStatus, failureNotBefore)) return terminalTurn({ turn: hydrated.turn }, turnId);
        return terminalTurn({ turn: { id: turnId, status: "completed", synthetic: true, final_message: final.item } }, turnId);
      }
      nextStoredReadAt = Date.now() < failureNotBefore ? failureNotBefore : Date.now() + 15_000;
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  fail("Codex turn timed out", "turn_timeout");
}

function terminalTurn(value, turnId) {
  const turn = value?.turn ?? value;
  if (turn?.status && turn.status !== "completed") fail(`Codex turn ${turnId ?? "unknown"} ended as ${turn.status}`, "turn_interrupted");
  return value;
}

function isTerminalTurnStatus(status) { return ["completed", "failed", "interrupted", "cancelled"].includes(status); }
function isAuthoritativeTerminal(bridge, turnId, status, threadStatus, failureNotBefore) {
  if (!isTerminalTurnStatus(status)) return false;
  if (status === "completed") return true;
  if (Date.now() < failureNotBefore) return false;
  return !(bridge.turns.get(turnId)?.status === "running" && threadStatus === "active");
}

async function readTurn(bridge, sessionId, turnId, includeTurns) {
  if (!turnId) return null;
  try {
    const result = await bridge.request("thread/read", { threadId: sessionId, includeTurns }, 10_000);
    const thread = result?.thread ?? result;
    return { turn: Array.isArray(thread?.turns) ? thread.turns.find((turn) => turn?.id === turnId) ?? null : null, threadStatus: thread?.status?.type ?? null };
  } catch { return null; }
}

async function readPersistedTurn(bridge, sessionId, turnId) {
  try {
    const result = await bridge.request("thread/turns/list", { threadId: sessionId, limit: 20, sortDirection: "desc", itemsView: "summary" }, 10_000);
    return Array.isArray(result?.data) ? result.data.find((turn) => turn?.id === turnId) ?? null : null;
  } catch { return null; }
}

async function readCompletedThread(bridge, sessionId) {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    try { const result = await bridge.request("thread/read", { threadId: sessionId, includeTurns: true }, 10_000); return result?.thread ?? result; }
    catch (error) { bridge.journal.write("thread_read_retry", { session_id: sessionId, attempt, error: error.message }); await new Promise((resolve) => setTimeout(resolve, 150)); }
  }
  return null;
}

function latestAssistantText(value) {
  const messages = value?.messages ?? value?.items ?? value?.turn?.items ?? [];
  if (!Array.isArray(messages)) return null;
  for (const message of [...messages].reverse()) {
    if (message?.role !== "assistant" && message?.type !== "agentMessage") continue;
    const parts = message.content ?? message.parts ?? [];
    if (typeof message.text === "string") return message.text;
    if (Array.isArray(parts)) {
      const text = parts.map((part) => typeof part?.text === "string" ? part.text : typeof part?.content === "string" ? part.content : "").filter(Boolean).join("\n");
      if (text) return text;
    }
  }
  return null;
}

export async function inspectSession(options) {
  return await withBridge(options, async (bridge) => await inspectSessionWithBridge(bridge, options));
}

export async function inspectSessionWithBridge(bridge, options) {
  const sessionId = required(options.sessionId, "--session-id"); const value = await bridge.request("thread/read", { threadId: sessionId, includeTurns: false }); const thread = value?.thread ?? value;
  return { harness: "codex-desktop", provider_session_id: sessionId, adapter_session_id: sessionId, status: thread.status ?? null, thread, observed_profile: { ...profile(options), model: thread.model ?? options.model ?? null, reasoning: thread.reasoningEffort ?? options.reasoning ?? null } };
}

export async function cancelSession(options) {
  return await withBridge(options, async (bridge) => await cancelSessionWithBridge(bridge, options));
}

export async function cancelSessionWithBridge(bridge, options) {
  const sessionId = required(options.sessionId, "--session-id");
  let turnId = options.turnId ?? null;
  if (!turnId) {
    const result = await bridge.request("thread/read", { threadId: sessionId, includeTurns: true }, 10_000);
    const thread = result?.thread ?? result;
    turnId = [...(thread?.turns ?? [])].reverse().find((turn) => turn?.status === "inProgress")?.id ?? null;
  }
  if (!turnId) fail("Codex Session has no active Turn to interrupt", "turn_not_active");
  await bridge.request("turn/interrupt", { threadId: sessionId, turnId });
  return { harness: "codex-desktop", provider_session_id: sessionId, adapter_session_id: sessionId, turn_id: turnId, cancelled: true };
}

export async function promptFromFile(file) { return await readFile(absolute(file, "--prompt-file"), "utf8"); }
