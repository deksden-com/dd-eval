import path from "node:path";
import { mkdir } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import { hashJson, sha256, writeJsonAtomic } from "./runner-events.mjs";
import { readRegularFile } from "./regular-file.mjs";
import { withRunnerLock } from "./runner-lock.mjs";
import { observedTimeout } from "./observation-clock.mjs";
import { processSnapshot } from "./process-snapshot.mjs";
import { hitlCoverageInput, hitlCoverageContract, validateHitlCoverage } from "./hitl-contract.mjs";
import { jevInstructions, coverageLimits } from "./hitl-coverage.mjs";
import { openaiDecisions } from "./semantic-openai-decisions.mjs";
import { openrouterDecisions } from "./semantic-openrouter-decisions.mjs";

const plugins = new Map([openaiDecisions, openrouterDecisions].map(plugin => [plugin.id, plugin]));
const object = value => value !== null && typeof value === "object" && !Array.isArray(value);
const digest = value => typeof value === "string" && /^[a-f0-9]{64}$/.test(value);
const fail = (message, code = "judge_evidence_mismatch") => { throw Object.assign(new Error(message), { code }); };
const optional = async file => { try { return JSON.parse(await readRegularFile(file)); } catch (error) { if (error.code === "ENOENT") return null; throw error; } };
const withoutFile = ({ file: _file, ...value }) => value;
const states = ["prepared", "attempt_pending", "backoff", "completed", "fallback_intended", "aborted"];
export const semanticLimits = coverageLimits;
const exact = (value, keys) => object(value) && Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key));

export function validateSemanticConfig(value) {
  if (value === undefined) return { enabled: false };
  if (!object(value) || typeof value.enabled !== "boolean") fail("Invalid semantic decision configuration", "semantic_config_invalid");
  if (!value.enabled) {
    if (Object.keys(value).length !== 1) fail("Disabled semantic decisions cannot include provider settings", "semantic_config_invalid");
    return { enabled: false };
  }
  const allowed = ["enabled", "provider", "model", "min_confidence", "max_retries"];
  const plugin = plugins.get(value.provider);
  if (!exact(value, allowed) || !plugin?.validateModel(value.model)
    || typeof value.min_confidence !== "number" || !Number.isFinite(value.min_confidence) || value.min_confidence <= .5 || value.min_confidence > 1
    || !Number.isSafeInteger(value.max_retries) || value.max_retries < 0 || value.max_retries > 2)
    fail("Invalid semantic decision provider/model/policy", "semantic_config_invalid");
  return Object.fromEntries(allowed.map(key => [key, value[key]]));
}

export function semanticQuestion(packet) {
  return validateSemanticRequest({ schema_id: "dd-eval/semantic-questions@1", state: hitlCoverageInput(packet), questions: [{
    id: "uncovered", type: "predicate", instructions: jevInstructions,
    criteria: { true: "At least one decision or material reference remains unresolved.", false: "Every decision is resolved with unambiguous context." }
  }] });
}

export function validateSemanticRequest(request) {
  if (!exact(request, ["schema_id", "state", "questions"]) || request.schema_id !== "dd-eval/semantic-questions@1"
    || !object(request.state) || !Array.isArray(request.questions) || !request.questions.length) fail("Invalid semantic request", "semantic_input_invalid");
  const ids = new Set();
  for (const q of request.questions) {
    if (!exact(q, ["id", "type", "instructions", "criteria"]) || typeof q.id !== "string" || !q.id || ids.has(q.id) || q.type !== "predicate"
      || typeof q.instructions !== "string" || !q.instructions || !exact(q.criteria, ["true", "false"])
      || typeof q.criteria.true !== "string" || !q.criteria.true || typeof q.criteria.false !== "string" || !q.criteria.false)
      fail("Invalid semantic question", "semantic_input_invalid");
    ids.add(q.id);
  }
  // JSON.stringify otherwise silently drops undefined/functions or changes NaN to
  // null, which would give the provider a different state than the caller froze.
  const ancestors = new Set(); let count = 0;
  const jsonValue = (value, depth = 0) => {
    if (++count > 65_536 || depth > 256) fail("Semantic JSON state exceeds structural limits", "semantic_input_invalid");
    if (value === null || typeof value === "string" || typeof value === "boolean" || typeof value === "number" && Number.isFinite(value)) return;
    if (!value || typeof value !== "object" || ancestors.has(value) || !Array.isArray(value) && ![Object.prototype, null].includes(Object.getPrototypeOf(value)))
      fail("Semantic state contains a non-JSON value", "semantic_input_invalid");
    ancestors.add(value); for (const item of Object.values(value)) jsonValue(item, depth + 1); ancestors.delete(value);
  };
  jsonValue(request);
  // Freeze by JSON value, not a caller's mutable objects. No secret/model input is added.
  try { return JSON.parse(JSON.stringify(request)); } catch { fail("Semantic request is not JSON", "semantic_input_invalid"); }
}

