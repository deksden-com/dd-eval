import assert from 'node:assert/strict';
import { readFile, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { interactionJudge } from '../lib/runner.mjs';

// Explicit opt-in: uses the configured native Judge and retains both receipts.
// Supply a fully covered packet whose answers do not specify audit retention.
const [packetFile, profileId, runtimeRoot, projectRoot] = process.argv.slice(2);
if (!packetFile || !profileId || !runtimeRoot || !projectRoot) {
  throw new Error('Usage: node tools/native-interaction-judge-smoke.mjs <covered-packet.json> <judge-profile> <runtime-root> <project-root>');
}
const packet = JSON.parse(await readFile(packetFile, 'utf8'));
const attempt = await mkdtemp(path.join(tmpdir(), 'dd-eval-hitl-smoke-'));
const contextFile = path.join(attempt, 'subject-context.json');
await writeFile(contextFile, JSON.stringify(packet.subject_context));
const fixture = { responses: packet.responses, sha256: createHash('sha256').update(JSON.stringify(packet.responses)).digest('hex') };
console.log(JSON.stringify({ attempt, source_packet: path.resolve(packetFile) }));
const results = [];
for (const [label, question] of [
  ['covered', packet.question],
  ['gap', packet.question + '\n\nIndependent decision: what is the exact retention period, in days, for the audit history?']
]) {
  const result = await interactionJudge({
    runProfile: { value: { interaction_judge: { profile_id: profileId } } },
    fixture, question, attempt, stage: packet.stage, contextFile,
    projectRoot: path.resolve(projectRoot), runtimeRoot: path.resolve(runtimeRoot)
  });
  results.push({ label, verdict: result.verdict, receipt_file: result.receipt_file });
  console.log(JSON.stringify(results.at(-1)));
}
await writeFile(path.join(attempt, 'results.json'), JSON.stringify(results, null, 2));
assert.equal(results[0].verdict.status, 'matched');
assert.equal(results[1].verdict.status, 'unmatched');
assert.ok(results[1].verdict.uncovered_questions.length > 0);
