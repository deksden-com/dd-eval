import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { buildHitlPacket, validateGroundedHitl, validateHitlPacket, interactionGroundedPrompt, interactionCoveragePrompt, canonicalExclusionRule, hitlCoverageContract } from '../lib/hitl-contract.mjs';
import { validateExpectedAtoms, compareCoverageExpectation } from '../lib/hitl-corpus.mjs';
import { semanticQuestion } from '../lib/semantic-decisions.mjs';
import { jevInstructions } from '../lib/hitl-coverage.mjs';

const root = fileURLToPath(new URL('../cases/sdlc-eval-2026-summer-task-priority/', import.meta.url));
const json = async file => JSON.parse(await readFile(file, 'utf8'));
const fixturePath = file => path.join(root, 'entry-pack-source/interactions', file);
const { responses } = await json(fixturePath('specify.json'));

test('both active cases declare normative bytes, not only their index roles', async () => {
  for (const name of ['sdlc-eval-2026-summer-task-priority', 'sdlc-eval-2026-summer-recovery']) {
    const base = new URL(`../cases/${name}/entry-pack-source/`, import.meta.url);
    const context = await json(new URL('stage-context.json', base));
    const oracle = await json(new URL('context-oracles/specify.json', base));
    for (const [role, source] of [['system_contract', '.memory-bank/spec/system/index.md'], ['engineering_rules', '.memory-bank/spec/engineering/coding-standards.md']]) {
      assert.ok(oracle.required_roles.includes(role));
      assert.deepEqual(context.stages.specify.sources.filter(item => item.role === role).map(item => [item.path, item.required]), [[source, true]]);
    }
  }
});

test('CP254 corpus freezes normative content, preserves exact question and independent negative decisions', async () => {
  const corpus = await json(fixturePath('qualification.json'));
  const compact = await json(fixturePath('qualification-coverage.json'));
  const contextFile = fixturePath('qualification-public-errors.json');
  const bytes = await readFile(contextFile), context = { ...JSON.parse(bytes), roots: { project: root } };
  const items = corpus.items.filter(item => item.id.startsWith('cp254-'));
  assert.equal(items.length, 4);
  for (const item of items) {
    assert.equal(item.context_sha256, createHash('sha256').update(bytes).digest('hex'));
    validateExpectedAtoms(item, { responses, coverageRequired: true });
    const packet = await buildHitlPacket({ stage: 'specify', question: item.question, subjectContext: context, responses });
    assert.ok(packet.grounding_sources.some(source => source.text.includes('Public errors имеют стабильные')));
    assert.ok(packet.grounding_sources.some(source => source.text.includes('Preserve the structured public error contract')));
    const expected = compact.items.find(other => other.id === item.id);
    const allCovered = { schema_id: hitlCoverageContract, status: 'covered', response_ids: [responses[0].id], uncovered_questions: [] };
    // Authored expectations, not a deterministic semantic entailment checker.
    assert.equal(compareCoverageExpectation(expected, allCovered, { responses }).passed, item.status === 'matched');
  }
  const exact = items.find(item => item.id === 'cp254-zcode-public-error-exact');
  assert.match(exact.question, /## Q-003 — Поверхность UI и API/);
  assert.match(exact.question, /неизвестное значение отклоняется стабильной публичной ошибкой без частичной записи/);
  const p = await buildHitlPacket({ stage: 'specify', question: exact.question, subjectContext: context, responses });
  const result = validateGroundedHitl({ schema_id: 'dd-eval/hitl-match@3', atoms: [{
    source_quote: 'стабильной публичной ошибкой', decision: 'Preserve the established public error contract while rejecting invalid priority.', classification: 'covered_by_canonical_response',
    reference_bindings: [], scope_evidence: [], answer_evidence: [{ response_id: responses[0].id, answer_quote: 'Общие правила проекта сохраняются, кроме явно указанного исключения для изменения приоритета в архивном проекте.' }], rationale: 'Canonical preservation plus the frozen existing system contract; this is not acceptance of a new error format.'
  }] }, p);
  assert.equal(result.status, 'matched');
  result.atoms[0].answer_evidence[0].answer_quote = 'Public errors имеют стабильные';
  assert.throws(() => validateGroundedHitl({ schema_id: result.schema_id, atoms: result.atoms }, p), /canonical answer evidence/);
});

test('missing normative source blocks packet construction and frozen packets never reread live bytes', async t => {
  const project = await mkdtemp(path.join(os.tmpdir(), 'hitl105-'));
  t.after(() => rm(project, { recursive: true, force: true }));
  await mkdir(path.join(project, 'rules'));
  const context = { objective: 'Task priority', roots: { project }, sources: [{ role: 'system_contract', path: 'rules/errors.md', required: true }] };
  const input = { stage: 'specify', question: 'Which priority API?', responses, subjectContext: context };
  await assert.rejects(buildHitlPacket(input), { code: 'judge_context_invalid' });
  await writeFile(path.join(project, 'rules/errors.md'), 'Preserve the structured public error contract.');
  const p = await buildHitlPacket(input);
  await writeFile(path.join(project, 'rules/errors.md'), 'Changed after freezing.');
  assert.doesNotThrow(() => validateHitlPacket(p));
  assert.ok(p.grounding_sources.some(source => source.text === 'Preserve the structured public error contract.'));
  const compact = await buildHitlPacket({ ...input, verdictContract: hitlCoverageContract });
  assert.notDeepEqual(compact.grounding_sources, p.grounding_sources);
  for (const prompt of [interactionGroundedPrompt('packet.json'), interactionCoveragePrompt(compact, 'packet.json'), jevInstructions, semanticQuestion(compact).questions[0].instructions]) {
    assert.ok(prompt.includes(canonicalExclusionRule));
    assert.match(prompt, /A frozen authoritative project rule already requiring structured stable public errors/);
    assert.match(prompt, /NEW public error code, format, compatibility guarantee or policy exception remains a separate decision/);
  }
});