export async function semanticFingerprint(config) {
  config = validateSemanticConfig(config);
  if (!config.enabled) return null;
  const files = ["semantic-decisions.mjs", `semantic-${config.provider}.mjs`, "hitl-contract.mjs", "hitl-coverage.mjs", "observation-clock.mjs"];
  return hashJson({ contract: "dd-eval/semantic-policy@1", provider: config.provider,
    sources: await Promise.all(files.map(async file => [file, sha256(await readRegularFile(new URL(file, import.meta.url)))])) });
}

export function ownerEnvironment(config, legacyPolicy = null, env = process.env) {
  const result = { ...env }, selected = validateSemanticConfig(config);
  delete result.OPENROUTER_API_KEY; delete result.OPENAI_DECISIONS_API_KEY;
  if (selected.enabled) {
    const credential = plugins.get(selected.provider).credential;
    if (env[credential] !== undefined) result[credential] = env[credential];
  } else if (legacyPolicy && env.OPENROUTER_API_KEY !== undefined) result.OPENROUTER_API_KEY = env.OPENROUTER_API_KEY;
  return result;
}

export function confidenceMeets(confidence, threshold) {
  return typeof confidence === "number" && Number.isFinite(confidence) && confidence >= .5 && confidence <= 1
    && typeof threshold === "number" && Number.isFinite(threshold) && threshold > .5 && threshold <= 1
    && confidence + 4 * Number.EPSILON >= threshold;
}

function normalize(decoded, request, config) {
  if (!Array.isArray(decoded?.probabilities) || decoded.probabilities.length !== request.questions.length) fail("Invalid semantic response IDs", "semantic_response_invalid");
  const mapped = new Map();
  for (const answer of decoded.probabilities) {
    if (!object(answer) || typeof answer.id !== "string" || mapped.has(answer.id)
      || !(answer.probability_true === null || typeof answer.probability_true === "number" && Number.isFinite(answer.probability_true) && answer.probability_true >= 0 && answer.probability_true <= 1))
      fail("Invalid semantic response probability", "semantic_response_invalid");
    mapped.set(answer.id, answer.probability_true);
  }
  const answers = request.questions.map(q => {
    if (!mapped.has(q.id)) fail("Semantic response answers another question", "semantic_response_invalid");
    const p = mapped.get(q.id), value = p === null || p === .5 ? null : p > .5;
    return { id: q.id, status: p === null ? "refused" : p === .5 ? "uncertain" : "answered", value,
      probability_true: p, confidence: p === null ? null : value ? p : 1 - p };
  });
  const metadata = decoded.metadata;
  const plugin = plugins.get(config.provider);
  if (!object(metadata) || metadata.requested_model !== config.model || typeof metadata.returned_model !== "string"
    || metadata.provider !== (plugin === openaiDecisions ? "OpenAI" : "TypeSafe")) fail("Invalid semantic response metadata", "semantic_response_invalid");
  return { schema_id: "dd-eval/semantic-answer@1", answers, metadata };
}

