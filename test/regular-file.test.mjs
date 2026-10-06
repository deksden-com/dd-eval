import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { promisify } from 'node:util';
import { execFile } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { readRegularFile, readRegularFileSync } from '../lib/regular-file.mjs';

test('shared retained reader preserves bytes and rejects directories/FIFO without waiting', async t => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'regular-reader-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const file = path.join(root, 'bytes'); const bytes = Buffer.from('\ufeffUnicode 👋\r\n');
  await writeFile(file, bytes);
  assert.deepEqual(await readRegularFile(file), bytes); assert.deepEqual(readRegularFileSync(file), bytes);
  const nonregular = [root];
  if (process.platform !== 'win32') {
    const fifo = path.join(root, 'fifo'); await promisify(execFile)('mkfifo', [fifo]); nonregular.push(fifo);
  }
  for (const target of nonregular) {
    await assert.rejects(readRegularFile(target), { code: 'input_file_not_regular' });
    assert.throws(() => readRegularFileSync(target), { code: 'input_file_not_regular' });
  }
});
