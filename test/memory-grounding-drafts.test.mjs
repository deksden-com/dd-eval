import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { commandText } from '../lib/process-json.mjs';
import { assertBlankMemoryProject, prepareE2EInput } from '../lib/runner.mjs';

const fixture = new URL('./fixtures/memory-grounding/', import.meta.url);
const projects = JSON.parse(await readFile(new URL('projects.json', fixture), 'utf8'));
const oracle = JSON.parse(await readFile(new URL('expected-facts.draft.json', fixture), 'utf8'));
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');

for (const [kind, files] of Object.entries(projects)) test(`draft ${kind} grounding sources are exact, runnable and exclude hidden facts`, async t => {
  assert.equal(oracle.status, 'draft_not_accepted'); assert.equal(oracle.qualification, 'none');
  const expected = oracle.projects[kind];
  assert.deepEqual(Object.keys(expected.preserve_sha256).sort(), Object.keys(files).sort());
  for (const [file, bytes] of Object.entries(files)) {
    assert.equal(sha256(bytes), expected.preserve_sha256[file], `Changed authored source: ${file}`);
    assert(!bytes.includes(oracle.hidden_canary));
    assert(!file.includes('.memory-bank') && !file.includes('expected-facts') && !file.includes('assessment'));
  }
  for (const fact of expected.facts) for (const [file, literal] of Object.entries(fact.evidence))
    assert(files[file]?.includes(literal), `Unbound draft fact ${fact.id}: ${file}`);
  const root = await mkdtemp(path.join(os.tmpdir(), `memory-grounding-${kind}-`));
  t.after(() => rm(root, { recursive: true, force: true }));
  const source = path.join(root, 'source'); await mkdir(source);
  for (const [file, bytes] of Object.entries(files)) {
    await mkdir(path.dirname(path.join(source, file)), { recursive: true });
    await writeFile(path.join(source, file), bytes);
  }
  await commandText('git', ['init', '--quiet', '--initial-branch=main'], { cwd: source });
  await commandText('git', ['add', '.'], { cwd: source });
  await commandText('git', ['-c', 'user.name=Fixture', '-c', 'user.email=fixture@localhost', 'commit', '--quiet', '-m', `authored ${kind} fixture`], { cwd: source });
  const commit = await commandText('git', ['rev-parse', 'HEAD'], { cwd: source });
  // Only source files enter the exact Git checkpoint. The draft oracle is not
  // a Subject input, and no artificial source checkpoint becomes an Eval case.
  const inputCheckpoint = { value: { id: `draft-${kind}`, source: { repository: source, commit }, flow_pack: { repository: 'not-used-for-memory-source', delivery: 'installed_canon' } } };
  const result = await prepareE2EInput({ projectRoot: path.join(root, 'subject'), inputCheckpoint, flowId: 'mb-init' });
  await assertBlankMemoryProject(result.project_root);
  assert.equal(await commandText('git', ['rev-parse', 'HEAD'], { cwd: result.project_root }), commit);
  assert.equal(await commandText('git', ['ls-tree', '-r', '--name-only', 'HEAD'], { cwd: result.project_root }), Object.keys(files).sort().join('\n'));
  assert.equal(await commandText('git', ['remote'], { cwd: result.project_root }), '');
  for (const file of Object.keys(files)) assert.equal(sha256(await readFile(path.join(result.project_root, file))), expected.preserve_sha256[file]);
  // Execute actual authored product checks, not a stub mb-lint/provider result.
  const checks = await commandText(process.execPath, ['--test', '--test-reporter=tap'], {
    cwd: result.project_root, env: { NODE_TEST_CONTEXT: undefined }
  });
  assert.match(checks, /tests 1/); assert.match(checks, /fail 0/);
  assert.equal(await commandText('git', ['status', '--porcelain', '--untracked-files=all'], { cwd: result.project_root }), '');
  t.diagnostic(`draft_${kind}: exact_source_and_oracle_exclusion_only; Subject/Judge qualification absent`);
});
