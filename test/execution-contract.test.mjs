import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { resolveExecutionContract, validateExecutionContract, materializeExecutionContract, contractProfile, assertRunExecutionContract, conformanceExecutionContract } from "../lib/execution-contract.mjs";
import { assertProfileCapacity, qualifiedCoordinator, admitContractProfiles } from "../lib/runner.mjs";

const template = (id, harness = "codex") => ({ schema_id: "dd-flow/agent-profile@1", id, harness, provider: "openai", model: "old-model", reasoning: "high", mode: "agent", permission: "allow" });
const declaration = (id, harness = "codex-desktop") => ({ schema_version: 1, id, harness, model: "new-model", reasoning: "xhigh", runtime: { codex_cli: "0.161.0" } });
async function setup(t, values = [template("subject"), template("judge"), template("worker")]) {
  const home = await mkdtemp(path.join(os.tmpdir(), "eval-contract-")); t.after(() => rm(home, { recursive: true, force: true }));
  await mkdir(path.join(home, "agent-profiles"));
  for (const value of values) await writeFile(path.join(home, "agent-profiles", `${value.id}.json`), JSON.stringify(value));
  return home;
}
test("repo model wins same-ID template and freezes effective policy without notes", async t => {
  const configHome = await setup(t);
  const contract = await resolveExecutionContract({ configHome, runProfile: { subject: { profile_id: "subject" }, interaction_judge: { profile_id: "judge" }, selection: { stop_after: "specify" } }, loadProfile: id => ({ value: { ...declaration(id), notes: "not retained" } }) });
  assert.equal(contract.profiles.subject.model, "new-model");
  assert.equal(contractProfile(contract, "subject").provider, "openai");
  assert.equal(contractProfile(contract, "subject").harness, "codex-desktop");
  assert.equal(contract.declarations.subject.notes, undefined);
  const root = path.join(configHome, "isolated"); await materializeExecutionContract(root, contract);
  await writeFile(path.join(configHome, "agent-profiles", "subject.json"), JSON.stringify({ ...template("subject"), model: "later" }));
  assert.equal(JSON.parse(await readFile(path.join(root, "agent-profiles", "subject.json"))).model, "new-model");
  const run = { execution_profile: { settings: { execution: contract.routing }, agent_profiles: { subject: contract.profiles.subject } } };
  assert.equal(assertRunExecutionContract(run, contract).state, "matched");
  run.execution_profile.agent_profiles.subject = template("subject");
  assert.throws(() => assertRunExecutionContract(run, contract), { code: "profile_contract_mismatch" });
  assert.equal(conformanceExecutionContract({}, null).state, "unknown");
  assert.throws(() => contractProfile(contract, "late"), { code: "execution_profile_not_frozen" });
});
test("all routing frozen, only reachable workers admitted and runtime-only explicit override supported", async t => {
  const configHome = await setup(t);
  const contract = await resolveExecutionContract({ configHome, runProfile: { subject: { profile_id: "subject", execution: { agent_profile_id: "subject", stage_overrides: { code: { delegation: { mode: "external", agent_profile_id: "worker", max_parallel: 2 } } } } }, selection: { stop_after: "specify" } }, loadProfile: id => { if (id === "worker") throw Object.assign(new Error("missing"), { code: "ENOENT" }); return declaration(id); } });
  assert.ok(contract.profiles.worker); assert.deepEqual(contract.admission_profile_ids, ["subject"]);
  assert.equal(contract.field_sources.worker.model, "runtime_template");
  const full = await resolveExecutionContract({ configHome, runProfile: { subject: { profile_id: "subject", execution: contract.routing } }, loadProfile: declaration });
  assert.ok(full.admission_profile_ids.includes("worker"));
});
test("trust boundaries reject missing template, alias/security conflicts, unsafe ID and tampering", async t => {
  const configHome = await setup(t);
  const resolve = (id, loadProfile = declaration) => resolveExecutionContract({ configHome, runProfile: { subject: { profile_id: id } }, loadProfile });
  await assert.rejects(resolve("missing"), { code: "agent_profile_missing" });
  await assert.rejects(resolve("../subject"), { code: "execution_contract_invalid" });
  await assert.rejects(resolve("subject", id => declaration(id, "zcode-acp")), { code: "execution_contract_invalid" });
  await assert.rejects(resolve("subject", id => ({ ...declaration(id), permission: "deny" })), { code: "execution_contract_invalid" });
  const contract = await resolve("subject"); contract.profiles.subject.model = "tampered";
  assert.throws(() => validateExecutionContract(contract), { code: "execution_contract_invalid" });
  await writeFile(path.join(configHome, "agent-profiles", "subject.json"), JSON.stringify({ ...template("subject"), permission: "root" }));
  await assert.rejects(resolve("subject"), { code: "execution_contract_invalid" });
});
test("native workers cannot quietly replace coordinator session settings", async t => {
  const configHome = await setup(t);
  await assert.rejects(resolveExecutionContract({ configHome, runProfile: { subject: { profile_id: "subject", execution: { agent_profile_id: "subject", delegation: { mode: "native", agent_profile_id: "worker" } } } }, loadProfile: id => ({ ...declaration(id), model: id === "worker" ? "different-model" : "new-model" }) }), { code: "native_profile_override_unqualified" });
});
test("retained receipt cannot omit admission or alter compatibility fields", async t => {
  const configHome = await setup(t);
  const original = await resolveExecutionContract({ configHome, runProfile: { subject: { profile_id: "subject" }, interaction_judge: { profile_id: "judge" } }, loadProfile: declaration });
  for (const mutate of [value => { delete value.roles.subject; }, value => { delete value.admission_profile_ids; }, value => { value.admission_profile_ids = ["subject"]; }, value => { value.declarations.subject.runtime.codex_cli = "other"; }, value => { value.declarations.subject.runtime = "invalid"; }]) {
    const altered = structuredClone(original); mutate(altered);
    assert.throws(() => validateExecutionContract(altered), { code: "execution_contract_invalid" });
  }
  assert.equal(conformanceExecutionContract({}, original).state, "unknown");
  const unknownNative = { execution_profile: { settings: { execution: original.routing }, agent_profiles: { subject: { ...original.profiles.subject, model: undefined } } } };
  assert.equal(conformanceExecutionContract(unknownNative, original).state, "mismatched");
});
test("all supported harness aliases map without model/provider heuristics", async t => {
  for (const [native, alias] of [["codex", "codex-desktop"], ["zcode", "zcode-acp"], ["agy", "antigravity-cli"], ["grok", "grok-acp"], ["opencode", "opencode-server"], ["droid", "droid-cli"]]) {
    const configHome = await setup(t, [template(native, native)]);
    const contract = await resolveExecutionContract({ configHome, runProfile: { subject: { profile_id: native } }, loadProfile: id => declaration(id, alias) });
    assert.equal(contract.profiles[native].harness, native); assert.equal(contractProfile(contract, native).harness, alias);
  }
});

