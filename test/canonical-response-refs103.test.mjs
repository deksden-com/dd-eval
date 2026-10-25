import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm, readFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { validateCanonicalResponseRefs } from '../lib/canonical-response-refs.mjs';

test('own canonical references resolve without copying or issuing an answer', async () => {
  for (const name of ['task-priority', 'recovery']) {
    const root = path.resolve(`cases/sdlc-eval-2026-summer-${name}`);
    const assessment = JSON.parse(await readFile(path.join(root, 'assessment.json')));
    assert.equal(await validateCanonicalResponseRefs(root, assessment), assessment);
    assert.doesNotMatch(JSON.stringify(assessment), /exact No priority, Low/);
  }
  const root = await mkdtemp(path.join(os.tmpdir(), 'canonical-ref-'));
  try {
    await mkdir(path.join(root, 'entry-pack-source/interactions'), { recursive: true });
    const file = path.join(root, 'entry-pack-source/interactions/specify.json');
    await writeFile(file, JSON.stringify({ stage: 'specify', responses: [{ id: 'ok', answer: 'expected, not issued' }] }));
    const ref = { stage: 'specify', response_id: 'ok', purpose: 'vocabulary' };
    await assert.rejects(validateCanonicalResponseRefs(root, { canonical_response_refs: [ref] }, ['preflight']), { code: 'canonical_response_ref_invalid' });
    for (const refs of [[{ ...ref, stage: '../foreign' }], [{ ...ref, response_id: 'missing' }], [ref, ref], [{ ...ref, path: '/foreign' }]]) {
      await assert.rejects(validateCanonicalResponseRefs(root, { canonical_response_refs: refs }), { code: 'canonical_response_ref_invalid' });
    }
    await writeFile(file, JSON.stringify({ stage: 'specify', responses: [{ id: 'ok', answer: 'a' }, { id: 'ok', answer: 'b' }] }));
    await assert.rejects(validateCanonicalResponseRefs(root, { canonical_response_refs: [ref] }));
    for (const malformed of [null, {stage:'specify',responses:[null]}, {stage:'specify',responses:[{}]}]) {
      await writeFile(file,JSON.stringify(malformed));
      await assert.rejects(validateCanonicalResponseRefs(root,{canonical_response_refs:[ref]}),{code:'canonical_response_ref_invalid'});
    }
  } finally { await rm(root, { recursive: true, force: true }); }
});