function validateAnswer(response, request, config) {
  if (!object(response) || response.schema_id !== "dd-eval/semantic-answer@1" || Object.keys(response).length !== 3
    || !Array.isArray(response.answers) || !object(response.metadata)) fail("Invalid retained semantic answer");
  const plugin = plugins.get(config.provider), metadata = response.metadata;
  const wire = plugin === openaiDecisions
    ? { model: metadata.returned_model, answers: response.answers.map(a => ({ name: a.id, type: a.status === "refused" ? "refusal" : "predicate", probability: a.probability_true })), usage: metadata.usage }
    : { model: metadata.returned_model, provider: metadata.provider, id: metadata.request_id, answers: Object.fromEntries(response.answers.map(a => [a.id, { type: "noul", noul: a.probability_true }])), usage: metadata.usage };
  const derived = normalize(plugin.decode(wire, config.model), request, config);
  // OpenAI request ID is transport metadata, not part of its JSON answer.
  if (plugin === openaiDecisions) derived.metadata.request_id = metadata.request_id;
  if (hashJson(derived) !== hashJson(response)) fail("Retained semantic answer fields changed");
  if (!(metadata.request_id === null || typeof metadata.request_id === "string" && metadata.request_id.length <= 256)) fail("Invalid retained request ID");
  return response;
}

export function semanticFastPathAnswer(response, config) {
  config = validateSemanticConfig(config);
  return config.enabled && response?.answers?.length > 0 && response.answers.every(answer => answer.status === "answered"
    && confidenceMeets(answer.confidence, config.min_confidence)) ? response.answers : null;
}

export function semanticMetrics(observation) {
  const attempts = observation.attempts ?? [];
  const sum = field => attempts.every(item => typeof item[field] === "number" && Number.isFinite(item[field]) && item[field] >= 0)
    ? attempts.reduce((total, item) => total + item[field], 0) : null;
  const end = observation.settled_at ?? observation.fallback_intended_at;
  const elapsed = Date.parse(end) - Date.parse(observation.prepared_at);
  return { http_latency_ms: sum("latency_ms"), backoff_ms: sum("backoff_ms"), scheduled_backoff_ms: sum("delay_ms"),
    total_ms: Number.isFinite(elapsed) && elapsed >= 0 ? elapsed : null, attempts: attempts.length };
}

export function semanticRetryAfter(value, now = Date.now()) {
  if (typeof value !== "string" || !value.trim()) return null;
  const text = value.trim();
  if (/^\d+(?:\.\d+)?$/.test(text)) { const ms = Number(text) * 1000; return Number.isFinite(ms) ? ms : null; }
  // HTTP-date is not a relative numeric date (Date.parse accepts e.g. "-1").
  if (!/^[A-Za-z]{3}, \d{2} [A-Za-z]{3} \d{4} \d{2}:\d{2}:\d{2} GMT$/.test(text)) return null;
  const at = Date.parse(text); return Number.isFinite(at) ? Math.max(0, at - now) : null;
}

function providerFailure(status, raw) {
  const code = raw?.error?.code ?? raw?.error?.type;
  const message = raw?.error?.message;
  const hardQuota = /(?:insufficient_quota|quota_exceeded|billing_hard_limit|credit_balance|usage_limit_reached)/i.test(String(code ?? ""))
    || typeof message === "string" && /(?:insufficient (?:credits|quota)|quota (?:exhausted|exceeded)|billing hard limit)/i.test(message);
  return { state: "failed", reason: hardQuota ? "hard_quota" : `http_${status}`,
    retryable: !hardQuota && (status === 408 || status === 429 || status >= 500 && status <= 599) };
}

