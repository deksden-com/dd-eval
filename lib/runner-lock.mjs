import { randomUUID } from "node:crypto";
import { mkdirSync, readdirSync, readFileSync, writeFileSync, unlinkSync, rmdirSync } from "node:fs";
import path from "node:path";

function release(lock, owner) {
  try { unlinkSync(path.join(lock, owner)); } catch (error) { if (error.code === "ENOENT") return; throw error; }
  // Never recursively remove a directory: another owner may already have acquired it.
  try { rmdirSync(lock); } catch (error) { if (!["ENOENT", "ENOTEMPTY", "EEXIST"].includes(error.code)) throw error; }
}

function reclaimDeadOwner(lock) {
  let entries;
  try { entries = readdirSync(lock); } catch (error) { if (error.code === "ENOENT") return; throw error; }
  if (entries.length !== 1 || !/^owner-.*\.json$/.test(entries[0])) return;
  let owner;
  try { owner = JSON.parse(readFileSync(path.join(lock, entries[0]), "utf8")); } catch { return; }
  if (!Number.isInteger(owner.pid) || owner.pid <= 0) return;
  try { process.kill(owner.pid, 0); }
  catch (error) { if (error.code === "ESRCH") release(lock, entries[0]); }
  // A live/reused PID or unknown owner is conservative: age never proves death.
}

export async function withRunnerLock(file, action, { timeoutMs = 30_000 } = {}) {
  const lock = `${file}.lock`;
  const owner = `owner-${process.pid}-${randomUUID()}.json`;
  const deadline = performance.now() + timeoutMs;
  for (;;) {
    let acquired = false;
    try { mkdirSync(lock); acquired = true; }
    catch (error) { if (error.code !== "EEXIST") throw error; }
    if (acquired) {
      // No await between acquisition and identifying the owner.
      try { writeFileSync(path.join(lock, owner), JSON.stringify({ pid: process.pid }), { flag: "wx" }); }
      catch (error) { release(lock, owner); throw error; }
      try { return await action(); }
      finally { release(lock, owner); }
    }
    reclaimDeadOwner(lock);
    if (performance.now() >= deadline) throw Object.assign(new Error(`runner lock has a live or unconfirmed owner: ${lock}; inspect its owner before recovery`), { code: "runner_lock_timeout" });
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}
