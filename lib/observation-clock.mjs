export const OBSERVATION_CLOCK_CONTRACT_VERSION = "operation-progress@1";
export function validateObservationDuration(value, label = "observation duration") {
  if (!Number.isSafeInteger(value) || value < 1 || value > 2_147_483_647)
    throw new RangeError(`${label} must be integer milliseconds in 1..2147483647`);
  return value;
}

/** Only observed monotonic time is silence. A clock gap is uncertainty, never
 * progress or proof of provider failure. Durable snapshots retain that episode. */
export class ObservationClock {
  constructor({ timeoutMs, gapMs = 60_000, uncertaintyMs = 120_000, wall = Date.now,
    monotonic = () => performance.now(), onGap = () => {}, saved = null }) {
    validateObservationDuration(timeoutMs); validateObservationDuration(gapMs, "gap duration");
    validateObservationDuration(uncertaintyMs, "observation recovery duration");
    Object.assign(this, { timeoutMs, gapMs, uncertaintyMs, wall, monotonic, onGap });
    this.lastWall = wall(); this.lastMono = monotonic(); this.startedWall = this.lastWall;
    this.elapsed = 0; this.progress = undefined; this.progressAt = null;
    this.uncertain = false; this.uncertaintyElapsed = 0; this.gaps = 0; this.observationLost = false;
    if (saved) {
      if (saved.policy !== OBSERVATION_CLOCK_CONTRACT_VERSION || saved.timeout_ms !== timeoutMs
        || !Number.isFinite(saved.started_at) || !Number.isSafeInteger(saved.gaps) || saved.gaps < 0
        || saved.observed_at !== null && !Number.isFinite(saved.observed_at)
        || typeof saved.observation_lost !== "boolean"
        || !Number.isFinite(saved.elapsed_ms) || saved.elapsed_ms < 0
        || !Number.isFinite(saved.uncertainty_elapsed_ms) || saved.uncertainty_elapsed_ms < 0)
        throw new RangeError("invalid retained observation clock");
      this.startedWall = saved.started_at; this.elapsed = saved.elapsed_ms;
      this.progress = saved.cursor; this.progressAt = saved.observed_at;
      // A reconstructed observer cannot prove silence during its absence.
      this.uncertain = true; this.gaps = saved.gaps + 1;
      this.uncertaintyElapsed = saved.uncertainty_elapsed_ms;
      this.observationLost = saved.observation_lost || this.gaps > 1 || this.uncertaintyElapsed >= uncertaintyMs;
    }
  }
  sample(progress, progressAt) {
    if (progress && typeof progress === "object" && Object.hasOwn(progress, "cursor")) {
      progressAt = progress.observed_at; progress = progress.cursor;
    }
    const wall = this.wall(), mono = this.monotonic();
    const delta = mono - this.lastMono, wallDelta = wall - this.lastWall;
    const gap = !Number.isFinite(delta) || !Number.isFinite(wallDelta)
      || delta > this.gapMs || wallDelta > this.gapMs || delta < 0 || wallDelta < 0;
    if (gap) {
      this.uncertain = true; this.gaps++;
      this.onGap({ source: "observer_clock", classification: "observation_gap", confirmed_sleep: false,
        started_at: Number.isFinite(this.lastWall) ? this.lastWall : null, observed_at: Number.isFinite(wall) ? wall : null,
        wall_delta_ms: wallDelta, monotonic_delta_ms: delta });
    } else {
      this.elapsed += delta;
      if (this.uncertain) this.uncertaintyElapsed += delta;
    }
    this.lastWall = wall; this.lastMono = mono;
    const validCursor = typeof progress === "string" || typeof progress === "boolean"
      || typeof progress === "number" && Number.isFinite(progress);
    const changed = validCursor && progress !== this.progress;
    const timestamped = progressAt !== undefined;
    const validTime = !timestamped ? wall >= this.startedWall && (this.progressAt === null || wall >= this.progressAt)
      : Number.isFinite(progressAt) && progressAt >= this.startedWall
      && progressAt <= wall && (this.progressAt === null || progressAt >= this.progressAt);
    if (changed && validTime && !this.observationLost) {
      const eventAt = timestamped ? progressAt : wall;
      // A delayed pre-gap event cannot establish that observation has recovered.
      const recovers = !this.uncertain || eventAt >= wall - Math.max(0, gap ? 0 : delta);
      this.progress = progress; this.progressAt = eventAt;
      this.elapsed = Math.max(0, wall - eventAt);
      if (recovers) { this.uncertain = false; this.gaps = 0; this.uncertaintyElapsed = 0; }
    }
    if (changed && timestamped && Number.isFinite(progressAt) && !validTime && progressAt > wall) {
      if (!this.uncertain) this.onGap({ source: "observer_clock", classification: "clock_skew",
        confirmed_sleep: false, observed_at: wall, signal_at: progressAt });
      this.uncertain = true;
    }
    if (this.uncertain && (this.gaps > 1 || this.uncertaintyElapsed >= this.uncertaintyMs)) this.observationLost = true;
    return this.observationLost || !this.uncertain && this.elapsed >= this.timeoutMs;
  }
  state() {
    return { policy: OBSERVATION_CLOCK_CONTRACT_VERSION, timeout_ms: this.timeoutMs,
      started_at: this.startedWall, cursor: this.progress, observed_at: this.progressAt,
      elapsed_ms: this.elapsed, uncertainty_elapsed_ms: this.uncertaintyElapsed,
      gaps: this.gaps, observation_lost: this.observationLost };
  }
}

/** Node timer handle, compatible with existing clearTimeout cleanup. */
export function observedTimeout(callback, timeoutMs, options = {}) {
  const clock = new ObservationClock({ timeoutMs, ...options });
  const timer = setInterval(() => {
    const snapshot = options.progress?.();
    if (clock.sample(snapshot)) { clearInterval(timer); callback(clock); }
  }, Math.max(1, Math.min(1_000, timeoutMs / 4)));
  return timer;
}
