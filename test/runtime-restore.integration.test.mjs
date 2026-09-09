import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, mkdir, writeFile, readFile, readdir, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { commandJson, commandText } from "../lib/process-json.mjs";
import { restoreStageSnapshot } from "../lib/runner.mjs";
import { verifyEngineArtifact } from "../lib/engine-admission.mjs";

test("real CLI restores a captured RUN before provisioning its pinned engine", { skip: !process.env.DD_EVAL_TEST_FLOW_CLI, timeout: 120_000 }, async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "eval-real-restore-"));
  const keys = ["DD_FLOW_BIN", "DD_FLOW_CONFIG_HOME", "DD_EVAL_HOME"];
  const prior = Object.fromEntries(keys.map(key => [key, process.env[key]]));
  try {
    const cli = path.resolve(process.env.DD_EVAL_TEST_FLOW_CLI);
    const project = path.join(root, "source"), runtime = path.join(root, "source-runtime"), home = path.join(root, "eval"), config = path.join(root, "config");
    await mkdir(path.join(project, ".memory-bank"), { recursive: true }); await mkdir(config);
    await writeFile(path.join(project, "README.md"), "original project bytes\n");
    await writeFile(path.join(config, "harnesses.json"), JSON.stringify({ schema_id: "dd-flow/harness-config@1", harnesses: {} }));
    const git = args => commandText("git", args, { cwd: project });
    await git(["init", "--quiet", "-b", "main"]); await git(["add", "."]);
    await git(["-c", "user.name=Fixture", "-c", "user.email=fixture@example.test", "commit", "--quiet", "-m", "fixture"]);
    const env = { DD_FLOW_HOME: runtime, DD_FLOW_RESOURCE_HOME: runtime, DD_FLOW_ENGINE_MODE: "1" };
    const started = await commandJson(cli, ["run", "start", "--project-root", project, "--flow-kind", "custom", "--subject-type", "test", "--subject-id", "restore", "--slug", "restore"], { cwd: project, env });
    const snapshot = path.join(home, "snapshot");
    await commandJson(cli, ["run", "snapshot", "create", started.run.id, "--stage-entry", "protocolize", "--project-root", project, "--output", snapshot], { cwd: project, env });
    const bytes = await readFile(path.join(snapshot, "snapshot.json"));
    const sourceDb = await readFile(path.join(snapshot, "runtime", "db.sqlite"));
    process.env.DD_FLOW_BIN = cli; process.env.DD_FLOW_CONFIG_HOME = config; process.env.DD_EVAL_HOME = home;
    const target = path.join(root, "target"), targetRuntime = path.join(root, "target-runtime");
    const restored = await restoreStageSnapshot({ home, projectRoot: target, runtimeRoot: targetRuntime, stage: "protocolize", entry: { snapshot: { kind: "run", run_id: started.run.id, locator: "snapshot", manifest_sha256: createHash("sha256").update(bytes).digest("hex") } } });
    await verifyEngineArtifact(restored.engine);
    const status = await commandJson(path.join(targetRuntime, "bin", "dd-flow"), ["run", "status", restored.run_id, "--project-root", target], { cwd: target, env: { DD_FLOW_HOME: targetRuntime, DD_FLOW_RESOURCE_HOME: path.join(root, "resources") } });
    assert.equal(status.run.id, started.run.id);
    assert.equal(await readFile(path.join(target, "README.md"), "utf8"), "original project bytes\n");
    assert.deepEqual(await readFile(path.join(snapshot, "runtime", "db.sqlite")), sourceDb);
    assert.deepEqual(await readFile(path.join(snapshot, "snapshot.json")), bytes);
    assert.ok(!(await readdir(root)).some(name => name.startsWith(".restore-engine-")));
  } finally {
    for (const [key, value] of Object.entries(prior)) { if (value === undefined) delete process.env[key]; else process.env[key] = value; }
    await rm(root, { recursive: true, force: true });
  }
});
