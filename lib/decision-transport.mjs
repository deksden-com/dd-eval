import { observedTimeout } from "./observation-clock.mjs";

export const decisionLimits = Object.freeze({ inactivityMs: 30_000, requestBytes: 65_536, responseBytes: 65_536 });
const permanentCodes = ["CERT_HAS_EXPIRED", "UNABLE_TO_VERIFY_LEAF_SIGNATURE", "DEPTH_ZERO_SELF_SIGNED_CERT", "SELF_SIGNED_CERT_IN_CHAIN"];
const transientCodes = ["ENOTFOUND", "EAI_AGAIN", "ECONNRESET", "ECONNREFUSED", "ETIMEDOUT", "UND_ERR_CONNECT_TIMEOUT", "UND_ERR_HEADERS_TIMEOUT", "UND_ERR_BODY_TIMEOUT", "UND_ERR_SOCKET"];
export function decisionRetryAfter(value, now = Date.now()) {
  if (typeof value !== "string" || !value.trim()) return null;
  const text = value.trim();
  if (/^\d+(?:\.\d+)?$/.test(text)) { const ms = Number(text) * 1000; return Number.isFinite(ms) ? ms : null; }
  if (!/^[A-Za-z]{3}, \d{2} [A-Za-z]{3} \d{4} \d{2}:\d{2}:\d{2} GMT$/.test(text)) return null;
  const at = Date.parse(text); return Number.isFinite(at) ? Math.max(0, at - now) : null;
}
function httpFailure(status, raw) {
  const code = raw?.error?.code ?? raw?.error?.type, message = raw?.error?.message;
  const quota = /(?:insufficient_quota|quota_exceeded|billing_hard_limit|credit_balance|usage_limit_reached)/i.test(String(code ?? ""))
    || typeof message === "string" && /(?:insufficient (?:credits|quota)|quota (?:exhausted|exceeded)|billing hard limit)/i.test(message);
  return { state: "failed", reason: quota ? "hard_quota" : `http_${status}`, retryable: !quota && (status === 408 || status === 429 || status >= 500 && status <= 599) };
}

/** No retry/ownership policy here: headers and nonempty bytes are the only progress. */
export async function requestDecisionJson({ endpoint, body, key, signal, fetchImpl = fetch, limits = decisionLimits, decode }) {
  const started = performance.now();
  let reason = "transport_failed", http_status = null, transport_code = null, retry_after_ms = null, reader, cursor = 0;
  const result = value => ({ ...value, phase: reason, http_status, transport_code, retry_after_ms, latency_ms: performance.now() - started });
  signal?.throwIfAborted();
  if (!key) { reason = "missing_key"; return result({ state: "unavailable", reason, retryable: false }); }
  if (Buffer.byteLength(body) > limits.requestBytes) { reason = "input_limit"; return result({ state: "unavailable", reason, retryable: false }); }
  const abort = new AbortController(), combined = signal ? AbortSignal.any([signal, abort.signal]) : abort.signal;
  const cancelReader = () => { void reader?.cancel().catch(() => {}); };
  combined.addEventListener("abort", cancelReader, { once: true });
  const timer = observedTimeout(clock => { reason = clock.observationLost ? "observation_lost" : "network_inactivity"; abort.abort(); }, limits.inactivityMs, { progress: () => cursor });
  const failure = (raw = null) => http_status !== null && http_status !== 200 && reason !== "observation_lost"
    ? result(httpFailure(http_status, raw))
    : result({ state: "failed", reason, retryable: ["transport_failed", "response_read_failed", "network_inactivity"].includes(reason) && !permanentCodes.includes(transport_code) });
  try {
    const reply = await fetchImpl(endpoint, { method: "POST", redirect: "error", headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" }, body, signal: combined });
    combined.throwIfAborted();
    http_status = reply.status; cursor++; reason = "response_read_failed";
    retry_after_ms = decisionRetryAfter(reply.headers.get("retry-after"));
    if (http_status !== 200 && ![408, 429].includes(http_status) && !(http_status >= 500 && http_status <= 599)) return failure();
    if (!reply.body) { reason = "response_missing"; return failure(); }
    reader = reply.body.getReader(); let size = 0; const chunks = [];
    for (;;) {
      const { done, value } = await reader.read();
      combined.throwIfAborted();
      if (done) break;
      if (!value.length) continue;
      cursor += value.length; size += value.length;
      if (size > limits.responseBytes) { reason = "output_limit"; return failure(); }
      chunks.push(value);
    }
    reason = "response_json_invalid";
    const raw = JSON.parse(Buffer.concat(chunks, size).toString("utf8"));
    if (http_status !== 200) return failure(raw);
    reason = "response_schema_invalid";
    const value = decode(raw, reply.headers);
    reason = "completed";
    return result({ state: "completed", ...value });
  } catch (error) {
    signal?.throwIfAborted();
    const code = error?.cause?.code ?? error?.code;
    transport_code = [...transientCodes, ...permanentCodes].includes(code) ? code : null;
    return failure();
  } finally {
    clearInterval(timer); combined.removeEventListener("abort", cancelReader); abort.abort(); await reader?.cancel().catch(() => {});
  }
}
