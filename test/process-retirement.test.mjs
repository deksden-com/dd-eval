import test from 'node:test';
import assert from 'node:assert/strict';
import childProcess from 'node:child_process';
import { processRetired } from '../lib/process-snapshot.mjs';

test('retirement uses OS birth after frozen shutdown, never PID existence alone', t => {
  const calls = [];
  t.mock.method(process, 'kill', (pid, signal) => { assert.equal(signal, 0); calls.push(pid); });
  const ps = t.mock.method(childProcess, 'execFileSync', (bin, args, options) => {
    assert.equal(bin, 'ps'); assert.deepEqual(args, ['-p', '123', '-o', 'lstart=']);
    assert.equal(options.env.TZ, 'UTC'); assert.equal(options.env.LC_ALL, 'C');
    return 'Wed Oct 7 14:00:00 2026\n';
  });
  assert.equal(processRetired(123, '2026-10-06T19:22:20.605Z'), true);
  assert.equal(processRetired(123, '2026-10-07T14:00:00Z'), false);
  assert.equal(processRetired(123, '2026-10-07T13:59:59Z'), false);
  assert.equal(processRetired(123, '2026-10-07T14:01:00Z'), false);
  const queried = ps.mock.callCount();
  assert.equal(processRetired(123), false);
  assert.equal(processRetired(123, 'corrupt'), false);
  assert.equal(ps.mock.callCount(), queried);
  ps.mock.mockImplementation(() => 'unreadable');
  assert.equal(processRetired(123, '2026-10-06T19:22:20Z'), false);
  ps.mock.mockImplementation(() => { throw Object.assign(new Error('ps unavailable'), { code: 'EIO' }); });
  assert.throws(() => processRetired(123, '2026-10-06T19:22:20Z'), { code: 'EIO' });
  t.mock.method(process, 'kill', () => { throw Object.assign(new Error('permission denied'), { code: 'EPERM' }); });
  assert.throws(() => processRetired(123, '2026-10-06T19:22:20Z'), { code: 'EIO' });
  ps.mock.mockImplementation(() => 'Wed Oct 7 14:00:00 2026\n');
  assert.equal(processRetired(123, '2026-10-06T19:22:20Z'), true);
  assert.equal(processRetired(123, '2026-10-07T14:00:00Z'), false);
  assert.equal(processRetired(123, '2026-10-07T13:59:59Z'), false);
  assert.equal(processRetired(123), false);
  t.mock.method(process, 'kill', () => { throw Object.assign(new Error('signal probe unavailable'), { code: 'EIO' }); });
  assert.throws(() => processRetired(123, '2026-10-06T19:22:20Z'), { code: 'EIO' });
  t.mock.method(process, 'kill', () => { throw Object.assign(new Error('absent'), { code: 'ESRCH' }); });
  assert.equal(processRetired(123), true);
  assert.ok(calls.length > 0);
});
