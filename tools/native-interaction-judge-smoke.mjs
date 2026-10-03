import assert from 'node:assert/strict';
import { readFile, mkdtemp, writeFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { interactionJudge } from '../lib/runner.mjs';

// Explicit opt-in: uses the configured native Judge and retains both receipts.
// Supply a fully covered packet whose answers do not specify audit retention.
const args = process.argv.slice(2);
const pair = args[0] === '--pair';
const [packetFile, resolvedPacketFile, profileId, runtimeRoot, projectRoot] = pair ? args.slice(1) : [args[0], null, ...args.slice(1)];
if (!packetFile || !profileId || !runtimeRoot || !projectRoot) {
  throw new Error('Usage: node tools/native-interaction-judge-smoke.mjs [--pair <unresolved-packet.json> <resolved-packet.json> | <covered-packet.json>] <judge-profile> <runtime-root> <project-root>');
}
const packet = JSON.parse(await readFile(packetFile, 'utf8'));
const attempt = await mkdtemp(path.join(tmpdir(), 'dd-eval-hitl-smoke-'));
console.log(JSON.stringify({ attempt, source_packet: path.resolve(packetFile) }));
const results = [];
const resolved = pair ? JSON.parse(await readFile(resolvedPacketFile, 'utf8')) : null;
const trials = pair ? Array.from({ length: 3 }, (_, i) => [
  [`unresolved-${i + 1}`, packet, 'ambiguous'], [`resolved-${i + 1}`, resolved, 'covered_by_canonical_response']
]).flat() : [
  ['covered', packet, 'covered_by_canonical_response'],
  ['gap', { ...packet, question: packet.question + '\n\nIndependent decision: what is the exact retention period, in days, for the audit history?' }, 'fixture_gap']
];
for (const [label, input, expected] of trials) {
  const trialAttempt = path.join(attempt, label);
  await mkdir(trialAttempt);
  const contextFile = path.join(trialAttempt, 'subject-context.json');
  await writeFile(contextFile, JSON.stringify(input.subject_context));
  const fixture = { responses: input.responses, sha256: createHash('sha256').update(JSON.stringify(input.responses)).digest('hex') };
  try {
    const result = await interactionJudge({
    runProfile: { value: { interaction_judge: { profile_id: profileId } } },
    fixture, question: input.question, attempt: trialAttempt, stage: input.stage, contextFile,
    projectRoot: path.resolve(projectRoot), runtimeRoot: path.resolve(runtimeRoot)
  });
    results.push({ label, expected, verdict: result.verdict, receipt_file: result.receipt_file });
  } catch (error) {
    results.push({ label, expected, error: { code: error.code, message: error.message } });
    await writeFile(path.join(attempt, 'results.json'), JSON.stringify(results, null, 2));
    throw error;
  }
  await writeFile(path.join(attempt, 'results.json'), JSON.stringify(results, null, 2));
  console.log(JSON.stringify(results.at(-1)));
}
for (const result of results) {
  assert.equal(result.verdict.classification, result.expected, result.label);
  if (pair && result.expected === 'ambiguous') {
    assert.equal(result.verdict.status, 'unmatched', result.label);
    assert.deepEqual(result.verdict.response_ids, [], `${result.label}: unresolved references cannot select an answer`);
  } else if (result.expected === 'covered_by_canonical_response') assert.equal(result.verdict.status, 'matched', result.label);
}
