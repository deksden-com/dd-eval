const classifications = new Set(['covered_by_canonical_response', 'fixture_gap', 'ambiguous', 'out_of_scope', 'unnecessary_question']);
const fail = (item, message) => { throw Object.assign(new Error(`HITL corpus ${item.id}: ${message}`), { code: 'hitl_qualification_invalid', details: { item_id: item.id } }); };

export function validateExpectedAtoms(item) {
  if (item.expected_atoms === undefined) {
    if (item.expected_atomizations !== undefined) fail(item, 'alternative atomizations require expected_atoms');
    return;
  }
  if (item.expected_atomizations !== undefined && (!Array.isArray(item.expected_atomizations) || !item.expected_atomizations.length)) fail(item, 'expected_atomizations must be a nonempty array of alternatives');
  for (const atoms of [item.expected_atoms, ...(item.expected_atomizations ?? [])]) {
    if (!Array.isArray(atoms) || !atoms.length) fail(item, 'each expected atomization must be a nonempty array');
    for (const atom of atoms) {
      if (!atom || Object.keys(atom).sort().join(',') !== 'classification,response_ids,source_quotes' ||
          !Array.isArray(atom.source_quotes) || !atom.source_quotes.length ||
          atom.source_quotes.some(quote => typeof quote !== 'string' || !quote.trim() || !item.question.includes(quote)) ||
          new Set(atom.source_quotes).size !== atom.source_quotes.length || !classifications.has(atom.classification) ||
          !Array.isArray(atom.response_ids) || atom.response_ids.some(id => typeof id !== 'string' || !id.trim()) ||
          new Set(atom.response_ids).size !== atom.response_ids.length ||
          (atom.classification === 'covered_by_canonical_response') !== (atom.response_ids.length > 0)) fail(item, 'invalid expected atom');
    }
  }
}

// Finite authored oracle, not a semantic parser. Bipartite matching prevents a
// broad observed atom from satisfying two independent expected decisions.
export function assertExpectedAtoms(item, verdict) {
  validateExpectedAtoms(item);
  if (item.expected_atoms === undefined) return;
  const observed = verdict.atoms;
  const mismatch = () => { throw Object.assign(new Error(`HITL qualification ${item.id}: atom expectations differ`), { code: 'hitl_qualification_failed', details: { item_id: item.id, expected_atoms: item.expected_atoms, expected_atomizations: item.expected_atomizations, observed_atoms: observed ?? null } }); };
  if (!Array.isArray(observed)) mismatch();
  if ([item.expected_atoms, ...(item.expected_atomizations ?? [])].some(expected => matchesAtomization(expected, observed))) return;
  mismatch();
}

function matchesAtomization(expectedAtoms, observed) {
  if (observed.length !== expectedAtoms.length) return false;
  const assigned = new Array(observed.length).fill(-1);
  const matches = (expected, actual) => {
    const ids = [...new Set((actual.answer_evidence ?? []).map(evidence => evidence.response_id))].sort();
    return expected.source_quotes.includes(actual.source_quote) && expected.classification === actual.classification &&
      JSON.stringify([...expected.response_ids].sort()) === JSON.stringify(ids);
  };
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