/** Transport owns no filesystem lock; only received headers/nonempty bytes are progress. */
export async function requestSemantic(request, config, { key, signal, fetchImpl = fetch, limits = semanticLimits } = {}) {
  config = validateSemanticConfig(config); request = validateSemanticRequest(request);
  if (!config.enabled) return { state: "unavailable", reason: "disabled", retryable: false };
  const plugin = plugins.get(config.provider), body = JSON.stringify(plugin.encode(request, config.model));
  if (!key) return { state: "unavailable", reason: "missing_key", retryable: false };
  if (Buffer.byteLength(body) > limits.requestBytes) return { state: "unavailable", reason: "input_limit", retryable: false };
  signal?.throwIfAborted();
  const abort = new AbortController(), combined = signal ? AbortSignal.any([signal, abort.signal]) : abort.signal;
  let cursor = 0, reason = "transport_or_response_invalid", reader;
  const cancelReader = () => { void reader?.cancel().catch(() => {}); };
  combined.addEventListener("abort", cancelReader, { once: true });
  const started = performance.now();
  const timer = observedTimeout(clock => { reason = clock.observationLost ? "observation_lost" : "network_inactivity"; abort.abort(); }, limits.inactivityMs, { progress: () => cursor });
  try {
    const reply = await fetchImpl(plugin.endpoint, { method: "POST", redirect: "error", headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" }, body, signal: combined });
    cursor++;
    const retry_after_ms = semanticRetryAfter(reply.headers.get("retry-after"));
    // Auth/input/billing refusals are already conclusive from headers. A slow or
    // malformed diagnostic body cannot turn one into a retryable network error.
    if (reply.status !== 200 && ![408, 429].includes(reply.status) && !(reply.status >= 500 && reply.status <= 599))
      return { ...providerFailure(reply.status, null), latency_ms: performance.now() - started };
    if (!reply.body) return { state: "failed", reason: "response_missing", retryable: true, latency_ms: performance.now() - started };
    reader = reply.body.getReader(); let size = 0; const chunks = [];
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value.length) continue;
      cursor += value.length; size += value.length;
      if (size > limits.responseBytes) return { state: "failed", reason: "output_limit", retryable: false, latency_ms: performance.now() - started };
      chunks.push(value);
    }
    combined.throwIfAborted();
    const text = Buffer.concat(chunks, size).toString("utf8"); let raw;
    try { raw = JSON.parse(text); } catch {
      if (reply.status !== 200) return { ...providerFailure(reply.status, null), retry_after_ms, latency_ms: performance.now() - started };
      throw new Error("Invalid response JSON");
    }
    if (reply.status !== 200) return { ...providerFailure(reply.status, raw), retry_after_ms, latency_ms: performance.now() - started };
    const response = normalize(plugin.decode(raw, config.model), request, config);
    if (plugin === openaiDecisions) {
      const requestId = reply.headers.get("x-request-id");
      response.metadata.request_id = requestId && requestId.length <= 256 ? requestId : null;
    }
    return { state: "completed", response, response_sha256: hashJson(response), latency_ms: performance.now() - started };
  } catch {
    signal?.throwIfAborted();
    return { state: "failed", reason, retryable: reason !== "observation_lost", latency_ms: performance.now() - started };
  } finally { clearInterval(timer); combined.removeEventListener("abort", cancelReader); abort.abort(); await reader?.cancel().catch(() => {}); }
}

function validateSourceBinding(value) {
  if (value === null || value === undefined) return null;
  if (!exact(value, ["packet_sha256", "fixture_sha256", "operation_id", "generation"]) || !digest(value.packet_sha256)
    || !(value.fixture_sha256 === null || digest(value.fixture_sha256))
    || !(value.operation_id === null || typeof value.operation_id === "string" && value.operation_id.length > 0)
    || !(value.generation === null || Number.isSafeInteger(value.generation) && value.generation >= 0)) fail("Invalid semantic source binding");
  return value;
}

