import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const cli = process.env.DD_EVAL_TEST_RECOVERY_CLI_ROOT;
test('automatic Work checkpoint uses the pinned real CLI consumer', { skip: !cli, timeout: 600_000 }, async () => {
  const child = spawn(process.execPath, [path.join(cli, 'node_modules/vitest/vitest.mjs'), 'run', '--config',
    fileURLToPath(new URL('./fixtures/recovery-work-cli.config.mjs', import.meta.url))], {
    cwd: cli, env: { ...process.env, DD_EVAL_TEST_RECOVERY_CLI_ROOT: cli }, stdio: 'inherit'
  });
  const outcome = await new Promise((resolve, reject) => { child.once('error', reject); child.once('exit', (code, signal) => resolve({ code, signal })); });
  assert.deepEqual(outcome, { code: 0, signal: null });
});
