import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { assertRetainedPackCompatibility } from '../lib/pack-component-fingerprint.mjs';

const cli = process.env.DD_T04_CLI_ROOT, canon = process.env.DD_T04_CANON_ROOT;
const enabled = cli && canon && process.env.DD_T04_CLI_SHA && process.env.DD_T04_CANON_SHA;
const sha = bytes => createHash('sha256').update(bytes).digest('hex');

test('CLI retained PLAN component scope agrees with eval across real canon changes', { skip: !enabled }, async t => {
  const head = root => execFileSync('git', ['-C', root, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
  assert.equal(head(cli), process.env.DD_T04_CLI_SHA);
  assert.equal(head(canon), process.env.DD_T04_CANON_SHA);
  const build = JSON.parse(await readFile(path.join(cli, 'dist/build-info.json')));
  assert.equal(build.built_with_canon.commit, process.env.DD_T04_CANON_SHA);
  const { FlowPackBundle } = await import(pathToFileURL(path.join(cli, 'dist/services/flow-pack-bundle.js')));
  const { packReadonlyCapabilities } = await import(pathToFileURL(path.join(cli, 'dist/services/pack-readonly-capabilities.js')));
  const root = await mkdtemp(path.join(os.tmpdir(), 'dd-t04-cli-eval-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const flow = path.join(canon, '.memory-bank/dd-flow'), blobs = new Map();
  async function collect(relative) {
    for (const entry of await readdir(path.join(flow, relative), { withFileTypes: true })) {
      const name = `${relative}/${entry.name}`;
      if (entry.isDirectory()) await collect(name);
      else if (entry.isFile()) blobs.set(name, await readFile(path.join(flow, name)));
      else throw new Error(`Unsupported canon entry: ${name}`);
    }
  }
  await collect('schemas');
  for (const name of await readdir(path.join(flow, 'vnext/plugins'))) {
    if (name.startsWith('plan') && name.endsWith('.mjs')) blobs.set(`vnext/plugins/${name}`, await readFile(path.join(flow, 'vnext/plugins', name)));
  }
  blobs.set('vnext/plan.md', await readFile(path.join(flow, 'vnext/plan.md')));
  const stage = { id: 'plan', directory: '03-plan', module: 'vnext/plugins/plan.mjs', instruction: 'vnext/plan.md',
    result_schema: 'schemas/protocol-plan-result.schema.json', prerequisites: [], outcomes: ['done'],
    commands: { start: { description: 'Start', args_schema: null }, finish: { description: 'Finish', args_schema: 'schemas/protocol-plan-result.schema.json' } } };
  blobs.set('fixture-descriptor.json', Buffer.from(JSON.stringify({ schema_id: 'dd-flow/flow-pack-descriptor@1', api_version: 'dd-flow/flow-plugin@1', id: 'mb-sdlc', version: 'fixture', entry: 'plan',
    state_schema: 'schemas/sdlc-flow-state.schema.json', initial_state: 'schemas/examples/sdlc-flow-state-initial.json', stages: [stage], terminals: ['done'], edges: [{ from: 'plan', on: 'done', to: 'done', kind: 'next' }] })));
  const engine = { checksum: 'a'.repeat(64), version: '1', manifestSha256: 'b'.repeat(64), supports_contracts: { engine: ['dd-flow/flow-plugin@1', 'dd-flow/flow-pack-descriptor@1', 'dd-flow/flow-pack-bundle@1'] } };
  const make = (files, location) => {
    const bundle = FlowPackBundle.prepare({ project_commit: 'c'.repeat(40), canon_commit: process.env.DD_T04_CANON_SHA, blobs: files }, 'fixture-descriptor.json', engine);
    bundle.materialize(location);
    return bundle;
  };
  const source = path.join(root, 'source'), original = make(blobs, source);
  const scope = packReadonlyCapabilities({ bundle: original, workspaceRoot: root, stopTarget: 'merge_completed' }).componentInputs(['plan']);
  const digest = sha(JSON.stringify(scope));
  const participants = new Set(scope.files.map(item => item.path));
  const used = ['vnext/plugins/plan.mjs', 'vnext/plugins/plan-inputs.mjs', 'schemas/protocol-plan-result.schema.json', 'schemas/protocol-plan.schema.json'];
  for (const name of used) assert.ok(participants.has(name), `${name} must be in actual CLI closure`);
  const independent = 'vnext/plugins/plan-review.mjs';
  assert.ok(blobs.has(independent) && !participants.has(independent));
  let index = 0;
  for (const name of [independent, ...used]) {
    const changed = new Map(blobs), suffix = name.endsWith('.mjs') ? '\n// changed\n' : '\n';
    changed.set(name, Buffer.concat([changed.get(name), Buffer.from(suffix)]));
    const target = path.join(root, `target-${index++}`), candidate = make(changed, target);
    const comparison = assertRetainedPackCompatibility({ sourceRoot: source, sourceManifestSha256: original.packSha256,
      targetRoot: target, targetManifestSha256: candidate.packSha256, scope, scopeSha256: digest });
    if (name === independent) assert.equal(await comparison, digest);
    else await assert.rejects(comparison, /Pack component inputs changed/, name);
  }
});