export function verifySemanticObservation(observation, { request, config, binding, sourceBinding = null, evalRunId = null, fingerprint }) {
  config = validateSemanticConfig(config); request = validateSemanticRequest(request);
  if (!config.enabled || !digest(fingerprint)) fail("Invalid semantic observation policy");
  const identity = { binding: binding ?? null, source_binding: validateSourceBinding(sourceBinding), eval_run_id: evalRunId,
    request_sha256: hashJson(request), policy_sha256: hashJson(config), dependency_sha256: fingerprint };
  if (observation?.schema_id !== "dd-eval/semantic-observation@1" || hashJson(observation.identity) !== hashJson(identity)
    || !states.includes(observation.state) || !Array.isArray(observation.attempts) || observation.attempts.length > config.max_retries + 1)
    fail("Semantic observation belongs to another input");
  for (const [index, attempt] of observation.attempts.entries()) {
    if (!object(attempt) || attempt.ordinal !== index + 1 || !["pending", "completed", "failed", "unknown", "aborted"].includes(attempt.state)
      || typeof attempt.token !== "string" || !attempt.token || !Number.isSafeInteger(attempt.owner_pid) || attempt.owner_pid < 1 || typeof attempt.owner_started !== "string"
      || !Number.isFinite(Date.parse(attempt.dispatched_at))) fail("Invalid semantic attempt history");
    if (attempt.delay_ms !== undefined && (!Number.isFinite(attempt.delay_ms) || attempt.delay_ms < 0 || attempt.delay_ms > 10_000
      || !(attempt.not_before === null || Number.isFinite(Date.parse(attempt.not_before))))) fail("Invalid semantic attempt backoff");
    if (attempt.state === "completed") {
      validateAnswer(attempt.response, request, config);
      if (attempt.response_sha256 !== hashJson(attempt.response)) fail("Semantic attempt response changed");
    }
    if (attempt.state === "pending" && (index !== observation.attempts.length - 1 || observation.state !== "attempt_pending")) fail("Invalid pending semantic attempt");
    if (attempt.state !== "pending" && !Number.isFinite(Date.parse(attempt.finished_at))) fail("Invalid settled semantic attempt");
  }
  if (observation.response) {
    validateAnswer(observation.response, request, config);
    if (observation.response_sha256 !== hashJson(observation.response) || observation.attempts.at(-1)?.state !== "completed"
      || observation.attempts.at(-1).response_sha256 !== observation.response_sha256) fail("Retained semantic response changed");
  }
  if (observation.state === "completed" && !observation.response) fail("Completed semantic observation has no answer");
  if (observation.state === "backoff" && (!Number.isFinite(Date.parse(observation.not_before)) || !Number.isFinite(observation.delay_ms) || observation.delay_ms < 0 || observation.delay_ms > 10_000)) fail("Invalid retained semantic backoff");
  return observation;
}

