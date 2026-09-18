import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { commandText } from '../lib/process-json.mjs';
import { prepareCanonicalFlowSource } from '../lib/runner.mjs';

test('canonical flow source is checked without materializing input', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'canonical-source-'));
  const pack = path.join(root, '.memory-bank', 'dd-flow');
  const git = args => commandText('git', args, { cwd: root });
  const commit = async () => {
    await git(['add', '.']);
    await git(['-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.test', 'commit', '--quiet', '-m', 'fixture']);
    return git(['rev-parse', 'HEAD']);
  };
  const checkpoint = { value: { id: 'fixture', flow_pack: { path: '.memory-bank/dd-flow', memory_bank_version: '1' } } };
  try {
    await assert.rejects(prepareCanonicalFlowSource(null, checkpoint), { code: 'canonical_flow_source_required' });
    await mkdir(pack, { recursive: true });
    await git(['init', '--quiet']);
    await writeFile(path.join(pack, 'manifest.json'), '{}');
    checkpoint.value.flow_pack.commit = await commit();
    const before = await readdir(root);
    await assert.rejects(prepareCanonicalFlowSource(root, checkpoint), { code: 'input_checkpoint_flow_pack_invalid' });
    assert.deepEqual(await readdir(root), before);
    await writeFile(path.join(pack, 'manifest.json'), JSON.stringify({ schema_id: 'dd-flow/project-flow-pack-manifest@2', pack_version: '1', canon_version_at_source_commit: '1', included_files: ['project-execution.json', 'project-workspace.json'] }));
    await writeFile(path.join(pack, 'project-execution.json'), JSON.stringify({ schema_id: 'dd-flow/project-execution@2' }));
    await writeFile(path.join(pack, 'project-workspace.json'), JSON.stringify({ schema_id: 'dd-flow/project-workspace@1' }));
    checkpoint.value.flow_pack.commit = await commit();
    assert.deepEqual(await prepareCanonicalFlowSource(root, checkpoint), { flowRoot: root, flowHead: checkpoint.value.flow_pack.commit, sourceFlow: pack });
    assert.deepEqual(await readdir(root), before);
    assert.equal(await git(['status', '--porcelain']), '');
    await writeFile(path.join(pack, 'untracked'), 'dirty');
    await assert.rejects(prepareCanonicalFlowSource(root, checkpoint), { code: 'input_checkpoint_flow_mismatch' });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
