import test from 'node:test';
import assert from 'node:assert/strict';
import { interactiveInputKind, initialFlowBoundary, authorizeHitl, interactionFixtureManifest, readJson } from '../lib/runner.mjs';
import * as fixtures from '../lib/hitl/interaction-fixtures.mjs';
import { readJson as readJsonFile } from '../lib/json-file.mjs';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';

test('runner preserves fixture and JSON exports', async () => {
  assert.equal(interactiveInputKind, fixtures.interactiveInputKind);
  assert.equal(authorizeHitl, fixtures.authorizeHitl);
  assert.equal(interactionFixtureManifest, fixtures.interactionFixtureManifest);
  assert.equal(readJson, readJsonFile);
  const root = await mkdtemp(path.join(os.tmpdir(), 'dd-eval-json-'));
  try {
    const file = path.join(root, 'broken.json');
    await writeFile(file, '{');
    await assert.rejects(readJson(file), { code: 'invalid_json', message: `Invalid JSON: ${file}` });
    await assert.rejects(readJson(root), { code: 'input_file_not_regular' });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

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
