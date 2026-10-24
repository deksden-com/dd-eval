import test from 'node:test';
import assert from 'node:assert/strict';
import { interactiveInputKind, initialFlowBoundary } from '../lib/runner.mjs';

test('interactive finish authority comes only from explicitly matched canonical metadata', () => {
  const fixture = { responses: [
    { id: 'more', input_kind: 'turn', answer: 'The word finish here is not a command.' },
    { id: 'finish', input_kind: 'finish', answer: 'Proceed with the agreed completion.' },
    { id: 'legacy', answer: 'Finish now.' }
  ] };
  assert.equal(interactiveInputKind(fixture, ['more']), 'turn');
  assert.equal(interactiveInputKind(fixture, ['finish']), 'finish');
  for (const ids of [[], ['unknown'], ['legacy'], ['more', 'finish'], ['finish', 'finish'], null])
    assert.throws(() => interactiveInputKind(fixture, ids), { code: 'interactive_input_kind_invalid' });
});

test('interactive case has a preflight bootstrap and never silently becomes SDLC', () => {
  const loaded = contour => ({ value: { flow: { id: 'interactive', contour } } });
  assert.deepEqual(initialFlowBoundary(loaded(['preflight', 'interactive', 'consolidation', 'hardening', 'review', 'integration'])), { flow: 'interactive', stage: 'preflight' });
  assert.throws(() => initialFlowBoundary(loaded(['interactive', 'review', 'integration'])), { code: 'initial_flow_boundary_invalid' });
});
