import test from 'node:test';
import assert from 'node:assert/strict';
import { setupObserver, observationDetails } from '../lib/setup-progress.mjs';
import { ObservationClock } from '../lib/observation-clock.mjs';
import { commandJson } from '../lib/process-json.mjs';

test('setup progress is request-bound, distinct and monotonic', () => {
  const accept = setupObserver('owned');
  const event = { kind: 'setup_phase', operation_id: 'owned', phase: 'probe_completed', step: 'one', sequence: 1, observed_at: new Date().toISOString() };
  assert.equal(accept({ ...event, operation_id: 'foreign' }), false);
  assert.equal(accept(event), true);
  assert.equal(accept({ ...event, sequence: 2 }), false);
  assert.equal(accept({ ...event, sequence: 2, step: 'two' }), true);
});
test('clock evidence distinguishes silence and unavailable observation', () => {
  let tick = 0;
  const clock = new ObservationClock({ timeoutMs: 100, wall: () => tick, monotonic: () => tick, gapMs: 200 });
  clock.sample(0); tick = 100; clock.sample(0);
  assert.equal(observationDetails(clock, 'control', 42).reason, 'inactivity');
  tick = 500; clock.sample(0); tick = 900; clock.sample(0);
  assert.equal(observationDetails(clock, 'control', 42).reason, 'observation_gap');
});

test('bound setup milestones advance observation before the native ledger exists', async () => {
  const producer = `let sequence=0;
    const emit=()=>console.error(JSON.stringify({kind:'setup_phase',operation_id:process.env.DD_EVAL_OPERATION_ID,phase:'probe_started',step:++sequence,sequence,observed_at:new Date().toISOString()}));
    emit(); const timer=setInterval(emit,200);
    setTimeout(()=>{clearInterval(timer);console.log(JSON.stringify({ok:true}));},1800);`;
  assert.deepEqual(await commandJson(process.execPath, ['--eval', producer, '--'], {
    timeoutMs: 1000, startupMs: 3000, operationProgress: async () => undefined
  }), { ok: true });
});
