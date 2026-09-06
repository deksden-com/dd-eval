import { mkdir, readFile, writeFile, symlink } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";
import { callDriver } from "../lib/runner.mjs";
import { modelAttribution, readModelObservations } from "../lib/model-observations.mjs";
import { writeJsonAtomic } from "../lib/runner-events.mjs";

const repo = fileURLToPath(new URL("../", import.meta.url));
const profiles = process.argv.slice(2);
if (!profiles.length) throw new Error("Pass one or more committed profile IDs");
const root = path.join(process.env.DD_EVAL_HOME ?? path.join(os.homedir(), ".dd-eval"), "conformance", "live-029", randomUUID());
await mkdir(root, { recursive: true });
console.log(JSON.stringify({ root, status: "running" }));
for (const id of profiles) {
  if (!/^[a-z0-9-]+$/.test(id)) throw new Error("Invalid profile ID");
  const profile = JSON.parse(await readFile(path.join(repo, "profiles", `${id}.json`), "utf8"));
  const attempt = path.join(root, id), project = path.join(attempt, "project"), state = path.join(attempt, "daemon"), journal = path.join(attempt, "subject.events.jsonl");
  await mkdir(project, { recursive: true });
  const marker = `native-read-${randomUUID()}`;
  await writeFile(path.join(project, "smoke.txt"), marker);
  const env = {};
  if (profile.harness === "codex-desktop") {
    env.CODEX_HOME = path.join(attempt, "codex-home"); await mkdir(env.CODEX_HOME);
    await symlink(path.join(process.env.CODEX_HOME ?? path.join(os.homedir(), ".codex"), "auth.json"), path.join(env.CODEX_HOME, "auth.json"));
  }
  const flags = ["--state-dir", state, "--cwd", project, "--journal", journal, "--timeout", "120", ...(["grok-acp", "antigravity-cli", "opencode-server", "droid-cli"].includes(profile.harness) ? ["--no-flow"] : [])];
  const options = { cwd: project, env };
  const receipt = { schema_id: "dd-eval/live-harness-smoke@1", profile_id: id, harness: profile.harness, requested_profile: profile, started_at: new Date().toISOString(), no_flow: true, native_children_created: 0 };
  let started = false, pending;
  try {
    receipt.start = await callDriver(profile, ["daemon", "start", ...flags], options); started = true;
    const created = await callDriver(profile, ["session", "create", ...flags], options);
    const session = created.provider_session_id ?? created.session_id;
    if (typeof session !== "string") throw new Error("Native session ID is missing");
    receipt.session_id = session;
    const response = await callDriver(profile, ["session", "prompt", ...flags, "--session-id", session, "--prompt", "Read smoke.txt using an available native tool (a read-only shell command is allowed) and return its exact contents. Do not write files, create sessions, or delegate."], options);
    receipt.native_read_verified = JSON.stringify(response).includes(marker);
    if (!receipt.native_read_verified) throw new Error("Native response did not include the unread marker");
    receipt.model_attribution = modelAttribution(await readModelObservations(journal));
    pending = callDriver(profile, ["session", "prompt", ...flags, "--session-id", session, "--prompt", "This is a cancellation test. Run the single shell command sleep 20, then reply done. Do not write files or delegate."], options).then(result => ({ result }), error => ({ error: { code: error.code, message: error.message } }));
    await new Promise(resolve => setTimeout(resolve, 2000));
    receipt.cancel = await callDriver(profile, ["daemon", "stop", "--state-dir", state, "--cancel-tree"], options);
    receipt.pending_result = await pending;
    receipt.status = receipt.cancel.clean === true || receipt.cancel.settled === true ? "passed" : "cleanup_unconfirmed";
  } catch (error) { receipt.status = "failed"; receipt.error = { code: error.code ?? "live_smoke_failed", message: error.message }; }
  finally {
    if (receipt.cancel?.clean === true || receipt.cancel?.settled === true) receipt.cleanup = receipt.cancel;
    else if (started) {
      try { receipt.cleanup = await callDriver(profile, ["daemon", "stop", "--state-dir", state, "--cancel-tree"], options); }
      catch (error) { receipt.cleanup = { settled: false, code: error.code, message: error.message }; }
    }
    receipt.finished_at = new Date().toISOString();
    receipt.model_attribution = modelAttribution(await readModelObservations(journal).catch(() => []));
    await writeJsonAtomic(path.join(attempt, "receipt.json"), receipt);
    console.log(JSON.stringify({ profile: id, status: receipt.status, native_read_verified: receipt.native_read_verified ?? false, error: receipt.error ?? null, cleanup: receipt.cleanup, receipt: path.join(attempt, "receipt.json") }));
  }
}
