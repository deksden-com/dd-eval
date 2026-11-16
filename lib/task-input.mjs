import { randomUUID } from "node:crypto";
import { chmod, mkdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { contained } from "./contained-path.mjs";
import { commandText } from "./process-json.mjs";
import { readRegularFile } from "./regular-file.mjs";
import { sha256 } from "./runner-events.mjs";

const fail = (message, code = "validation") => { const error = new Error(message); error.code = code; throw error; };

export async function ignoreEvalLocalState(projectRoot) {
  const exclude = path.resolve(projectRoot, await commandText("git", ["rev-parse", "--git-path", "info/exclude"], { cwd: projectRoot }));
  const prior = await readFile(exclude, "utf8").catch(error => { if (error.code === "ENOENT") return ""; throw error; });
  const missing = [".dd-eval/", ".zcode/"].filter(entry => !prior.split(/\r?\n/).includes(entry));
  if (missing.length) {
    await mkdir(path.dirname(exclude), { recursive: true });
    await writeFile(exclude, `${prior}${prior.endsWith("\n") || !prior ? "" : "\n"}${missing.join("\n")}\n`);
  }
}

export async function prepareTaskInput(caseRoot, blueprint, stage, projectRoot) {
  const prepared = [];
  for (const item of blueprint.stages?.[stage]?.task_input ?? []) {
    if (typeof item.source !== "string") fail(`stage ${stage} task input ${item.role} has no entry-pack source`);
    const source = contained(path.join(caseRoot, "entry-pack-source"), item.source, "task input source");
    const sourceBytes = await readRegularFile(source);
    if (sha256(sourceBytes) !== item.sha256) fail(`stage ${stage} task input checksum does not match for ${item.role}`, "task_input_checksum_mismatch");
    const destination = path.resolve(projectRoot, item.path);
    if (!destination.startsWith(`${path.resolve(projectRoot)}${path.sep}`)) fail(`task input escapes restored project: ${item.path}`);
    prepared.push({ destination, bytes: sourceBytes, mode: (await stat(source)).mode });
  }
  return prepared;
}

export async function materializeTaskInput(caseRoot, blueprint, stage, projectRoot, prepared = null) {
  const inputs = prepared ?? await prepareTaskInput(caseRoot, blueprint, stage, projectRoot);
  // Task input is runner-local context, never an untracked product change.
  // Every snapshot restore gets a fresh Git directory, so establish this
  // local-only exclusion after each materialization rather than relying on
  // the source checkout's .git/info/exclude.
  await ignoreEvalLocalState(projectRoot);
  for (const { destination, bytes, mode } of inputs) {
    await mkdir(path.dirname(destination), { recursive: true });
    const temporary = `${destination}.${randomUUID()}.tmp`;
    try {
      await writeFile(temporary, bytes, { mode, flag: "wx" });
      await chmod(temporary, mode);
      await rename(temporary, destination);
    } finally { await rm(temporary, { force: true }); }
  }
}
