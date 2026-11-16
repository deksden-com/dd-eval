import path from "node:path";
import { fileURLToPath } from "node:url";
import { readFile } from "node:fs/promises";
import { sha256 } from "../runner-events.mjs";
import { contained } from "../contained-path.mjs";
import { declaredManagedTools } from "./managed-tools.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const fail = (message, code = "validation") => { const error = new Error(message); error.code = code; throw error; };
const isObject = value => Boolean(value) && typeof value === "object" && !Array.isArray(value);

function checkpointFile(id) { return contained(path.join(repoRoot, "checkpoints"), `${id}.json`, "input checkpoint id"); }

/** Load the pinned checkpoint only after verifying identity, SHA-256 and engine bindings. */
export async function loadInputCheckpoint(reference) {
  if (!isObject(reference) || typeof reference.id !== "string" || !/^cp-[a-z0-9][a-z0-9-]*$/.test(reference.id) || !/^[a-f0-9]{64}$/.test(reference.sha256 ?? "")) fail("case requires a valid input_checkpoint reference");
  const file = checkpointFile(reference.id);
  const bytes = await readFile(file).catch(() => fail(`input checkpoint is missing: ${reference.id}`, "input_checkpoint_missing"));
  const actual = sha256(bytes);
  if (actual !== reference.sha256) fail(`input checkpoint checksum does not match: ${reference.id}`, "input_checkpoint_checksum_mismatch");
  const value = JSON.parse(bytes.toString("utf8"));
  if (!isObject(value) || value.id !== reference.id || !isObject(value.source) || typeof value.source.commit !== "string" || !/^[a-f0-9]{40}$/.test(value.source.commit)) fail(`input checkpoint is invalid: ${reference.id}`, "input_checkpoint_invalid");
  if (!isObject(value.flow_pack) || typeof value.flow_pack.commit !== "string" || !/^[a-f0-9]{40}$/.test(value.flow_pack.commit) || typeof value.flow_pack.path !== "string" || !value.flow_pack.path || path.isAbsolute(value.flow_pack.path) || value.flow_pack.path.split(/[\\/]/).includes("..")) fail(`input checkpoint has no valid flow_pack: ${reference.id}`, "input_checkpoint_invalid");
  const engine = value.flow_pack.engine;
  declaredManagedTools(value);
  if (value.flow_pack.delivery !== undefined && !["project_pack", "installed_canon"].includes(value.flow_pack.delivery)) fail("Unsupported flow checkpoint delivery", "input_checkpoint_invalid");
  if (!isObject(engine) || typeof engine.repository !== "string" || !engine.repository || typeof engine.commit !== "string" || !/^[a-f0-9]{40}$/.test(engine.commit) || typeof engine.version !== "string" || !engine.version) fail(`input checkpoint has no valid flow_pack engine: ${reference.id}`, "input_checkpoint_invalid");
  return { file, sha256: actual, value };
}
