import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { buildHitlPacket } from '../lib/hitl-contract.mjs';
import { runSmokeTrials, referencePairTrials, assertSmokeTrials, main } from '../tools/native-interaction-judge-smoke.mjs';

const responses = [{ id: 'R', answer: 'No extra ordering is required.' }];
async function trial(label = 'covered') {
  const question = 'Do we need extra ordering?', classification = 'covered_by_canonical_response';
  return { label, packet: await buildHitlPacket({ stage: 'specify', question, responses }),
    expected: { id: label, question, classification, status: 'matched', response_ids: ['R'], expected_coverage: {
      obligations: [{ id: 'order', classification, response_ids: ['R'], witness_ids: ['order'] }],
      witnesses: [{ id: 'order', source_quotes: [question], classification, response_ids: ['R'] }] } } };
}
const verdict = packet => ({ schema_id: 'dd-eval/hitl-match@3', status: 'matched', classification: 'covered_by_canonical_response', response_ids: ['R'],
  atoms: [{ source_quote: packet.question, decision: 'Additional order', classification: 'covered_by_canonical_response',
    reference_bindings: [], answer_evidence: [{ response_id: 'R', answer_quote: responses[0].answer }], scope_evidence: [], rationale: 'Canonical refusal covers this option.' }] });
const scratch = () => mkdtemp(path.join(tmpdir(), 'dd-eval-smoke-test-'));
const input = async trials => ({ trials, attempt: await scratch(), runProfile: { value: {} }, runtimeRoot: '/unused', projectRoot: '/unused' });

test('smoke validates every late item and expected coverage before any native Session', async () => {
  for (const mutation of [item => { item.expected.response_ids = ['unknown']; }, item => { item.packet.responses.push(item.packet.responses[0]); }, item => { delete item.expected.expected_coverage; }]) {
    const first = await trial('first'), late = await trial('late'); mutation(late);
    let calls = 0;
    await assert.rejects(runSmokeTrials({ ...await input([first, late]), invoke: async () => { calls++; } }));
    assert.equal(calls, 0);
  }
});

test('frozen smoke source drift rejects before Session rather than silently rebuilding', async () => {
  const root = await scratch(), file = path.join(root, 'accepted.md');
  await writeFile(file, 'Accepted order scope.');
  const item = await trial();
  item.packet = await buildHitlPacket({ stage: 'specify', question: item.packet.question, responses,
    subjectContext: { roots: { project: root }, sources: [{ root: 'project', path: 'accepted.md', role: 'accepted' }] } });
  await writeFile(file, 'Changed scope.');
  let calls = 0;
  await assert.rejects(runSmokeTrials({ ...await input([item]), invoke: async () => { calls++; } }), /Frozen smoke packet grounding changed/);
  assert.equal(calls, 0);
});

test('smoke stops at first semantic mismatch and retains that result, not retries', async () => {
  const options = await input([await trial('first'), await trial('second')]); let calls = 0;
  await assert.rejects(runSmokeTrials({ ...options, invoke: async ({ expectedPacket }) => {
    calls++; const bad = verdict(expectedPacket); bad.atoms = []; return { verdict: bad, receipt_file: '/retained/receipt.json' };
  } }), error => error.code === 'definition_qualification_mismatch');
  assert.equal(calls, 1);
  const results = JSON.parse(await readFile(path.join(options.attempt, 'results.json'), 'utf8'));
  assert.equal(results.length, 1); assert.equal(results[0].comparison.passed, false);
  assert.equal(results[0].receipt_file, '/retained/receipt.json');
});

test('smoke forwards frozen packet binding but no authored expectations to native Judge', async () => {
  const options = await input([await trial('first'), await trial('second')]); let calls = 0;
  const result = await runSmokeTrials({ ...options, invoke: async args => {
    calls++; assert.equal(args.expected, undefined); assert.equal(args.expectedPacket.expected_coverage, undefined);
    return { verdict: verdict(args.expectedPacket), receipt_file: `/retained/${calls}.json` };
  } });
  assert.equal(calls, 2); assert.ok(result.results.every(item => item.comparison.passed));
});

test('smoke retains semantic comparison and original cleanup failure without replacement Session', async () => {
  const options = await input([await trial('first'), await trial('second')]); let calls = 0;
  const cleanup = Object.assign(new Error('Cleanup unconfirmed'), { code: 'judge_cleanup_failed' });
  await assert.rejects(runSmokeTrials({ ...options, invoke: async ({ expectedPacket }) => {
    calls++; cleanup.details = { retained_verdict: { verdict: { verdict: verdict(expectedPacket) }, receipt_file: '/retained/receipt.json' } }; throw cleanup;
  } }), error => error === cleanup);
  assert.equal(calls, 1);
  const [result] = JSON.parse(await readFile(path.join(options.attempt, 'results.json'), 'utf8'));
  assert.equal(result.comparison.passed, true); assert.equal(result.error.code, 'judge_cleanup_failed');
});

test('implicit audit retention is no longer an invented fixture-gap smoke', async () => {
  await assert.rejects(main(['covered-packet.json']), /Implicit audit-gap smoke is unsupported/);
});

test('reference contrast cannot substitute an unrelated question, stage or canonical answer', async () => {
  const item = await trial();
  const unresolved = structuredClone(item.expected);
  unresolved.classification = 'ambiguous'; unresolved.status = 'unmatched'; unresolved.response_ids = [];
  for (const atom of [...unresolved.expected_coverage.obligations, ...unresolved.expected_coverage.witnesses]) {
    atom.classification = 'ambiguous'; atom.response_ids = [];
  }
  const expectations = { unresolved, resolved: item.expected };
  const original = item.packet;
  for (const changed of [
    await buildHitlPacket({ stage: original.stage, question: 'Unrelated easy question?', responses }),
    await buildHitlPacket({ stage: 'plan', question: original.question, responses }),
    await buildHitlPacket({ stage: original.stage, question: original.question, responses: [{ id: 'R', answer: 'Changed canonical answer.' }] })
  ]) assert.throws(() => referencePairTrials([original, changed], expectations), /response identity differs/);
  const resolved = await buildHitlPacket({ stage: original.stage, question: original.question, responses,
    subjectContext: { objective: 'Explicitly identified antecedent.' } });
  const schedule = referencePairTrials([original, resolved], expectations);
  assert.equal(schedule.length, 6); assert.equal(schedule[0].packet, original); assert.equal(schedule[1].packet, resolved);
  await assertSmokeTrials(schedule);
});