test("existing AGY/ZCode policy declarations constrain templates without being rejected or overridden", async t => {
  for (const id of ["zcode-acp-zai-glm-5-3-flash-max", "antigravity-cli-google-gemini-3-8-flash-high"]) {
    const declared = JSON.parse(await readFile(new URL(`../profiles/${id}.json`, import.meta.url), "utf8"));
    const native = declared.harness === "zcode-acp" ? "zcode" : "agy";
    const configHome = await setup(t, [{ ...template(id, native), provider: declared.provider, mode: declared.mode }]);
    const resolve = value => resolveExecutionContract({ configHome, runProfile: { subject: { profile_id: id } }, loadProfile: () => value });
    const contract = await resolve(declared);
    assert.equal(contract.profiles[id].model, declared.model);
    assert.equal(contract.profiles[id].provider, declared.provider);
    assert.equal(contract.profiles[id].mode, declared.mode);
    for (const key of ["provider", "mode"]) await assert.rejects(resolve({ ...declared, [key]: "conflicting" }), { code: "execution_contract_invalid" });
  }
});
test("capacity admission follows native stage coordinator overrides, not Subject label", async t => {
  const configHome = await setup(t);
  const runProfile = { subject: { profile_id: "subject", execution: { agent_profile_id: "subject", stage_overrides: { code: { agent_profile_id: "worker" } } } } };
  const contract = await resolveExecutionContract({ configHome, runProfile, loadProfile: id => ({ ...declaration(id), ...(id === "subject" ? { subagent_capacity: 3 } : {}) }) });
  const code = [{ stage: "code", terminal_stage: "code", mode: "focused" }];
  assert.doesNotThrow(() => assertProfileCapacity(contractProfile(contract, "subject"), [{ stage: "plan", terminal_stage: "plan", mode: "focused" }], contract));
  assert.throws(() => assertProfileCapacity(contractProfile(contract, "subject"), code, contract), error => error.code === "subagent_capacity_unqualified" && error.details.profile_id === "worker");
  const qualified = await resolveExecutionContract({ configHome, runProfile, loadProfile: id => ({ ...declaration(id), subagent_capacity: id === "worker" ? 5 : 3 }) });
  assert.doesNotThrow(() => assertProfileCapacity(contractProfile(qualified, "subject"), code, qualified));
  assert.throws(() => assertProfileCapacity(contractProfile(contract, "subject"), [{ stage: "plan", terminal_stage: "code", mode: "segment" }], contract), error => error.code === "subagent_capacity_unqualified" && error.details.profile_id === "worker");
  assert.equal(qualifiedCoordinator(qualified.profiles.worker, qualified).subagent_capacity, 5);
  assert.throws(() => qualifiedCoordinator({ ...qualified.profiles.worker, permission: "deny" }, qualified), { code: "profile_contract_mismatch" });
  const external = await resolveExecutionContract({ configHome, runProfile: { subject: { profile_id: "subject", execution: { ...runProfile.subject.execution, delegation: { mode: "external", agent_profile_id: "worker" } } } }, loadProfile: declaration });
  assert.doesNotThrow(() => assertProfileCapacity(contractProfile(external, "subject"), code, external));
  assert.doesNotThrow(() => assertProfileCapacity(contractProfile(external, "subject"), [{ stage: "plan", terminal_stage: "plan", mode: "focused" }], external));
  assert.doesNotThrow(() => assertProfileCapacity(declaration("subject"), [{ stage: "plan", terminal_stage: "plan", mode: "focused" }]));
  assert.doesNotThrow(() => assertProfileCapacity(declaration("subject"), [{ stage: "specify", terminal_stage: "specify" }]));
});
test("resolved repo/runtime bridge is consumed by actual dd-flow snapshot and policy resolver", { skip: !process.env.DD_FLOW_SOURCE_ROOT }, async t => {
  const { snapshotAgentProfiles, resolveExecutionPolicy } = await import(pathToFileURL(path.join(process.env.DD_FLOW_SOURCE_ROOT, "dist/services/execution-policy.js")));
  const configHome = await setup(t);
  const contract = await resolveExecutionContract({ configHome, runProfile: { subject: { profile_id: "subject", execution: { agent_profile_id: "subject", delegation: { mode: "external", agent_profile_id: "worker" } } } }, loadProfile: declaration });
  const runtime = path.join(configHome, "actual-flow"); await materializeExecutionContract(runtime, contract);
  const profiles = snapshotAgentProfiles(runtime, contract.routing);
  const resolved = resolveExecutionPolicy({ ddFlowHome: runtime, policy: contract.routing, profiles, stage: "specify" });
  assert.equal(resolved.coordinator.model, "new-model"); assert.equal(resolved.worker.model, "new-model");
  assert.equal(assertRunExecutionContract({ execution_profile: { agent_profiles: profiles, settings: { execution: contract.routing } } }, contract).state, "matched");
});
test("native admission actually calls reachable override doctor and stops on its failure", async t => {
  const configHome = await setup(t);
  const contract = await resolveExecutionContract({ configHome, runProfile: { subject: { profile_id: "subject", execution: { agent_profile_id: "subject", stage_overrides: { code: { delegation: { mode: "external", agent_profile_id: "worker" } } } } } }, loadProfile: id => ({ ...declaration(id), model: `${id}-model` }) });
  const runtime = path.join(configHome, "doctor-runtime"), calls = path.join(runtime, "calls.jsonl");
  await mkdir(path.join(runtime, "harness-runtime", "bin"), { recursive: true });
  await writeFile(path.join(runtime, "harnesses.json"), JSON.stringify({ harnesses: { "codex-desktop": { runtime_command: process.execPath } } }));
  await writeFile(path.join(runtime, "harness-runtime", "bin", "dd-codex.mjs"), `import fs from "node:fs"; const args=process.argv.slice(2); fs.appendFileSync(${JSON.stringify(calls)}, JSON.stringify(args)+"\\n"); if(args[0]!=="doctor")throw Error("No provider dispatch permitted"); const model=args[args.indexOf("--model")+1]; if(model==="worker-model"){console.error("override doctor failed");process.exit(2)} console.log(JSON.stringify({ok:true,observed_runtime:{codex_cli:"0.161.0"},profile:{model,reasoning:"xhigh",provider:"openai",mode:"agent",permission_mode:"allow"}}));`);
  await assert.rejects(admitContractProfiles(contract, configHome, runtime), /override doctor failed|exited|command/i);
  const observed = (await readFile(calls, "utf8")).trim().split("\n").map(JSON.parse);
  assert.deepEqual(observed.map(args => args[args.indexOf("--model") + 1]), ["subject-model", "worker-model"]);
  assert.ok(observed.every(args => args[0] === "doctor" && args[args.indexOf("--provider") + 1] === "openai" && args[args.indexOf("--permission") + 1] === "allow"));
});
