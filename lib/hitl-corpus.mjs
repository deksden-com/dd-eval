import { projectHitlAtoms, hitlCoverageContract } from './hitl-contract.mjs';

export function validateCoverageExpectation(item, { responses }) {
  const expected = item.coverage_expectation;
  if (!keys(expected, ['status', 'response_ids', 'remaining_decisions']) || !['covered', 'uncovered', 'ambiguous'].includes(expected.status)
    || !idsValid(expected.response_ids) || expected.response_ids.some(id => !responses.some(response => response.id === id))
    || !Array.isArray(expected.remaining_decisions) || expected.remaining_decisions.some(decision => !keys(decision, ['id', 'description']) || !nonempty(decision.id) || !nonempty(decision.description))
    || new Set(expected.remaining_decisions.map(decision => decision.id)).size !== expected.remaining_decisions.length
    || (expected.status === 'covered' ? !expected.response_ids.length || expected.remaining_decisions.length : expected.response_ids.length || !expected.remaining_decisions.length)) fail(item, 'invalid compact coverage expectation');
  return expected;
}

/** Status/IDs are mechanical; only a bound adjudication establishes semantic completeness. */
export function compareCoverageExpectation(item, observed, { responses, review = null } = {}) {
  const expected = validateCoverageExpectation(item, { responses });
  const shapePassed = observed.schema_id === hitlCoverageContract && observed.status === expected.status && sameIds(observed.response_ids, expected.response_ids);
  const needsReview = expected.status !== 'covered';
  const reviewed = !needsReview || review?.complete === true && review?.covered_remaining_ids?.length === expected.remaining_decisions.length
    && sameIds(review.covered_remaining_ids, expected.remaining_decisions.map(decision => decision.id));
  return { passed: shapePassed && reviewed, shape_passed: shapePassed, semantic_review_required: needsReview && !reviewed,
    mismatch_kind: !shapePassed ? 'coverage_status_or_ids' : !reviewed ? 'coverage_review_required' : null };
}

const covered = 'covered_by_canonical_response';
const classifications = new Set([covered, 'fixture_gap', 'ambiguous', 'out_of_scope', 'unnecessary_question']);
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const nonempty = value => typeof value === 'string' && Boolean(value.trim());
const keys = (value, expected) => object(value) && Object.keys(value).sort().join(',') === [...expected].sort().join(',');
const sameIds = (a, b) => JSON.stringify([...a].sort()) === JSON.stringify([...b].sort());
// Quote boundaries may omit sentence punctuation; content bytes stay exact.
const quoteContent = quote => quote.replace(/[?!.]+$/u, '');
function containsQuote(text, quote) {
  const part = quoteContent(quote), content = quoteContent(text);
  if (!part) return false;
  const word = char => /[\p{L}\p{N}_]/u.test(char ?? '');
  for (let at = content.indexOf(part); at !== -1; at = content.indexOf(part, at + 1)) {
    if (!(word(part[0]) && word(content[at - 1])) &&
        !(word(part.at(-1)) && word(content[at + part.length]))) return true;
  }
  return false;
}
const expectedStatus = item => item.status ?? (item.classification === covered ? 'matched' : 'unmatched');
const fail = (item, message) => { throw Object.assign(new Error(`HITL corpus ${item.id}: ${message}`), { code: 'hitl_qualification_invalid', details: { item_id: item.id } }); };
const idsValid = ids => Array.isArray(ids) && ids.every(nonempty) && new Set(ids).size === ids.length;
function expectedAtom(atom) {
  return { classification: atom.classification, source_quote: '', rationale: '', answer_evidence: atom.response_ids.map(response_id => ({ response_id })) };
}
function responseOrder(item, responses) {
  return responses ?? item.response_ids.map(id => ({ id }));
}
function assertProjection(item, atoms, responses) {
  const result = projectHitlAtoms(atoms.map(expectedAtom), responseOrder(item, responses));
  if (result.classification !== item.classification || result.status !== expectedStatus(item) || JSON.stringify(result.response_ids) !== JSON.stringify(item.response_ids)) fail(item, 'expected decisions contradict item summary');
}

