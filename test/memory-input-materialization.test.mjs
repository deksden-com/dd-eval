import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile, rm, symlink } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { commandText } from '../lib/process-json.mjs';
import { assertBlankMemoryProject, materializeCanonicalInput, prepareCanonicalFlowSource, prepareE2EInput } from '../lib/runner.mjs';

test('Memory canonical and E2E materialization preserve blank product bytes without a flow overlay', async t => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'memory-input-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const product = path.join(root, 'product'), canon = path.join(root, 'canon');
  const commit = async directory => {
    await commandText('git', ['init', '--quiet', '--initial-branch=main'], { cwd: directory });
    await commandText('git', ['add', '.'], { cwd: directory });
    await commandText('git', ['-c', 'user.name=Fixture', '-c', 'user.email=fixture@localhost', 'commit', '--quiet', '-m', 'fixture'], { cwd: directory });
    return commandText('git', ['rev-parse', 'HEAD'], { cwd: directory });
  };
  await mkdir(product); await writeFile(path.join(product, 'README.md'), 'Product facts.\r\n');
  await writeFile(path.join(product, '.gitattributes'), '* -text\n');
  const sourceCommit = await commit(product);
  const flowPath = '.memory-bank/dd-flow';
  await mkdir(path.join(canon, flowPath, 'mb-init'), { recursive: true });
  await writeFile(path.join(canon, flowPath, 'mb-init/flow-descriptor.json'), JSON.stringify({ schema_id: 'dd-flow/flow-descriptor@1', id: 'mb-init', origin: 'canon' }));
  const flowCommit = await commit(canon);
  const checkpoint = { value: { id: 'memory-fixture', source: { repository: product, commit: sourceCommit }, flow_pack: { repository: canon, commit: flowCommit, path: flowPath, delivery: 'installed_canon' } } };
  const flowSource = await prepareCanonicalFlowSource(canon, checkpoint, 'mb-init');
  const output = path.join(root, 'canonical'); await mkdir(output);
  const integrationBranch = 'fixture/integration';
  const canonical = await materializeCanonicalInput({ root: output, sourceProjectRoot: product, flowSource, inputCheckpoint: checkpoint, flowId: 'mb-init', integrationBranch });
  assert.equal(canonical.source_commit, sourceCommit); assert.equal(canonical.materialized_commit, sourceCommit);
  assert.equal(canonical.flow_delivery, 'installed_canon');
  assert.equal(canonical.branch, integrationBranch);
  const e2e = await prepareE2EInput({ projectRoot: path.join(root, 'e2e'), inputCheckpoint: checkpoint, flowId: 'mb-init', integrationBranch });
  for (const directory of [canonical.project_root, e2e.project_root]) assert.equal(await commandText('git', ['branch', '--show-current'], { cwd: directory }), integrationBranch);
  for (const directory of [product, canonical.project_root, e2e.project_root]) {
    await assertBlankMemoryProject(directory);
    assert.equal(await readFile(path.join(directory, 'README.md'), 'utf8'), 'Product facts.\r\n');
    assert.equal(await commandText('git', ['rev-parse', 'HEAD'], { cwd: directory }), sourceCommit);
    assert.equal(await commandText('git', ['status', '--porcelain'], { cwd: directory }), '');
  }
  await assert.rejects(prepareE2EInput({ projectRoot: path.join(root, 'wrong-mode'), inputCheckpoint: checkpoint }), { code: 'input_checkpoint_flow_pack_invalid' });
  await assert.rejects(readFile(path.join(root, 'wrong-mode/.git/HEAD')), { code: 'ENOENT' });
  await assert.rejects(prepareCanonicalFlowSource(canon, checkpoint), { code: 'input_checkpoint_flow_pack_invalid' });
  for (const kind of ['file', 'directory', 'symlink']) {
    const bank = path.join(product, '.memory-bank');
    if (kind === 'file') await writeFile(bank, 'existing');
    else if (kind === 'directory') await mkdir(bank);
    else await symlink(path.join(root, 'absent'), bank);
    await assert.rejects(assertBlankMemoryProject(product), { code: 'input_checkpoint_memory_not_blank' });
    await assert.rejects(materializeCanonicalInput({ root: output, sourceProjectRoot: product, flowSource, inputCheckpoint: checkpoint, flowId: 'mb-init' }), { code: 'input_checkpoint_memory_not_blank' });
    await rm(bank, { recursive: true });
  }
});
