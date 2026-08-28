import { spawn } from "node:child_process";
import { appendFile, mkdir, readFile } from "node:fs/promises";
import path from "node:path";
import readline from "node:readline";

export const ZCODE_BASELINE = Object.freeze({ zcode: "0.16.5", zcode_acp: "0.13.0" });

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
    this.notifications = Promise.resolve();
    this.notificationError = null;
    this.journal = new Journal(options.journal);
  }

  configure(options) { this.options = { ...this.options, ...options }; }

  async start() {
    const target = executable(this.options.bin, ["server"]);
    const cwd = this.options.cwd ? absolute(this.options.cwd, "--cwd") : process.cwd();
    this.child = spawn(target.command, target.args, { cwd, stdio: ["pipe", "pipe", "pipe"], env: process.env });
    this.child.stderr.setEncoding("utf8").on("data", (chunk) => this.journal.write("bridge_stderr", { text: String(chunk) }));
    this.child.on("error", (error) => { error.code ??= "bridge_exited"; this.rejectAll(error); });
    this.child.on("exit", (code) => { const error = new Error(`zcode-acp exited ${code}`); error.code = "bridge_exited"; this.rejectAll(error); });
    readline.createInterface({ input: this.child.stdout }).on("line", (line) => this.receive(line));
    return await this.request("initialize", {
      protocolVersion: 1,
      clientCapabilities: { fs: { readTextFile: false, writeTextFile: false }, elicitation: { form: {} } },
      clientInfo: { name: "dd-zcode", version: "0.1.0" },
    });
  }

  receive(line) {
    let message;
    try { message = JSON.parse(line); } catch { this.journal.write("malformed", { line }); return; }
    this.journal.write("inbound", message);
    if (message.id !== undefined && message.method) { void this.answer(message).catch((error) => this.rejectAll(error)); return; }
    if (message.id !== undefined) {
      const pending = this.pending.get(message.id);
      if (!pending) return;
      clearTimeout(pending.timer); this.pending.delete(message.id);
      if (message.error) pending.reject(new Error(message.error.message ?? JSON.stringify(message.error)));
      else pending.resolve(message.result ?? {});
      return;
    }
    if (message.method) this.notifications = this.notifications
      .then(async () => await this.options.onNotification?.(message))
      .catch((error) => { this.notificationError ??= error; });
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

  request(method, params = {}, timeoutMs = 30_000) {
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { this.pending.delete(id); reject(new Error(`${method} timed out`)); }, timeoutMs);
      this.pending.set(id, { resolve, reject, timer });
      this.send({ jsonrpc: "2.0", id, method, params });
    });
  }

  notify(method, params = {}) { this.send({ jsonrpc: "2.0", method, params }); }
  send(message) { this.journal.write("outbound", message); this.child.stdin.write(`${JSON.stringify(message)}\n`); }
  rejectAll(error) { for (const pending of this.pending.values()) { clearTimeout(pending.timer); pending.reject(error); } this.pending.clear(); }
  async flush() { await this.notifications; await this.journal.flush(); if (this.notificationError) throw this.notificationError; }
  async close() {
    await this.flush();
    if (!this.child || this.child.exitCode !== null) return;
    this.child.stdin.end();
    await Promise.race([new Promise((resolve) => this.child.once("exit", resolve)), new Promise((resolve) => setTimeout(resolve, 2000))]);
    if (this.child.exitCode === null) this.child.kill("SIGTERM");
    await this.journal.flush();
  }
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

async function cancelTree(bridge, sessionId, before) {
  const cancellations = [];
  for (const child of before.running ?? []) {
    const taskId = child.taskId ?? child.agentId;
    if (taskId) cancellations.push(await bridge.request("session/cancelBackgroundTask", { sessionId, taskId }));
  }
  bridge.notify("session/cancel", { sessionId });
  let after = before; let root_status = null;
  for (let attempt = 0; attempt < 50; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 100));
    const [topology, read] = await Promise.all([
      bridge.request("zcode/session/subagents", { sessionId }),
      bridge.request("zcode/session/read", { sessionId }),
    ]);
    after = topology; root_status = read?.projection?.status ?? read?.session?.status ?? null;
    if (!(after.running ?? []).length && root_status !== "running") {
      if (cancellations.some((item) => item?.cancelled === false)) fail(`ZCode reported incomplete cancellation: ${JSON.stringify(cancellations)}`, "partial_cancellation");
      return { cancellations, before, after, root_status };
    }
    if (root_status === "running") bridge.notify("session/cancel", { sessionId });
  }
  fail(`ZCode session tree did not settle after cancellation: ${JSON.stringify({ cancellations, root_status })}`, "partial_cancellation");
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
    if (typeof command !== "string" || !/\bdd-flow\s+(?:session\s+register|stage\s+(?:start|resume)|work\s+start)\b/.test(command)) return;
    const payload = { ...notification, _meta: { ddZcode: { rootProviderSessionId, ...(options.daemonId ? { daemonId: options.daemonId } : {}) } } };
    const stdout = await runWithStdin(options.ddFlowBin, ["zcode", "event", "handle", "--project-root", projectRoot, "--json"], `${JSON.stringify(payload)}\n`, options.ddFlowHome ? { DD_FLOW_HOME: absolute(options.ddFlowHome, "--dd-flow-home") } : {});
    const receipt = stdout ? JSON.parse(stdout) : {};
    if (receipt.ok === false) fail(`dd-flow rejected ZCode event: ${JSON.stringify(receipt.error ?? receipt)}`);
  };
}