export function validateExpectedAtoms(item, { responses, coverageRequired = false, historical = false } = {}) {
  if (!object(item) || !nonempty(item.id) || !nonempty(item.question) || !classifications.has(item.classification) ||
      !idsValid(item.response_ids) || (!['matched', 'unmatched'].includes(item.status) && !(historical && item.expected_coverage === undefined && item.status === undefined)) ||
      (item.classification === covered) !== (expectedStatus(item) === 'matched') ||
      (expectedStatus(item) === 'matched' && item.response_ids.length === 0)) fail(item ?? {}, 'invalid expectation summary');
  if (typeof coverageRequired !== 'boolean') fail(item, 'coverageRequired must be boolean');
  if (responses !== undefined && (!Array.isArray(responses) || responses.some(response => !object(response) || !nonempty(response.id)) ||
      new Set(responses.map(response => response.id)).size !== responses.length)) fail(item, 'invalid stage response IDs');
  const known = responses === undefined ? null : new Set(responses.map(response => response.id));
  const validIds = (classification, ids) => idsValid(ids) && (classification === covered) === (ids.length > 0) && (!known || ids.every(id => known.has(id)));
  // Unmatched summaries retain IDs of covered atoms, unlike individual atoms.
  if (known && item.response_ids.some(id => !known.has(id))) fail(item, 'unknown summary response ID');
  const validateAtom = atom => {
    if (!classifications.has(atom.classification) || !validIds(atom.classification, atom.response_ids)) fail(item, 'invalid expected decision classification/response IDs');
  };
  const quotesValid = quotes => Array.isArray(quotes) && quotes.length > 0 && quotes.every(quote => nonempty(quote) && item.question.includes(quote)) && new Set(quotes).size === quotes.length;
  if (item.expected_coverage !== undefined) {
    if (item.expected_atoms !== undefined || item.expected_atomizations !== undefined) fail(item, 'coverage and legacy atomizations are mutually exclusive');
    const coverage = item.expected_coverage;
    if (!keys(coverage, ['obligations', 'witnesses']) || !Array.isArray(coverage.obligations) || !coverage.obligations.length || !Array.isArray(coverage.witnesses) || !coverage.witnesses.length) fail(item, 'invalid expected_coverage');
    const obligations = new Map(), witnesses = new Map();
    for (const obligation of coverage.obligations) {
      if (!keys(obligation, ['id', 'classification', 'response_ids', 'witness_ids', ...(obligation?.answer_evidence === undefined ? [] : ['answer_evidence'])]) || !nonempty(obligation.id) || obligations.has(obligation.id) || !idsValid(obligation.witness_ids) || !obligation.witness_ids.length) fail(item, 'invalid coverage obligation');
      validateAtom(obligation);
      if (obligation.answer_evidence !== undefined) {
        if (obligation.classification !== covered || !Array.isArray(obligation.answer_evidence) || !obligation.answer_evidence.length ||
            obligation.answer_evidence.some(evidence => !keys(evidence, ['response_id', 'answer_quote']) || !nonempty(evidence.answer_quote) ||
              !obligation.response_ids.includes(evidence.response_id) || typeof responses?.find(response => response.id === evidence.response_id)?.answer !== 'string' ||
              !responses.find(response => response.id === evidence.response_id).answer.includes(evidence.answer_quote)) ||
            new Set(obligation.answer_evidence.map(evidence => JSON.stringify([evidence.response_id, evidence.answer_quote]))).size !== obligation.answer_evidence.length) fail(item, 'invalid coverage answer evidence');
      }
      obligations.set(obligation.id, obligation);
    }
    for (const witness of coverage.witnesses) {
      if (!keys(witness, ['id', 'source_quotes', 'classification', 'response_ids']) || !nonempty(witness.id) || witnesses.has(witness.id) || !quotesValid(witness.source_quotes)) fail(item, 'invalid coverage witness');
      validateAtom(witness); witnesses.set(witness.id, witness);
    }
    for (const obligation of obligations.values()) for (const id of obligation.witness_ids) if (!witnesses.has(id)) fail(item, 'unknown coverage witness');
    for (const witness of witnesses.values()) {
      const linked = [...obligations.values()].filter(obligation => obligation.witness_ids.includes(witness.id));
      if (!linked.length || linked.some(obligation => obligation.classification !== witness.classification) ||
          !sameIds([...new Set(linked.flatMap(obligation => obligation.response_ids))], witness.response_ids)) fail(item, 'witness must match linked obligation class and exact response ID union');
    }
    const all = [...witnesses.values()];
    for (let i = 0; i < all.length; i++) for (let j = 0; j < i; j++) {
      if (all[i].classification === all[j].classification && sameIds(all[i].response_ids, all[j].response_ids) && all[i].source_quotes.some(quote => all[j].source_quotes.some(other => quoteContent(quote) === quoteContent(other)))) fail(item, 'coverage witness signature collision');
    }
    assertProjection(item, [...obligations.values()], responses);
    return;
  }
  if (coverageRequired) fail(item, 'current corpus requires expected_coverage');
  if (!historical) fail(item, 'legacy oracle requires explicit historical reading');
  if (item.expected_atoms === undefined) {
    if (item.expected_atomizations !== undefined) fail(item, 'alternative atomizations require expected_atoms');
    return;
  }
  if (item.expected_atomizations !== undefined && (!Array.isArray(item.expected_atomizations) || !item.expected_atomizations.length)) fail(item, 'expected_atomizations must be nonempty');
  for (const atoms of [item.expected_atoms, ...(item.expected_atomizations ?? [])]) {
    if (!Array.isArray(atoms) || !atoms.length) fail(item, 'expected atomization must be nonempty');
    for (const atom of atoms) {
      if (!keys(atom, ['source_quotes', 'classification', 'response_ids']) || !quotesValid(atom.source_quotes)) fail(item, 'invalid expected atom');
      validateAtom(atom);
    }
    assertProjection(item, atoms, responses);
  }
}