/** Single task ownership; terminal responses and earlier outcomes never resample. */
export async function observeSemantic({ root, request, config, binding, sourceBinding = null, evalRunId = null, admit = async () => {}, signal, fingerprint, skipReason = null, transport = {} }) {
  config = validateSemanticConfig(config);
  if (!config.enabled) return { state: "unavailable", reason: "disabled" };
  request = validateSemanticRequest(request);
  const retainedFingerprint = fingerprint ?? await semanticFingerprint(config);
  const plugin = plugins.get(config.provider), key = transport.key ?? process.env[plugin.credential];
  const { sleep = delay, random = Math.random, snapshot = processSnapshot } = transport;
  const file = path.join(root, "semantic-observation.json"), token = randomUUID();
  sourceBinding = validateSourceBinding(sourceBinding);
  const identity = { binding: binding ?? null, source_binding: sourceBinding, eval_run_id: evalRunId,
    request_sha256: hashJson(request), policy_sha256: hashJson(config), dependency_sha256: retainedFingerprint };
  const check = async () => {
    await admit(); signal?.throwIfAborted();
    if (await semanticFingerprint(config) !== retainedFingerprint) fail("Semantic decision dependencies changed", "definition_drift");
  };
  const verify = value => verifySemanticObservation(value, { request, config, binding, sourceBinding, evalRunId, fingerprint: retainedFingerprint });
  await mkdir(root, { recursive: true });
  let saved = await withRunnerLock(file, async () => {
    await check();
    let value = await optional(file);
    if (value) {
      verify(value);
      if (value.cancelled) fail("Cancelled semantic task cannot resume", "execution_cancelled");
      if (["completed", "fallback_intended"].includes(value.state)) return value;
      const processes = await snapshot().catch(() => fail("Semantic owner cannot be inspected", "process_ownership_unknown"));
      const physical = processes.find(item => item.pid === value.owner_pid);
      if (physical && !physical.zombie && physical.started === value.owner_started) fail("Semantic task has a live owner", "judge_outcome_unknown");
      if (value.state === "attempt_pending") {
        const attempts = value.attempts.slice();
        attempts[attempts.length - 1] = { ...attempts.at(-1), state: "unknown", reason: "dispatch_outcome_unknown", finished_at: new Date().toISOString() };
        value = { ...value, token, state: "fallback_intended", reason: "dispatch_outcome_unknown", attempts, fallback_intended_at: new Date().toISOString() };
        await writeJsonAtomic(file, value); return value;
      }
    }
    const self = (await snapshot()).find(item => item.pid === process.pid && !item.zombie);
    if (!self) fail("Semantic owner identity cannot be established", "process_ownership_unknown");
    if (!value) {
      const reason = skipReason ?? (binding == null ? "unbound_task" : !key ? "missing_key" : Buffer.byteLength(JSON.stringify(plugin.encode(request, config.model))) > semanticLimits.requestBytes ? "input_limit" : null);
      value = { schema_id: "dd-eval/semantic-observation@1", identity, state: reason ? "fallback_intended" : "prepared", reason,
        attempts: [], token, owner_pid: process.pid, owner_started: self.started, prepared_at: new Date().toISOString(),
        ...(reason ? { fallback_intended_at: new Date().toISOString() } : {}) };
    } else value = { ...value, token, owner_pid: process.pid, owner_started: self.started,
      ...(value.state === "backoff" ? { recovered_backoff: true } : {}) };
    await writeJsonAtomic(file, value); return value;
  }, { signal });
  if (["completed", "fallback_intended"].includes(saved.state)) return { ...saved, file };
  try {
    for (;;) {
      let observedBackoff = 0;
      if (saved.state === "backoff") {
        const wait = Math.min(saved.delay_ms, Math.max(0, Date.parse(saved.not_before) - Date.now()));
        const started = performance.now();
        await sleep(wait, undefined, { signal }); observedBackoff = saved.recovered_backoff ? null : performance.now() - started;
        await check();
      }
      saved = await withRunnerLock(file, async () => {
        await check(); const value = verify(await optional(file));
        if (value.token !== token || !["prepared", "backoff"].includes(value.state)) fail("Semantic task was superseded");
        if (value.attempts.length >= config.max_retries + 1) fail("Semantic dispatch budget changed");
        const attempt = { ordinal: value.attempts.length + 1, token: randomUUID(), owner_pid: value.owner_pid,
          owner_started: value.owner_started, dispatched_at: new Date().toISOString(), state: "pending",
          delay_ms: value.state === "backoff" ? value.delay_ms : 0, not_before: value.state === "backoff" ? value.not_before : null,
          backoff_ms: observedBackoff };
        const next = { ...value, state: "attempt_pending", attempts: [...value.attempts, attempt] };
        await writeJsonAtomic(file, next); return next;
      }, { signal });
      const result = await requestSemantic(request, config, { ...transport, key, signal });
      saved = await withRunnerLock(file, async () => {
        await check(); const value = verify(await optional(file));
        if (value.token !== token || value.state !== "attempt_pending" || value.attempts.at(-1)?.token !== saved.attempts.at(-1).token) fail("Semantic writer was superseded");
        const attempts = value.attempts.slice();
        attempts[attempts.length - 1] = { ...attempts.at(-1), ...result,
          state: result.reason === "observation_lost" ? "unknown" : result.state === "unavailable" ? "failed" : result.state,
          finished_at: new Date().toISOString() };
        let next = { ...value, attempts };
        if (result.state === "completed") next = { ...next, state: "completed", response: result.response, response_sha256: result.response_sha256, settled_at: new Date().toISOString() };
        else if (result.retryable && attempts.length <= config.max_retries && !(result.retry_after_ms > 10_000)) {
          const selectedDelay = Math.max((attempts.length === 1 ? 1000 : 3000) + Math.floor(Math.max(0, Math.min(1, random())) * 250), result.retry_after_ms ?? 0);
          next = { ...next, state: "backoff", delay_ms: selectedDelay, not_before: new Date(Date.now() + selectedDelay).toISOString() };
        } else next = { ...next, state: "fallback_intended", reason: result.retry_after_ms > 10_000 ? "retry_after_limit" : result.reason,
          fallback_intended_at: new Date().toISOString() };
        await writeJsonAtomic(file, next); return next;
      }, { signal });
      if (["completed", "fallback_intended"].includes(saved.state)) return { ...saved, file };
    }
  } catch (error) {
    if (signal?.aborted) {
      // Cancellation never permits fallback. A later owner must reconcile the EVAL fence.
      await withRunnerLock(file, async () => {
        const value = await optional(file);
        if (value?.token !== token) return;
        const attempts = value.attempts.slice();
        if (attempts.at(-1)?.state === "pending") attempts[attempts.length - 1] = { ...attempts.at(-1), state: "aborted", reason: "cancelled", finished_at: new Date().toISOString() };
        await writeJsonAtomic(file, { ...value, state: "aborted", reason: "cancelled", cancelled: true, attempts });
      });
    }
    throw error;
  }
}

