/** Only observed time counts toward inactivity. A scheduling/clock gap is not
 * evidence of OS sleep, nor of provider progress. Call sample regularly. */
export class ObservationClock {
  constructor({ timeoutMs, gapMs = 60_000, wall = Date.now, monotonic = () => performance.now(), onGap = () => {} }) {
    if (!(timeoutMs > 0) || !(gapMs > 0)) throw new RangeError("positive observation timeout and gap required");
    Object.assign(this, { timeoutMs, gapMs, wall, monotonic, onGap });
    this.lastWall = wall(); this.lastMono = monotonic(); this.elapsed = 0;
    this.progress = undefined;
  }
  sample(progress) {
    const wall = this.wall(), mono = this.monotonic();
    const delta = mono - this.lastMono, wallDelta = wall - this.lastWall;
    const gap = delta > this.gapMs || wallDelta > this.gapMs || delta < 0 || wallDelta < 0;
    if (gap) {
      this.onGap({ source: "observer_clock", classification: "observation_gap", confirmed_sleep: false,
        started_at: new Date(this.lastWall).toISOString(), observed_at: new Date(wall).toISOString(),
        wall_delta_ms: wallDelta, monotonic_delta_ms: delta });
      this.elapsed = 0;
    } else this.elapsed += delta;
    this.lastWall = wall; this.lastMono = mono;
    if (progress !== undefined && progress !== this.progress) { this.progress = progress; this.elapsed = 0; }
    return this.elapsed >= this.timeoutMs;
  }
}

/** Node timeout handle: callers can keep their existing clearTimeout cleanup. */
export function observedTimeout(callback, timeoutMs, options = {}) {
  const clock = new ObservationClock({ timeoutMs, ...options });
  const timer = setInterval(() => {
    if (clock.sample(options.progress?.())) { clearInterval(timer); callback(); }
  }, Math.min(1_000, timeoutMs));
  return timer;
}
