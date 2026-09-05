import { createHash } from "node:crypto";
import { observedTimeout } from "./observation-clock.mjs";

export class OpenCodeError extends Error {
  constructor(code, message, retryable = false, details) { super(message); this.code = code; this.retryable = retryable; this.details = details; }
}

export class OpenCodeClient {
  constructor({ baseUrl, password, directory, timeoutMs = 1_800_000 }) {
    this.baseUrl = new URL(baseUrl); this.password = password; this.directory = directory; this.timeoutMs = timeoutMs;
  }
  async request(method, pathname, body, { directory = this.directory, timeoutMs = this.timeoutMs, progress } = {}) {
    const url = new URL(pathname, this.baseUrl); if (directory) url.searchParams.set("directory", directory);
    const controller = new AbortController(); const timer = observedTimeout(() => controller.abort(), timeoutMs, { progress });
    try {
      const response = await fetch(url, { method, headers: { authorization: `Basic ${Buffer.from(`opencode:${this.password}`).toString("base64")}`, ...(body === undefined ? {} : { "content-type": "application/json" }) }, body: body === undefined ? undefined : JSON.stringify(body), signal: controller.signal });
      const text = await response.text(); let value = null; try { value = text ? JSON.parse(text) : null; } catch { value = text; }
      if (!response.ok) throw new OpenCodeError(response.status === 404 ? "session_not_found" : "opencode_http_error", `OpenCode ${method} ${pathname} returned ${response.status}`, response.status >= 500, value);
      return value;
    } catch (error) {
      if (error instanceof OpenCodeError) throw error;
      // Aborting HTTP only loses the observer; it does not cancel the provider.
      throw new OpenCodeError(error.name === "AbortError" ? "operation_observation_lost" : "opencode_unavailable", error.message, true, { method, pathname });
    } finally { clearTimeout(timer); }
  }
  health() { return this.request("GET", "/global/health", undefined, { directory: null, timeoutMs: 5_000 }); }
  create(title) { return this.request("POST", "/session", title ? { title } : {}); }
  inspect(id) { return this.request("GET", `/session/${encodeURIComponent(id)}`); }
  list() { return this.request("GET", "/session"); }
  statuses() { return this.request("GET", "/session/status"); }
  children(id) { return this.request("GET", `/session/${encodeURIComponent(id)}/children`); }
  messages(id) { return this.request("GET", `/session/${encodeURIComponent(id)}/message`); }
  async prompt(id, { prompt, provider, model, variant, agent }) {
    let marker, observing = false;
    // Native message content is progress; an HTTP poll or busy status is not.
    // Include descendants so a coordinating parent may legitimately be silent.
    const observe = async (session, seen = new Set()) => {
      if (seen.has(session)) return [];
      seen.add(session);
      const options = { timeoutMs: Math.min(5_000, this.timeoutMs) };
      const [messages, children] = await Promise.all([
        this.request("GET", `/session/${encodeURIComponent(session)}/message`, undefined, options),
        this.request("GET", `/session/${encodeURIComponent(session)}/children`, undefined, options)
      ]);
      return [session, messages, ...await Promise.all((children ?? []).map(child => observe(child.id, seen)))];
    };
    const timer = setInterval(async () => {
      if (observing) return;
      observing = true;
      try { marker = createHash("sha256").update(JSON.stringify(await observe(id))).digest("hex"); }
      catch { /* Unavailable observation does not manufacture progress. */ }
      finally { observing = false; }
    }, Math.max(10, Math.min(5_000, this.timeoutMs / 4)));
    try { return await this.request("POST", `/session/${encodeURIComponent(id)}/message`, { model: { providerID: provider, modelID: model }, variant, agent, parts: [{ type: "text", text: prompt }] }, { progress: () => marker }); }
    finally { clearInterval(timer); }
  }
  fork(id, messageID) { return this.request("POST", `/session/${encodeURIComponent(id)}/fork`, messageID ? { messageID } : {}); }
  abort(id) { return this.request("POST", `/session/${encodeURIComponent(id)}/abort`); }
  delete(id) { return this.request("DELETE", `/session/${encodeURIComponent(id)}`); }
}

function stablePart(part) {
  if (part.type === "text") return { type: "text", text: part.text, synthetic: part.synthetic === true };
  if (part.type === "tool") return { type: "tool", tool: part.tool, state: { status: part.state?.status, input: part.state?.input, output: part.state?.output, error: part.state?.error } };
  if (part.type === "subtask") return { type: "subtask", prompt: part.prompt, description: part.description, agent: part.agent };
  return { type: part.type };
}
export function canonicalHistory(messages) {
  return messages.map(({ info, parts }) => ({ role: info.role, ...(info.role === "assistant" ? { provider: info.providerID, model: info.modelID, mode: info.mode, finish: info.finish ?? null, error: info.error?.name ?? null } : {}), parts: parts.map(stablePart) }));
}
export function historyDigest(messages) { return createHash("sha256").update(JSON.stringify(canonicalHistory(messages))).digest("hex"); }
export function usageSnapshot(messages) {
  const assistants = messages.filter((item) => item.info?.role === "assistant"); const tokens = assistants.reduce((sum, item) => { const value = item.info.tokens ?? {}; const cache = value.cache ?? {}; sum.input += value.input ?? 0; sum.output += value.output ?? 0; sum.reasoning += value.reasoning ?? 0; sum.cache_read += cache.read ?? 0; sum.cache_write += cache.write ?? 0; return sum; }, { input: 0, output: 0, reasoning: 0, cache_read: 0, cache_write: 0 });
  const calls = new Map(); let failures = 0; for (const item of messages) for (const part of item.parts ?? []) if (part.type === "tool") { calls.set(part.id ?? `${item.info.id}:${calls.size}`, part.tool ?? "unknown"); if (["error", "failed"].includes(part.state?.status)) failures += 1; }
  const by_tool = {}; for (const tool of calls.values()) by_tool[tool] = (by_tool[tool] ?? 0) + 1;
  return { input_tokens: tokens.input, output_tokens: tokens.output, reasoning_tokens: tokens.reasoning, cached_input_tokens: tokens.cache_read, cache_write_tokens: tokens.cache_write, total_tokens: tokens.input + tokens.output + tokens.reasoning + tokens.cache_read + tokens.cache_write, tool_calls: { total: calls.size, failures, by_tool }, cost_usd: assistants.reduce((sum, item) => sum + (item.info.cost ?? 0), 0) };
}
