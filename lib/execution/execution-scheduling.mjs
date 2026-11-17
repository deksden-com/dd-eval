import { harnessConfigKey } from "../harness/driver-bindings.mjs";

const fail = (message, code = "validation") => { const error = new Error(message); error.code = code; throw error; };

/**
 * Execute admitted items with bounded concurrency; actions own result publication.
 * @param {object[]} items Execution descriptors.
 * @param {number} limit Maximum concurrent actions.
 * @param {Function} action Async action for an admitted item.
 * @param {Function} shouldStart Admission predicate checked before each action.
 * @returns {Promise<void>} Resolves after the queue workers finish.
 */
export async function runLimitedQueue(items, limit, action, shouldStart = () => true) {
  let cursor = 0;
  const workers = Array.from({ length: Math.min(Math.max(1, limit), items.length) }, async () => {
    for (;;) {
      const index = cursor; cursor += 1;
      if (index >= items.length) return;
      if (shouldStart(items[index])) await action(items[index]);
    }
  });
  await Promise.all(workers);
}



/** FIFO permit pool for limiting concurrent calls to one harness. */
export class Semaphore {
  constructor(limit) { this.limit = limit; this.active = 0; this.waiting = []; }
  async acquire() {
    if (this.active < this.limit) { this.active += 1; return; }
    await new Promise((resolve) => this.waiting.push(resolve));
  }
  release() {
    const next = this.waiting.shift();
    if (next) return next();
    this.active -= 1;
  }
}

/**
 * Build independent per-harness permit pools from an EVAL profile.
 * @param {object} runProfile Loaded EVAL profile with concurrency limits.
 * @returns {object} Permit interface that releases permits even when an action fails.
 */
export function createHarnessPermits(runProfile) {
  const limits = runProfile.value.concurrency.per_harness ?? {};
  const pools = new Map();
  const pool = (harness) => {
    if (!pools.has(harness)) pools.set(harness, new Semaphore(limits[harness] ?? 1));
    return pools.get(harness);
  };
  return {
    async use(profile, action) {
      const permit = pool(profile.harness); await permit.acquire();
      try { return await action(); } finally { permit.release(); }
    }
  };
}

/**
 * Build a canonical scoped runtime budget without changing configured limits.
 * @param {string} runId EVAL run identifier.
 * @param {object} profile EVAL profile with per-harness concurrency limits.
 * @returns {object} Runtime budget; throws for invalid or duplicate harness aliases.
 */
export function executionBudget(runId, profile) {
  const limits = {};
  for (const [name, limit] of Object.entries(profile.concurrency.per_harness ?? {})) {
    const harness = harnessConfigKey(name);
    if (Object.hasOwn(limits, harness) || !Number.isSafeInteger(limit) || limit < 1 || limit > 1024) fail("Experiment has invalid or duplicate harness limits", "runtime_budget_invalid");
    limits[harness] = limit;
  }
  return { schema_id: "dd-flow/runtime-budget@1", scope_id: runId, per_harness: Object.fromEntries(Object.entries(limits).sort(([left], [right]) => left.localeCompare(right))) };
}
