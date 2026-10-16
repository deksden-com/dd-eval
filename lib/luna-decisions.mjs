import { hitlCoverageInput } from './hitl-contract.mjs';
import { jevInstructions, coverageLimits } from './hitl-coverage.mjs';
import { observedTimeout } from './observation-clock.mjs';

export function lunaDecisionRequest(packet) {
  return { model: 'gpt-6-luna', input: JSON.stringify(hitlCoverageInput(packet)),
    questions: [{ type: 'predicate', name: 'uncovered', instructions: jevInstructions }] };
}

export function validateLunaDecision(value) {
  if (value?.model !== 'gpt-6-luna' || !Array.isArray(value.answers) || value.answers.length !== 1
    || value.answers[0]?.name !== 'uncovered') throw new Error('Invalid Decisions identity');
  const answer = value.answers[0];
  if (answer.type === 'refusal') return null;
  if (answer.type !== 'predicate' || !Number.isFinite(answer.probability)
    || answer.probability < 0 || answer.probability > 1) throw new Error('Invalid Decisions probability');
  return answer.probability;
}

/** Experimental transport only: no routing threshold, retries or E2E mutation. */
export async function requestLunaDecision(request, { key = process.env.OPENAI_DECISIONS_API_KEY,
  signal, fetchImpl = fetch, limits = coverageLimits } = {}) {
  if (!key) return { state: 'unavailable', reason: 'missing_key' };
  const body = JSON.stringify(request);
  if (Buffer.byteLength(body) > limits.requestBytes) return { state: 'unavailable', reason: 'input_limit' };
  signal?.throwIfAborted();
  const abort = new AbortController(), started = performance.now();
  const combined = signal ? AbortSignal.any([signal, abort.signal]) : abort.signal;
  let cursor = 0, reason = 'transport_or_response_invalid', reader;
  const timer = observedTimeout(clock => {
    reason = clock.observationLost ? 'observation_lost' : 'network_inactivity'; abort.abort();
  }, limits.inactivityMs, { progress: () => cursor });
  try {
    const response = await fetchImpl('https://api.openai.com/v1/decisions', {
      method: 'POST', redirect: 'error', headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' }, body, signal: combined });
    cursor++;
    if (response.status !== 200) return { state: 'failed', reason: `http_${response.status}` };
    if (!response.body) return { state: 'failed', reason: 'response_missing' };
    reader = response.body.getReader();
    let size = 0; const chunks = [];
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value.length) continue;
      cursor += value.length; size += value.length;
      if (size > limits.responseBytes) return { state: 'failed', reason: 'output_limit' };
      chunks.push(value);
    }
    const value = JSON.parse(Buffer.concat(chunks, size).toString('utf8'));
    const probability = validateLunaDecision(value);
    const usage = Object.fromEntries(Object.entries(value.usage ?? {}).filter(([k, v]) =>
      ['input_tokens', 'output_tokens', 'total_tokens'].includes(k) && Number.isSafeInteger(v) && v >= 0));
    return { state: probability === null ? 'refused' : 'completed', probability,
      response: { model: value.model, answers: value.answers, usage },
      request_id: response.headers.get('x-request-id'), latency_ms: performance.now() - started };
  } catch {
    signal?.throwIfAborted();
    return { state: 'failed', reason };
  } finally { clearInterval(timer); abort.abort(); await reader?.cancel().catch(() => {}); }
}
