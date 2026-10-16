import { test } from 'node:test';
import assert from 'node:assert/strict';
import { requestLunaDecision, validateLunaDecision } from '../lib/luna-decisions.mjs';

const result = p => ({ model: 'gpt-6-luna', answers: [{ type: 'predicate', name: 'uncovered', probability: p }], usage: { input_tokens: 12 } });
test('Decisions probability, identity and refusal are distinct', () => {
  assert.equal(validateLunaDecision(result(0)), 0);
  for (const p of [-1, 2, NaN, '0']) assert.throws(() => validateLunaDecision(result(p)));
  assert.throws(() => validateLunaDecision({ ...result(0), model: 'other' }));
  assert.equal(validateLunaDecision({ model: 'gpt-6-luna', answers: [{ type: 'refusal', name: 'uncovered' }] }), null);
});
test('transport sends documented API and validates bounded responses', async () => {
  const fetchImpl = async (url, options) => {
    assert.equal(url, 'https://api.openai.com/v1/decisions');
    assert.equal(options.redirect, 'error');
    return new Response(JSON.stringify(result(0.2)));
  };
  assert.equal((await requestLunaDecision({}, { key: 'test', fetchImpl })).probability, 0.2);
  assert.equal((await requestLunaDecision({}, { key: '' })).state, 'unavailable');
  assert.equal((await requestLunaDecision({}, { key: 'test', fetchImpl: async () => new Response(JSON.stringify({ model: 'gpt-6-luna', answers: [{ type: 'refusal', name: 'uncovered' }] })) })).state, 'refused');
  assert.equal((await requestLunaDecision({}, { key: 'test', fetchImpl: async () => new Response('{') })).state, 'failed');
  assert.equal((await requestLunaDecision({}, { key: 'test', limits: { requestBytes: 1 } })).reason, 'input_limit');
  await assert.rejects(requestLunaDecision({}, { key: 'test', signal: AbortSignal.abort() }));
  assert.equal((await requestLunaDecision({}, { key: 'test', fetchImpl: async () => new Response('', { status: 429 }) })).reason, 'http_429');
  assert.equal((await requestLunaDecision({}, { key: 'test', fetchImpl, limits: { inactivityMs: 1000, requestBytes: 100, responseBytes: 2 } })).reason, 'output_limit');
});
