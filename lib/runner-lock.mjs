import { randomUUID } from "node:crypto";
import { mkdirSync, readdirSync, readFileSync, writeFileSync, renameSync, unlinkSync, rmdirSync } from "node:fs";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { processSnapshot } from "./process-snapshot.mjs";

let selfIdentity;

function release(lock, owner) {
  try { unlinkSync(path.join(lock, owner)); } catch (error) { if (error.code === "ENOENT") return; throw error; }
  // Never recursively remove a directory: another owner may already have acquired it.
  try { rmdirSync(lock); } catch (error) { if (!["ENOENT", "ENOTEMPTY", "EEXIST"].includes(error.code)) throw error; }
}

async function reclaimDeadOwner(lock, startedAt) {
  let entries;
  try { entries = readdirSync(lock); } catch (error) { if (error.code === "ENOENT") return; throw error; }
  if (entries.length !== 1 || !/^owner-.*\.json$/.test(entries[0])) return;
  let owner;
  try { owner = JSON.parse(readFileSync(path.join(lock, entries[0]), "utf8")); } catch { return; }
  if (!Number.isInteger(owner.pid) || owner.pid <= 0) return;
  if (owner.pid === process.pid) {
    if (owner.started_at && owner.started_at !== startedAt) release(lock, entries[0]);
    return;
  }
  if (typeof owner.started_at === "string") {
    const physical = (await processSnapshot()).find(item => item.pid === owner.pid);
    if (!physical || physical.zombie || physical.started !== owner.started_at) release(lock, entries[0]);
    return;
  }
  try { process.kill(owner.pid, 0); }
  catch (error) { if (error.code === "ESRCH") release(lock, entries[0]); }
  // A live/reused PID or unknown owner is conservative: age never proves death.
}

export async function withRunnerLock(file, action, { timeoutMs = 30_000, inactivityMs = null, signal, onWait = () => {} } = {}) {
  if (inactivityMs !== null && (!Number.isFinite(inactivityMs) || inactivityMs <= 0)) throw new TypeError("inactivityMs must be positive");
  const lock = `${file}.lock`;
  const owner = `owner-${process.pid}-${randomUUID()}.json`;
  let deadline = performance.now() + (inactivityMs ?? timeoutMs), observedProgress = null, waiting = null;
  const startedAt = await (selfIdentity ??= processSnapshot().then(processes => {
    const self = processes.find(item => item.pid === process.pid && !item.zombie);
    if (!self) throw Object.assign(new Error("Cannot establish runner process identity"), { code: "process_ownership_unknown" });
    return self.started;
  }));
  let nextOwnerCheck = 0;
  for (;;) {
    signal?.throwIfAborted();
    let acquired = false;
    try { mkdirSync(lock); acquired = true; }
    catch (error) { if (error.code !== "EEXIST") throw error; }
    if (acquired) {
      // No await between acquisition and identifying the owner.
      const identity = { pid: process.pid, started_at: startedAt, progress: null };
      try { writeFileSync(path.join(lock, owner), JSON.stringify(identity), { flag: "wx" }); }
      catch (error) { release(lock, owner); throw error; }
      const progress = value => {
        // Only completed work/changed evidence belongs here, never a heartbeat.
        if (JSON.stringify(value) === JSON.stringify(identity.progress)) return;
        identity.progress = value;
        const temporary = path.join(lock, `${owner}.tmp`);
        writeFileSync(temporary, JSON.stringify(identity));
        renameSync(temporary, path.join(lock, owner));
      };
      try { return await action({ progress }); }
      finally { release(lock, owner); }
    }
    if (performance.now() >= nextOwnerCheck) {
      try { await reclaimDeadOwner(lock, startedAt); }
      catch (error) {
        if (inactivityMs === null) throw error;
        throw Object.assign(new Error(`Cannot observe admission lock owner: ${lock}`, { cause: error }), { code: "process_ownership_unknown", details: { state: "blocked", lock } });
      }
      if (inactivityMs !== null) {
        let retained = null;
        try {
          const entries = readdirSync(lock).filter(name => /^owner-.*\.json$/.test(name));
          if (entries.length === 1) retained = JSON.parse(readFileSync(path.join(lock, entries[0]), "utf8"));
        } catch (error) {
          if (error.code !== "ENOENT") throw Object.assign(new Error(`Cannot read admission lock owner: ${lock}`, { cause: error }), { code: "process_ownership_unknown", details: { state: "blocked", lock } });
        }
        const key = retained && JSON.stringify([retained.pid, retained.started_at, retained.progress]);
        if (key !== null && key !== observedProgress) { observedProgress = key; deadline = performance.now() + inactivityMs; }
        waiting = { state: "waiting", lock, owner: retained, remaining_ms: Math.max(0, deadline - performance.now()) };
        await onWait(waiting);
      }
      nextOwnerCheck = performance.now() + Math.min(1000, (inactivityMs ?? 4000) / 4);
    }
    if (performance.now() >= deadline) throw Object.assign(new Error(`runner lock has a live or unconfirmed owner: ${lock}; inspect its owner before recovery`), { code: "runner_lock_timeout", details: waiting && { ...waiting, state: "stalled", remaining_ms: 0 } });
    await delay(10, undefined, { signal });
  }
}