// ponytail: finite authored quote anchors check coverage, not free-text entailment;
// model semantics remain a separately retained native acceptance gate.
export function compareHitlExpectation(item, verdict, options = {}) {
  validateExpectedAtoms(item, options);
  const observedAtoms = Array.isArray(verdict?.atoms) ? verdict.atoms : [];
  const projected = observedAtoms.length ? projectHitlAtoms(observedAtoms, responseOrder(item, options.responses)) : verdict ?? {};
  const expected = { status: expectedStatus(item), classification: item.classification, response_ids: item.response_ids };
  const observed = { status: projected.status, classification: projected.classification, response_ids: projected.response_ids ?? [] };
  let missing = [], extra = [];
  if (item.expected_coverage) {
    const observedWitnesses = new Map();
    observedAtoms.forEach((atom, index) => {
      const witnesses = typeof atom.source_quote === 'string' && atom.source_quote && item.question.includes(atom.source_quote)
        ? item.expected_coverage.witnesses.filter(witness => witness.source_quotes.some(quote => containsQuote(atom.source_quote, quote))) : [];
      // A bundle must cover ALL included anchors with their class and exact ID union.
      // Never hide a gap/extra-scope decision inside a longer covered quote.
      if (witnesses.length && witnesses.every(witness => witness.classification === atom.classification) &&
          sameIds([...new Set(witnesses.flatMap(witness => witness.response_ids))], [...new Set((atom.answer_evidence ?? []).map(entry => entry.response_id))])) {
        for (const witness of witnesses) {
          if (!observedWitnesses.has(witness.id)) observedWitnesses.set(witness.id, []);
          observedWitnesses.get(witness.id).push(atom);
        }
      }
      else extra.push({ index, source_quote: atom.source_quote, classification: atom.classification, response_ids: [...new Set((atom.answer_evidence ?? []).map(entry => entry.response_id))] });
    });
    missing = item.expected_coverage.obligations.filter(obligation => !obligation.witness_ids.some(id =>
      observedWitnesses.get(id)?.some(atom => (obligation.answer_evidence ?? []).every(required =>
        atom.answer_evidence?.some(evidence => evidence.response_id === required.response_id && typeof evidence.answer_quote === 'string' && containsQuote(evidence.answer_quote, required.answer_quote))))))
      .map(obligation => obligation.id);
  } else if (item.expected_atoms && ![item.expected_atoms, ...(item.expected_atomizations ?? [])].some(atoms => matchesAtomization(atoms, observedAtoms))) missing = ['legacy_atomization'];
  const storedMismatch = observedAtoms.length && ['status', 'classification', 'response_ids'].some(key => verdict[key] !== undefined &&
    (key === 'response_ids' ? JSON.stringify(verdict[key]) !== JSON.stringify(observed[key]) : verdict[key] !== observed[key]));
  const mismatch = extra.length ? 'extra_atoms' : missing.length ? 'coverage' : storedMismatch ? 'projection' :
    expected.classification !== observed.classification || expected.status !== observed.status ? 'classification' :
    JSON.stringify(expected.response_ids) !== JSON.stringify(observed.response_ids) ? 'response_ids' : null;
  return { passed: mismatch === null, mismatch_kind: mismatch, missing_obligation_ids: missing, extra_atoms: extra, expected, observed };
}

export function assertExpectedAtoms(item, verdict, options = {}) {
  const comparison = compareHitlExpectation(item, verdict, options);
  if (!comparison.passed) throw Object.assign(new Error(`HITL qualification ${item.id}: authored expectation differs (${comparison.mismatch_kind})`), { code: 'hitl_qualification_failed', details: { item_id: item.id, ...comparison } });
  return comparison;
}

function matchesAtomization(expectedAtoms, observed) {
  if (observed.length !== expectedAtoms.length) return false;
  const assigned = new Array(observed.length).fill(-1);
  const matches = (expected, actual) => expected.source_quotes.includes(actual.source_quote) && expected.classification === actual.classification &&
    sameIds(expected.response_ids, [...new Set((actual.answer_evidence ?? []).map(evidence => evidence.response_id))]);
  function place(index, seen) {
    for (let j = 0; j < observed.length; j++) {
      if (seen.has(j) || !matches(expectedAtoms[index], observed[j])) continue;
      seen.add(j);
      if (assigned[j] === -1 || place(assigned[j], seen)) { assigned[j] = index; return true; }
    }
    return false;
  }
  for (let i = 0; i < expectedAtoms.length; i++) if (!place(i, new Set())) return false;
  return true;
}
