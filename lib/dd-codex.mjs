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
  constructor(options = {}) { this.options = options; this.nextId = 1; this.pending = new Map(); this.turns = new Map(); this.journal = new Journal(options.journal); this.stderr = ""; }

  async start() {
    const bin = this.options.bin ?? process.env.DD_CODEX_BIN ?? "codex";
    this.child = spawn(bin, ["app-server"], { cwd: this.options.cwd ? absolute(this.options.cwd, "--cwd") : process.cwd(), env: { ...process.env, ...(this.options.env ?? {}) }, stdio: ["pipe", "pipe", "pipe"] });
    this.child.stderr.setEncoding("utf8").on("data", (chunk) => { this.stderr += String(chunk); this.journal.write("stderr", { text: String(chunk) }); });
    this.child.on("error", (error) => this.rejectAll(error));
    this.child.on("exit", (code) => this.rejectAll(Object.assign(new Error(`Codex app-server exited ${code}${this.stderr.trim() ? `: ${this.stderr.trim()}` : ""}`), { code: "bridge_exited" })));
    readline.createInterface({ input: this.child.stdout }).on("line", (line) => this.receive(line));
    await this.request("initialize", { clientInfo: { name: "dd-codex", version: "0.1.0" }, capabilities: { optOutNotificationMethods: [] } });
  }

  receive(line) {
    let message; try { message = JSON.parse(line); } catch { this.journal.write("malformed", { line }); return; }
    this.journal.write("inbound", message);
    if (message.id !== undefined && message.method) { void this.answerRequest(message); return; }
    if (message.id !== undefined) {
      const pending = this.pending.get(message.id); if (!pending) return;
      clearTimeout(pending.timer); this.pending.delete(message.id);
      message.error ? pending.reject(Object.assign(new Error(message.error.message ?? JSON.stringify(message.error)), { code: "rpc_error", details: message.error })) : pending.resolve(message.result ?? {});
      return;
    }
    if (message.method === "turn/completed") this.turns.set(message.params?.turn?.id ?? message.params?.threadId, { status: "completed", value: message.params });
    if (message.method === "turn/started") this.turns.set(message.params?.turn?.id ?? message.params?.threadId, { status: "running", value: message.params });
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
      this.pending.set(id, { resolve, reject, timer }); this.send({ jsonrpc: "2.0", id, method, params });
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
  const result = await bridge.request("thread/start", { cwd, model: options.model ?? null, approvalPolicy: "never", sandbox: "danger-full-access", ephemeral: false });
  return { harness: "codex-desktop", provider_session_id: threadId(result), adapter_session_id: threadId(result), observed_profile: { ...profile(options), model: result.model ?? options.model ?? null, reasoning: result.reasoningEffort ?? options.reasoning ?? null }, cwd: result.cwd ?? cwd };
}

export async function promptSession(options) {
  return await withBridge(options, async (bridge) => await promptSessionWithBridge(bridge, options));
}

export async function promptSessionWithBridge(bridge, options) {
  const sessionId = required(options.sessionId, "--session-id"); const cwd = absolute(options.cwd, "--cwd"); const prompt = required(options.prompt, "--prompt");
  const started = await bridge.request("turn/start", { threadId: sessionId, input: [{ type: "text", text: prompt }], cwd, model: options.model ?? null, effort: options.reasoning ?? null, approvalPolicy: "never", sandboxPolicy: { type: "dangerFullAccess" } }, options.timeoutMs ?? 1_800_000);
  const turn = started?.turn ?? started; const turnId = turn?.id ?? null;
  const completed = await waitForTurn(bridge, sessionId, turnId, options.timeoutMs ?? 1_800_000);
  return { harness: "codex-desktop", provider_session_id: sessionId, adapter_session_id: sessionId, turn_id: turnId, status: "completed", turn: completed, observed_profile: profile(options) };
}

async function waitForTurn(bridge, sessionId, turnId, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const known = bridge.turns.get(turnId) ?? bridge.turns.get(sessionId); if (known?.status === "completed") return known.value;
    // `thread/read` races a newly-created rollout in current Codex app-server
    // builds. The terminal notification is authoritative and avoids that
    // read-side failure entirely.
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  fail("Codex turn timed out", "turn_timeout");
}

export async function inspectSession(options) {
  return await withBridge(options, async (bridge) => await inspectSessionWithBridge(bridge, options));
}

export async function inspectSessionWithBridge(bridge, options) {
  const sessionId = required(options.sessionId, "--session-id"); const value = await bridge.request("thread/read", { threadId: sessionId }); const thread = value?.thread ?? value;
  return { harness: "codex-desktop", provider_session_id: sessionId, adapter_session_id: sessionId, status: thread.status ?? null, thread, observed_profile: { ...profile(options), model: thread.model ?? options.model ?? null, reasoning: thread.reasoningEffort ?? options.reasoning ?? null } };
}

export async function cancelSession(options) {
  return await withBridge(options, async (bridge) => await cancelSessionWithBridge(bridge, options));
}

export async function cancelSessionWithBridge(bridge, options) { const sessionId = required(options.sessionId, "--session-id"); await bridge.request("turn/interrupt", { threadId: sessionId }); return { harness: "codex-desktop", provider_session_id: sessionId, adapter_session_id: sessionId, cancelled: true }; }

export async function promptFromFile(file) { return await readFile(absolute(file, "--prompt-file"), "utf8"); }