export async function markSemanticFallback(root, observation, reason, { admit = async () => {}, signal, fingerprint } = {}) {
  const file = path.join(root, "semantic-observation.json");
  return withRunnerLock(file, async () => {
    await admit(); signal?.throwIfAborted();
    const saved = await optional(file);
    if (!saved || hashJson(saved) !== hashJson(withoutFile(observation))) fail("Semantic fallback observation changed");
    if (saved.cancelled) fail("Cancelled semantic task cannot hand off", "execution_cancelled");
    if (fingerprint && saved.identity.dependency_sha256 !== fingerprint) fail("Semantic fallback dependency binding changed", "definition_drift");
    if (saved.state === "fallback_intended") return { ...saved, file };
    if (saved.state !== "completed") fail("Semantic fallback still has a productive owner", "judge_outcome_unknown");
    const next = { ...saved, state: "fallback_intended", reason, fallback_intended_at: new Date().toISOString() };
    await writeJsonAtomic(file, next); return { ...next, file };
  }, { signal });
}

export async function verifySemanticReceipt(root, receipt, packet) {
  const config = validateSemanticConfig(receipt.policy);
  if (receipt.schema_id !== "dd-eval/hitl-coverage-route@2" || receipt.decision_source !== "semantic_decision"
    || receipt.packet_sha256 !== hashJson(packet) || receipt.policy_sha256 !== hashJson(config) || !digest(receipt.dependency_sha256)
    || Object.hasOwn(receipt, "session_id") || Object.hasOwn(receipt, "profile_id")) fail("Invalid semantic route binding");
  const observation = await optional(path.join(root, "semantic-observation.json"));
  if (!observation || hashJson(observation) !== receipt.observation_sha256 || observation.state !== "completed" || observation.cancelled) fail("Semantic route has no original completed observation");
  const sourceBinding = validateSourceBinding(receipt.source_binding);
  if (!sourceBinding || sourceBinding.packet_sha256 !== hashJson(packet)
    || !digest(receipt.interaction_fixture_sha256) || sourceBinding.fixture_sha256 !== receipt.interaction_fixture_sha256) fail("Semantic route source binding changed");
  verifySemanticObservation(observation, { request: semanticQuestion(packet), config, binding: packet.hitl_binding ?? null,
    sourceBinding, evalRunId: receipt.eval_run_id ?? null, fingerprint: receipt.dependency_sha256 });
  if (packet.responses.length !== 1 || packet.unavailable_sources?.length || packet.source_view?.complete === false
    || !semanticFastPathAnswer(observation.response, config) || observation.response.answers.length !== 1
    || observation.response.answers[0].id !== "uncovered" || observation.response.answers[0].value !== false) fail("Semantic route does not authorize coverage");
  const verdict = validateHitlCoverage({ schema_id: hitlCoverageContract, status: "covered", response_ids: [packet.responses[0].id], uncovered_questions: [] }, packet);
  if (hashJson(verdict) !== hashJson(receipt.verdict) || receipt.answer_sha256 !== sha256(packet.responses[0].answer)
    || receipt.delimiter !== "dd-eval/hitl-response-delimiter@1") fail("Semantic route answer changed");
  return verdict;
}
