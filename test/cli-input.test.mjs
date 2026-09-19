import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, rm, stat, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import test from 'node:test';
import { commandInputs, parse, resolveEvalReference, validateCommand } from '../lib/cli-input.mjs';

const run = promisify(execFile);
const cli = path.resolve(import.meta.dirname, '../bin/dd-eval.mjs');
for (const [name, [arity, allowed]] of Object.entries(commandInputs)) {
  test(`CLI syntax inventory: ${name}`, async () => {
    const command = name.split(' '), option = allowed[0] ?? 'unknown';
    assert.equal(command.length, arity);
    assert.doesNotThrow(() => validateCommand(parse([...command, ...allowed.flatMap(key => [`--${key}`, 'value'])])));
    for (const args of [[...command, 'unexpected'], command.slice(0, -1), [...command, '--unknown', 'value'], [...command, '--__proto__', 'value'], [...command, '--constructor', 'value']]) {
      assert.throws(() => validateCommand(parse(args)), { code: 'usage' });
    }
    assert.throws(() => parse([...command, `--${option}`]), { code: 'usage' });
    assert.throws(() => parse([...command, `--${option}`, '--another']), { code: 'usage' });
    assert.throws(() => parse([...command, `--${option}`, 'one', `--${option}`, 'two']), { code: 'usage' });
    const root = await mkdtemp(path.join(os.tmpdir(), 'eval-cli-inventory-'));
    try {
      await assert.rejects(run(process.execPath, [cli, ...command, '--__proto__', 'value'], {
        env: { ...process.env, HOME: root, DD_EVAL_HOME: path.join(root, 'eval'), DD_FLOW_HOME: path.join(root, 'flow') }
      }), error => error.code === 2 && JSON.parse(error.stderr).code === 'usage');
      for (const home of ['.dd-eval', 'eval', 'flow']) await assert.rejects(stat(path.join(root, home)), { code: 'ENOENT' });
    } finally { await rm(root, { recursive: true, force: true }); }
  });
}

test('EVAL references resolve only inside the selected home or bound context', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'eval-cli-reference-'));
  const home = path.join(root, 'home'), runId = 'EVAL-20260919123456-deadbeef', run = path.join(home, 'runs', runId);
  try {
    await mkdir(run, { recursive: true });
    await writeFile(path.join(run, 'manifest.json'), JSON.stringify({ schema_id: 'dd-eval/runner-manifest@1', run_id: runId }));
    assert.equal(resolveEvalReference(runId, { DD_EVAL_HOME: home }), run);
    assert.equal(resolveEvalReference('@eval', { DD_EVAL_HOME: home, DD_EVAL_RUN_ID: runId }), run);
    assert.equal(resolveEvalReference('@eval', { DD_EVAL_HOME: home, DD_EVAL_CURRENT: run }), run);
    assert.throws(() => resolveEvalReference('@eval', { DD_EVAL_HOME: home, DD_EVAL_CURRENT: run, DD_EVAL_RUN_ID: 'EVAL-other' }), { code: 'usage' });
    assert.throws(() => resolveEvalReference('@eval', { DD_EVAL_HOME: home }), { code: 'usage' });
    const foreign = 'EVAL-20260919123456-foreign';
    await mkdir(path.join(home, 'runs', foreign), { recursive: true });
    await writeFile(path.join(home, 'runs', foreign, 'manifest.json'), JSON.stringify({ run_id: runId }));
    assert.throws(() => resolveEvalReference(foreign, { DD_EVAL_HOME: home }), { code: 'usage' });
  } finally { await rm(root, { recursive: true, force: true }); }
});
