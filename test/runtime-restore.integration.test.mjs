import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, mkdir, writeFile, readFile, readdir, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
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
    const env = { DD_FLOW_HOME: runtime, DD_FLOW_RESOURCE_HOME: runtime };
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

test("focused SDLC restores a separate required-policy RUN without changing its source",{skip:!process.env.DD_EVAL_TEST_FLOW_CLI,timeout:120_000},async()=>{
  const root=await mkdtemp(path.join(os.tmpdir(),'eval-required-stage-restore-'));
  const keys=['DD_FLOW_BIN','DD_FLOW_CONFIG_HOME','DD_EVAL_HOME'],prior=Object.fromEntries(keys.map(key=>[key,process.env[key]]));
  try {
    const cli=path.resolve(process.env.DD_EVAL_TEST_FLOW_CLI),project=path.join(root,'source'),runtime=path.join(root,'source-runtime'),home=path.join(root,'eval'),config=path.join(root,'config');
    await mkdir(path.join(project,'.memory-bank','dd-flow'),{recursive:true});await mkdir(path.join(runtime,'agent-profiles'),{recursive:true});await mkdir(config);
    await writeFile(path.join(project,'README.md'),'owned fixture\n');
    await writeFile(path.join(project,'.memory-bank','dd-flow','project-execution.json'),JSON.stringify({schema_id:'dd-flow/project-execution@3',stage_session_mode:'same_session',plan_review_mode:'off',code_review_mode:'off',merge_mode:'server',merge_delivery:{strategy:'local'},merge_cleanup:{source:'retain'},stop_target:'code_completed',code_bootstrap:{command:'true',policy_ref:'fixture'},execution:{agent_profile_id:'first'}}));
    await writeFile(path.join(runtime,'agent-profiles','first.json'),JSON.stringify({schema_id:'dd-flow/agent-profile@1',id:'first',harness:'codex',provider:'fixture',model:'fixture',reasoning:'low',mode:'agent',permission:'deny'}));
    await writeFile(path.join(config,'harnesses.json'),JSON.stringify({schema_id:'dd-flow/harness-config@1',harnesses:{}}));
    const git=args=>commandText('git',args,{cwd:project});
    await git(['init','--quiet','-b','main']);await git(['add','.']);await git(['-c','user.name=Fixture','-c','user.email=fixture@example.test','commit','--quiet','-m','fixture']);
    const env={DD_FLOW_HOME:runtime,DD_FLOW_RESOURCE_HOME:runtime};
    const started=await commandJson(cli,['run','start','--project-root',project,'--flow-kind','vnext_specify','--subject-type','test','--subject-id','restore','--slug','restore'],{cwd:project,env});
    assert.equal(started.index.snapshot_policy,'best_effort');
    // Model a legacy Stage snapshot without changing any real RUN.
    const source=new DatabaseSync(path.join(runtime,'db.sqlite'));
    try {
      const version=source.prepare('SELECT version FROM dd_flow_writer_contract WHERE id=1').get().version;
      source.function('dd_flow_writer_version',()=>version);
      source.prepare("UPDATE runs SET index_json=json_remove(index_json,'$.snapshot_policy') WHERE id=?").run(started.run.id);
    } finally {source.close();}
    const snapshot=path.join(home,'snapshot');
    await commandJson(cli,['run','snapshot','create',started.run.id,'--stage-entry','specify','--project-root',project,'--output',snapshot],{cwd:project,env});
    const bytes=await readFile(path.join(snapshot,'snapshot.json')),sourceDb=await readFile(path.join(snapshot,'runtime','db.sqlite'));
    Object.assign(process.env,{DD_FLOW_BIN:cli,DD_FLOW_CONFIG_HOME:config,DD_EVAL_HOME:home});
    const target=path.join(root,'target'),targetRuntime=path.join(root,'target-runtime');
    const restored=await restoreStageSnapshot({home,projectRoot:target,runtimeRoot:targetRuntime,stage:'specify',flowId:'sdlc',entry:{snapshot:{kind:'run',run_id:started.run.id,locator:'snapshot',manifest_sha256:createHash('sha256').update(bytes).digest('hex')}}});
    assert.equal(restored.snapshot_policy,'required');
    const status=await commandJson(path.join(targetRuntime,'bin','dd-flow'),['run','status',restored.run_id,'--project-root',target],{cwd:target,env:{DD_FLOW_HOME:targetRuntime,DD_FLOW_RESOURCE_HOME:targetRuntime}});
    assert.equal(status.index.snapshot_policy,'required');
    assert.deepEqual(await readFile(path.join(snapshot,'runtime','db.sqlite')),sourceDb);
    assert.deepEqual(await readFile(path.join(snapshot,'snapshot.json')),bytes);
  } finally {
    for(const [key,value] of Object.entries(prior)){if(value===undefined) delete process.env[key];else process.env[key]=value;}
    await rm(root,{recursive:true,force:true});
  }
});
