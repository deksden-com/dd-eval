import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { validateCoverageExpectation, compareCoverageExpectation } from '../lib/hitl-corpus.mjs';
import { buildHitlPacket, hitlCoverageContract, validateHitlCoverage } from '../lib/hitl-contract.mjs';
import { hitlQualificationInputs, loadRunProfile } from '../lib/runner.mjs';

const cases = new URL('../cases/', import.meta.url);
const caseRoot = new URL('sdlc-eval-2026-summer-task-priority/', cases);
const interactionRoot = new URL('entry-pack-source/interactions/', caseRoot);
const json = async file => JSON.parse(await readFile(file, 'utf8'));
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const fixture = await json(new URL('specify.json', interactionRoot));
const corpus = await json(new URL('qualification-coverage.json', interactionRoot));
const observations = await json(new URL('fixtures/hitl-cp258-coverage.json', import.meta.url));

test('all authored operational profiles explicitly select the same compact HITL contract', async () => {
  let checked = 0;
  for (const directory of await readdir(cases, { withFileTypes: true })) {
    if (!directory.isDirectory()) continue;
    const root = new URL(`${directory.name}/`, cases);
    const profiles = new URL('run-profiles/', root);
    let names;
    try { names = await readdir(profiles); } catch (error) { if (error.code === 'ENOENT') continue; throw error; }
    for (const name of names.filter(name => name.endsWith('.json'))) {
      const profile = await json(new URL(name, profiles));
      if (!profile.interaction_judge) continue;
      assert.equal(profile.interaction_judge.verdict_contract, hitlCoverageContract, `${directory.name}/${name}`);
      assert.equal(profile.judge.verdict_contract, undefined, 'contract belongs to Interaction Judge, not final Judge');
      await loadRunProfile(new URL(name, profiles).pathname);
      checked++;
      const definition = await json(new URL('case.json', root));
      if (definition.hitl_qualification) assert.ok(definition.hitl_qualification.coverage, `${directory.name} needs an authored compact corpus`);
    }
  }
  assert.ok(checked >= 34, 'include reference/diagnose and the recovery case, not only current harnesses');
});

test('stage answers keep exact labels and explicitly delegate implementation without changing existing boundaries', async () => {
  const plan = await json(new URL('plan.json', interactionRoot));
  assert.equal(plan.responses[0].answer, fixture.responses[0].answer);
  const answer = fixture.responses[0].answer;
  for (const text of [
    'Способ его реализации (миграционное заполнение или fallback при чтении) выбирает исполнитель',
    'Приведённые русские подписи — точные принятые тексты новой функции приоритета.',
    'Локализация остального продукта, второй язык и переключатель языка в задачу не входят.',
    'для новых и существующих задач по умолчанию — `no_priority`.',
    'Смешанное изменение приоритета и других полей отклоняется целиком без частичной записи.',
    'Подпись приоритета на форме создания задачи допустима, но необязательна.',
  ]) assert.ok(answer.includes(text), text);
});

test('compact corpus hashes, context dependencies and authored expectations stay internally consistent', async () => {
  const definition = await json(new URL('case.json', caseRoot));
  assert.equal(definition.hitl_qualification.coverage.sha256, sha(await readFile(new URL(definition.hitl_qualification.coverage.file, caseRoot))));
  const inputs = new Set();
  for (const item of corpus.items) {
    validateCoverageExpectation(item, { responses: fixture.responses });
    const contextBytes = await readFile(new URL(item.context_file, caseRoot));
    assert.equal(sha(contextBytes), item.context_sha256, item.id);
    const identity = JSON.stringify([item.question, JSON.parse(contextBytes)]);
    assert.ok(!inputs.has(identity), `duplicate semantic question/context ${item.id}`);
    inputs.add(identity);
  }
});

test('real CP258 observations remain failures while new sufficient-answer expectations are separate authored data', async () => {
  for (const sample of observations.samples) {
    const item = corpus.items.find(item => item.id === `cp258-${sample.harness}-exact`);
    assert.equal(item.question, sample.question);
    assert.equal(sample.subject_context.accepted_decisions.length, 0);
    assert.ok(sample.source_excerpts.every(source => sha(source.text) === source.original_sha256));
    assert.notEqual(sample.observation.status, 'covered');
    assert.deepEqual(item.coverage_expectation.response_ids, sample.expected_after_fix.response_ids);
    const packet = await buildHitlPacket({ stage: 'specify', question: sample.question, responses: fixture.responses, verdictContract: hitlCoverageContract });
    const authored = validateHitlCoverage({ schema_id: hitlCoverageContract, ...sample.expected_after_fix }, packet);
    assert.equal(compareCoverageExpectation(item, authored, { responses: fixture.responses }).passed, true);
    // This checks the oracle and packet contract, not a newly generated model verdict.
    assert.equal(sample.observation.status, sample.harness === 'zcode' ? 'unmatched' : 'uncovered');
  }
});

test('true language conflicts, localization and material operational choices cannot pass as covered', () => {
  const falselyCovered = { schema_id: hitlCoverageContract, status: 'covered', response_ids: [fixture.responses[0].id], uncovered_questions: [] };
  for (const id of ['cp258-english-normative-conflict', 'cp258-storage-operational-policy-gap', 'heldout-localization']) {
    const item = corpus.items.find(item => item.id === id);
    assert.equal(item.coverage_expectation.status, 'uncovered', id);
    assert.equal(compareCoverageExpectation(item, falselyCovered, { responses: fixture.responses }).passed, false);
  }
  assert.equal(corpus.items.find(item => item.id === 'accepted-repeat').coverage_expectation.status, 'covered');
  assert.equal(corpus.items.find(item => item.id === 'cp258-localization-refused').coverage_expectation.status, 'covered');
});

test('bilingual conflict is grounded in an independent accepted rule, not an unanswered proposal', async () => {
  const conflict = corpus.items.find(item => item.id === 'heldout-localization');
  const refusal = corpus.items.find(item => item.id === 'cp258-localization-refused');
  assert.equal(conflict.question, refusal.question);
  const context = await json(new URL(conflict.context_file, caseRoot));
  const proposed = await json(new URL(refusal.context_file, caseRoot));
  assert.ok(context.accepted_decisions.some(value => value.includes('поддерживать английские подписи наряду с русскими')));
  assert.equal(proposed.accepted_decisions.length, 0);
});

test('compact qualification rejects a missing authored coverage declaration before any native Judge setup', async () => {
  const value = await json(new URL('case.json', caseRoot));
  delete value.hitl_qualification.coverage;
  await assert.rejects(hitlQualificationInputs({ loaded: { root: caseRoot.pathname, value }, runProfile: { value: { interaction_judge: { verdict_contract: hitlCoverageContract } } } }),
    error => error.code === 'definition_qualification_invalid' && /authored coverage corpus/.test(error.message));
});
