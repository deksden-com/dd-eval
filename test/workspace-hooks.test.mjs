import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { qualifyWorkspaceHooks } from "../lib/runner.mjs";

test("AGY workspace qualification installs before check, retains evidence and resumed check never repairs", async t => {
  const root = await mkdtemp(path.join(os.tmpdir(), "eval-workspace-hooks-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const project = path.join(root, "workspace"), runtime = path.join(root, "runtime"), adapter = path.join(runtime, "harness-runtime", "bin", "dd-agy.mjs");
  await mkdir(project); await mkdir(path.dirname(adapter), { recursive: true });
  await writeFile(adapter, `import fs from "node:fs"; import path from "node:path"; import crypto from "node:crypto";
const args=process.argv.slice(2); const action=args[1], project=args[args.indexOf("--project-root")+1];
if(args[0]!=="hooks"||!['install','check'].includes(action))throw Error("unexpected productive dispatch");
fs.appendFileSync(path.join(process.env.DD_FLOW_HOME,"calls"),action+"\\n");
const file=path.join(project,".agents","hooks.json");
if(action==="install"){fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,"qualified");}
if(!fs.existsSync(file)||fs.readFileSync(file,"utf8")!=="qualified"){console.error(JSON.stringify({error:{code:"workspace_hooks_unqualified",message:"not qualified"}}));process.exit(1);}
console.log(JSON.stringify({ok:true,workspaceHooksPath:file,workspaceHooksSha256:crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex")}));`);
  const profile = { id: "agy-test", harness: "antigravity-cli" };
  await assert.rejects(qualifyWorkspaceHooks(profile, project, runtime), { code: "workspace_hooks_unqualified" });
  const receipt = await qualifyWorkspaceHooks(profile, project, runtime, { install: true });
  assert.equal(receipt.installation.workspaceHooksSha256, receipt.qualification.workspaceHooksSha256);
  assert.equal(await readFile(path.join(runtime, "calls"), "utf8"), "check\ninstall\ncheck\n");
  const evidenceDirectory = path.join(runtime, "workspace-hook-qualification");
  const [evidenceName] = await readdir(evidenceDirectory);
  const evidenceFile = path.join(evidenceDirectory, evidenceName);
  const originalEvidence = await readFile(evidenceFile, "utf8");
  await qualifyWorkspaceHooks(profile, project, runtime);
  assert.equal(await readFile(evidenceFile, "utf8"), originalEvidence);
  await writeFile(path.join(project, ".agents", "hooks.json"), "user change");
  await assert.rejects(qualifyWorkspaceHooks(profile, project, runtime), { code: "workspace_hooks_unqualified" });
  assert.equal(await readFile(path.join(project, ".agents", "hooks.json"), "utf8"), "user change");
  assert.equal(await qualifyWorkspaceHooks({ harness: "codex-desktop" }, project, runtime, { install: true }), null);
  assert.equal(await readFile(path.join(runtime, "calls"), "utf8"), "check\ninstall\ncheck\ncheck\ncheck\n");
  const registry = path.join(runtime, "agent-profiles");
  await mkdir(registry);
  await writeFile(path.join(registry, "root.json"), JSON.stringify({ schema_id: "dd-flow/agent-profile@1", id: "root", harness: "codex" }));
  await writeFile(path.join(registry, "reviewer.json"), JSON.stringify({ schema_id: "dd-flow/agent-profile@1", id: "reviewer", harness: "agy" }));
  const execution = { agent_profile_id: "root", stage_overrides: { "code-review": { delegation: { mode: "external", agent_profile_id: "reviewer" } } } };
  const external = await qualifyWorkspaceHooks({ id: "root", harness: "codex-desktop" }, project, runtime, { install: true, execution });
  assert.equal(external.profile_id, "reviewer");
  await qualifyWorkspaceHooks({ id: "root", harness: "codex-desktop" }, project, runtime, { execution });
  const selectedCodex = { agent_profile_id: "root" };
  assert.equal(await qualifyWorkspaceHooks({ harness: "codex-desktop" }, project, runtime, { install: true, execution: selectedCodex }), null);
  await assert.rejects(qualifyWorkspaceHooks(profile, project, runtime, { execution: { agent_profile_id: "../outside" } }), { code: "agent_profile_invalid" });
});
