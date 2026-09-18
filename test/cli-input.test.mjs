import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtemp, rm, stat } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import test from 'node:test';
import { commandInputs, parse, validateCommand } from '../lib/cli-input.mjs';

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