export async function doctor(options = {}) {
  const zcodeAcp = await commandOutput(options.bin, ["--version"]);
  const zcodePath = options.zcodePath ?? process.env.ZCODE_PATH ?? "/Applications/ZCode.app/Contents/Resources/glm/zcode.cjs";
  const zcode = await commandOutput(zcodePath, ["--version"]);
  const compatible = zcode === ZCODE_BASELINE.zcode && zcodeAcp === ZCODE_BASELINE.zcode_acp;
  if (!compatible) fail(`unsupported ZCode harness versions: zcode=${zcode}, zcode-acp=${zcodeAcp}`);
  return { compatible, versions: { zcode, zcode_acp: zcodeAcp }, baseline: ZCODE_BASELINE };
}

export async function createSession(options) {
  requireJournal(options);
  return await withBridge(options, async (bridge, initialized) => await createSessionWithBridge(bridge, options, initialized));
}

export async function createSessionWithBridge(bridge, options, initialized) {
  requireJournal(options);
  const cwd = absolute(options.cwd, "--cwd"); const requested = requiredProfile(options); const prompt = text(options.prompt, "prompt");
  let forward;
  bridge.configure({ ...options, onNotification: async (event) => { await forward?.(event); await options.onNotification?.(event); } });
  const created = await bridge.request("session/new", { cwd, mcpServers: [] });
  const resolved = await bridge.request("zcode/session/resolve", { sessionId: created.sessionId });
  const providerSessionId = resolved.providerSessionId;
  const profile_receipt = await applyProfile(bridge, created.sessionId, requested);
  forward = flowForwarder(options, providerSessionId);
  const turn = await bridge.request("session/prompt", { sessionId: created.sessionId, prompt: [{ type: "text", text: prompt }] }, options.timeoutMs ?? 1_800_000);
  await bridge.flush();
  const evidence = await inspect(bridge, created.sessionId);
  return receipt(options, { harness: "zcode-acp", runtime_family: "zcode", adapter_session_id: created.sessionId, provider_session_id: providerSessionId, cwd, initialized, turn, profile: profile_receipt, evidence });
}

export async function promptSession(options) {
  requireJournal(options);
  return await withBridge(options, async (bridge) => await promptSessionWithBridge(bridge, options));
}

export async function promptSessionWithBridge(bridge, options) {
  requireJournal(options);
  const cwd = absolute(options.cwd, "--cwd"); const prompt = text(options.prompt, "prompt"); const requested = requiredProfile(options);
  let forward;
  bridge.configure({ ...options, onNotification: async (event) => { await forward?.(event); await options.onNotification?.(event); } });
  const identity = await controlledIdentity(bridge, { ...options, cwd }); forward = flowForwarder(options, identity.providerSessionId);
  const profile_receipt = await applyProfile(bridge, identity.adapterSessionId, requested);
  const turn = await bridge.request("session/prompt", { sessionId: identity.adapterSessionId, prompt: [{ type: "text", text: prompt }] }, options.timeoutMs ?? 1_800_000);
  await bridge.flush();
  const evidence = await inspect(bridge, identity.adapterSessionId);
  if (!options.allowBackground && (evidence.subagents.running ?? []).length) {
    await cancelTree(bridge, identity.adapterSessionId, evidence.subagents);
    fail("background ZCode subagents cannot outlive the one-shot dd-zcode connection; the live child tree was cancelled");
  }
  return receipt(options, { harness: "zcode-acp", provider_session_id: identity.providerSessionId, adapter_session_id: identity.adapterSessionId, turn, profile: profile_receipt, evidence });
}

export async function inspectSession(options) {
  requireJournal(options);
  return await withBridge(options, async (bridge) => await inspectSessionWithBridge(bridge, options));
}

export async function inspectSessionWithBridge(bridge, options) {
  requireJournal(options);
  const identity = await controlledIdentity(bridge, options);
  return receipt(options, { harness: "zcode-acp", provider_session_id: identity.providerSessionId, adapter_session_id: identity.adapterSessionId, ...await inspect(bridge, identity.adapterSessionId) });
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
