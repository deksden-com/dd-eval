import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { verificationSelection, contractKey } from './verification-policy.mjs';
import { stopProcessGroup } from '../lib/managed-daemon.mjs';

const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const selection = verificationSelection();
const optional = new Set([
  'selected real published engine exports the operational contract',
  'owned launch decision commits only its profile before baseline admission',
  'installed consumer retains actual CP247 legacy refusal without rewriting evidence',
  'installed consumer accepts actual producer failures and rejects retained legacy/foreign proof',
  'actual pinned dd-tasks zero checkpoint materializes blank with exact README bytes',
]);
if (process.argv[2] === 'plan') process.stdout.write(JSON.stringify(selection, null, 2) + '\n');
else {
  if (!['run','rerun'].includes(process.argv[2]) || process.argv[2] === 'rerun' && !process.argv[3]?.trim()) throw new Error('usage: verification.mjs plan | run | rerun <investigated-failure-reason>');
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'dd-eval-scoped-'));
  const cache = process.env.DD_EVAL_VERIFICATION_CACHE_ROOT ?? path.join(os.homedir(), '.dd-eval', 'verification-receipts');
  assert.ok(path.isAbsolute(cache)); fs.mkdirSync(cache, { recursive: true });
  const receipt = { schema_id: 'dd-eval/scoped-verification@1', status: 'running', selection, results: [] };
  const save = () => fs.writeFileSync(path.join(root, 'receipt.json'), JSON.stringify(receipt, null, 2));
  save();
  try {
    for (const file of selection.files) {
      const key = contractKey(file), index = path.join(cache, `${key}.json`);
      let old = fs.existsSync(index) ? JSON.parse(fs.readFileSync(index)) : null;
      if (old && old.status !== 'passed') {
        assert.ok(old.status === 'failed' && process.argv[2] === 'rerun', 'retained contract failed/unknown; investigate before explicit rerun');
        old = null; // Original immutable attempt remains at its recorded path.
      }
      if (old) {
        assert.equal(old.file, file); assert.equal(old.key, key);
        try {
          assert.equal(sha(fs.readFileSync(old.log)), old.log_sha256, 'retained verification report changed');
          receipt.results.push({ ...old, source: 'reused' }); save(); continue;
        } catch (error) { (receipt.invalid_evidence ??= []).push({ file, previous: old.log, reason: String(error.message) }); save(); }
      }
      const logFile = path.join(root, `${receipt.results.length}.tap`);
      const lock = `${index}.lock`;
      fs.mkdirSync(lock);
      fs.writeFileSync(path.join(lock, 'owner.json'), JSON.stringify({ pid: process.pid, report: root }));
      try {
      fs.writeFileSync(index, JSON.stringify({ status: 'running', pid: process.pid, log: logFile }));
      const child = spawn(process.execPath, ['--test', '--test-concurrency=1', '--test-reporter=tap', file], { stdio: ['ignore', 'pipe', 'pipe'], detached: process.platform !== 'win32' });
      let output = '', interrupted = false, cleanupError = null, drain;
      const handler = () => { interrupted = true; drain ??= stopProcessGroup(child, 5000).catch(error => { cleanupError = String(error); }); };
      process.on('SIGINT', handler); process.on('SIGTERM', handler);
      const log = fs.createWriteStream(logFile);
      log.on('error', error => { cleanupError = String(error); handler(); });
      child.stdout.on('data', bytes => { output += bytes; process.stdout.write(bytes); log.write(bytes); });
      child.stderr.on('data', bytes => { process.stderr.write(bytes); log.write(bytes); });
      const result = await new Promise(resolve => {
        child.on('error', error => { cleanupError = String(error); });
        child.on('close', (code, signal) => resolve({ code, signal }));
      });
      await drain;
      await new Promise(resolve => log.end(resolve));
      process.off('SIGINT', handler); process.off('SIGTERM', handler);
      const unexpectedSkip = output.split('\n').filter(line => /^ok \d+ - .* # SKIP/.test(line)).some(line => !optional.has(line.replace(/^ok \d+ - /, '').replace(/ # SKIP.*$/, '')));
      const tests = Number(/^# tests (\d+)$/m.exec(output)?.[1]);
      const observedKey = contractKey(file);
      const passed = result.code === 0 && !result.signal && !interrupted && !cleanupError && !unexpectedSkip && tests > 0
        && /^# fail 0$/m.test(output) && /^# cancelled 0$/m.test(output) && /^# todo 0$/m.test(output) && observedKey === key;
      const record = { file, key, status: passed ? 'passed' : 'failed', tests, skipped: Number(/^# skipped (\d+)$/m.exec(output)?.[1] ?? 0), exit_code: result.code, signal: result.signal, interrupted,
        cleanup_error: cleanupError, input_changed: observedKey !== key, unexpected_skip: unexpectedSkip, log: logFile, log_sha256: sha(fs.readFileSync(logFile)), ...(process.argv[2] === 'rerun' ? { rerun_reason: process.argv[3] } : {}) };
      fs.writeFileSync(index, JSON.stringify(record)); receipt.results.push(record); save();
      assert.ok(passed, `Selected contract failed; inspect ${logFile}`);
      } finally { fs.unlinkSync(path.join(lock, 'owner.json')); fs.rmdirSync(lock); }
    }
    receipt.status = selection.files.length ? 'passed' : 'not_required'; save();
    process.stdout.write(JSON.stringify({ status: receipt.status, report: root, executed: receipt.results.filter(result => result.source !== 'reused').length, reused: receipt.results.filter(result => result.source === 'reused').length }) + '\n');
  } catch (error) { receipt.status = 'failed'; save(); throw error; }
}
