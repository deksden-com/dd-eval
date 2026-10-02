import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { validateExpectedAtoms, assertExpectedAtoms } from '../lib/hitl-corpus.mjs';
import { createHash } from 'node:crypto';

const covered = (quote, ids = ['r']) => ({ source_quote: quote, classification: 'covered_by_canonical_response', answer_evidence: ids.map(response_id => ({ response_id, answer_quote: 'answer' })) });
test('targeted atom oracle preserves multiplicity without fixing prose/order', () => {
  const item = { id: 'shared', question: 'A и B?\r\nДа?', expected_atoms: [
    { source_quotes: ['A и B?', 'A'], classification: 'covered_by_canonical_response', response_ids: ['r'] },
    { source_quotes: ['A и B?'], classification: 'covered_by_canonical_response', response_ids: ['s', 'r'] }
  ] };
  assertExpectedAtoms(item, { atoms: [covered('A и B?', ['r', 's']), covered('A и B?')] });
  assert.throws(() => assertExpectedAtoms(item, { atoms: [covered('A и B?')] }), { code: 'hitl_qualification_failed' });
  assert.throws(() => assertExpectedAtoms(item, { atoms: [covered('A и B?'), covered('A и B?')] }), { code: 'hitl_qualification_failed' });
});
test('oracle rejects forged source, classification and response IDs', () => {
  const item = { id: 'ambiguous', question: 'Это?', expected_atoms: [{ source_quotes: ['Это?'], classification: 'ambiguous', response_ids: [] }] };
  assertExpectedAtoms(item, { atoms: [{ source_quote: 'Это?', classification: 'ambiguous', answer_evidence: [] }] });
  assert.throws(() => assertExpectedAtoms(item, { atoms: [covered('Это?')] }));
  assert.throws(() => validateExpectedAtoms({ ...item, expected_atoms: [{ ...item.expected_atoms[0], source_quotes: ['другое'] }] }));
  assertExpectedAtoms({ id: 'untargeted' }, { atoms: [] });
});
test('authored corpus expectations are finite exact source alternatives', async () => {
  const corpus = JSON.parse(await readFile(new URL('../cases/sdlc-eval-2026-summer-task-priority/entry-pack-source/interactions/qualification.json', import.meta.url), 'utf8'));
  for (const item of corpus.items) validateExpectedAtoms(item);
  for (const item of corpus.items) {
    const context = await readFile(new URL('../cases/sdlc-eval-2026-summer-task-priority/' + item.context_file, import.meta.url));
    assert.equal(createHash('sha256').update(context).digest('hex'), item.context_sha256, item.id);
  }
  assert.ok(corpus.items.find(item => item.id === 'ambiguous-reference').expected_atoms);
  assert.ok(corpus.items.find(item => item.id === 'resolved-reference').expected_atoms);
});
test('overlapping allowed quotes use complete matching rather than greedy assignment', () => {
  const item = { id: 'overlap', question: 'A B', expected_atoms: [
    { source_quotes: ['A', 'B'], classification: 'ambiguous', response_ids: [] },
    { source_quotes: ['A'], classification: 'ambiguous', response_ids: [] }
  ] };
  assertExpectedAtoms(item, { atoms: ['A', 'B'].map(source_quote => ({ source_quote, classification: 'ambiguous', answer_evidence: [] })) });
  assert.throws(() => assertExpectedAtoms(item, { atoms: ['B', 'B'].map(source_quote => ({ source_quote, classification: 'ambiguous', answer_evidence: [] })) }));
});
