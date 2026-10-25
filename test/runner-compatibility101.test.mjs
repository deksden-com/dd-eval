import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { verifyRunnerEvidenceCompatibility } from "../lib/baseline-admission.mjs";
import { compactCheckDiagnostic } from "../lib/check-diagnostic.mjs";
import { assertCheckpointLaunchable } from "../lib/engine-admission.mjs";

test("candidate checkpoint is inspectable but cannot dispatch until explicitly ready", () => {
  assert.throws(() => assertCheckpointLaunchable({ value: { preparation: { launchable: false } } }), { code: "input_checkpoint_not_launchable" });
  assert.doesNotThrow(() => assertCheckpointLaunchable({ value: { preparation: { launchable: true } } }));
  assert.doesNotThrow(() => assertCheckpointLaunchable({ value: {} }));
});

test("compatibility refuses a missing failure producer before dispatch", async t => {
  const root = await mkdtemp(path.join(os.tmpdir(), "runner-compat101-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  await assert.rejects(verifyRunnerEvidenceCompatibility({ projectRoot: root, outputRoot: root, api: {}, binding: {} }), error =>
    error.code === "runner_evidence_incompatible" && error.details.reason === "missing_failure_probe" && error.details.product_repair_allowed === false);
  assert.equal(await verifyRunnerEvidenceCompatibility({ projectRoot: root, outputRoot: root, api: {}, binding: {}, required: false }), null);
  for (const requirement of [null, { path: "../outside", contract: "dd-tasks/check-evidence-probe@1" }, { path: "scripts/probe.mjs", contract: "foreign" }])
    await assert.rejects(verifyRunnerEvidenceCompatibility({ projectRoot: root, outputRoot: root, api: {}, binding: {}, requirement }), error => error.code === "runner_evidence_incompatible" && error.details.reason === "invalid_probe_requirement");
});

test("compatibility requires every real producer case and checks foreign bindings", async t => {
  const root = await mkdtemp(path.join(os.tmpdir(), "runner-compat101-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(path.join(root, "scripts"));
  const source = `import fs from 'node:fs';import path from 'node:path';const args=process.argv.slice(2),out=args[args.indexOf('--output')+1],binding=JSON.parse(args[args.indexOf('--binding-json')+1]);
fs.mkdirSync(path.join(out,'project'));const cases=['browser-window','runtime-error','runtime-typeerror','compiler','composite'].map(id=>{fs.mkdirSync(path.join(out,id));return {id,root:id,candidate_root:'project',contract:{schema_id:'dd-flow/check-runner-evidence@2',path:'report.json'},binding,expected:'source_repair'}});
fs.writeFileSync(path.join(out,'probe.json'),JSON.stringify({schema_id:'dd-tasks/check-evidence-probe@1',cases}));`;
  await writeFile(path.join(root, "scripts/check-evidence-probe.mjs"), source);
  const binding = { invocation_id: "original", input_hash: "a".repeat(64), verification_epoch: "b".repeat(64) };
  const api = { runnerContractsValid: () => true, readRunnerEvidence: (_root, _contract, value) => value.invocation_id === "original" ? {} : null,
    checkRepairDisposition: () => "source_repair" };
  const result = await verifyRunnerEvidenceCompatibility({ projectRoot: root, outputRoot: root, api, binding });
  assert.equal(result.status, "passed"); assert.equal(result.cases.length, 5);
  await assert.rejects(verifyRunnerEvidenceCompatibility({ projectRoot: root, outputRoot: root, api: { ...api, checkRepairDisposition: () => "tooling_blocker" }, binding }), error =>
    error.code === "runner_evidence_incompatible" && error.details.reason === "failure_capability_rejected");
  await assert.rejects(verifyRunnerEvidenceCompatibility({ projectRoot: root, outputRoot: root, api: { ...api, readRunnerEvidence: () => ({}) }, binding }), error =>
    error.code === "runner_evidence_incompatible" && error.details.reason === "foreign_binding_accepted");
  await writeFile(path.join(root, "scripts/check-evidence-probe.mjs"), `import fs from 'node:fs';import path from 'node:path';fs.writeFileSync(path.join(process.argv[process.argv.indexOf('--output')+1],'probe.json'),'null');`);
  await assert.rejects(verifyRunnerEvidenceCompatibility({ projectRoot: root, outputRoot: root, api, binding }), error => error.code === "runner_evidence_incompatible" && error.details.reason === "probe_cases_missing");
});

test("validation diagnostics survive compaction without secrets or unbounded payload", () => {
  const result = compactCheckDiagnostic({ runner_evidence_diagnostics: Array.from({ length: 80 }, () => ({ reason: "unsupported_observation_contract", report: "nested/browser.json", expected: "@2", observed: "token=SECRET" })) });
  assert.equal(result.runner_evidence_diagnostics[0].reason, "unsupported_observation_contract");
  assert.equal(result.runner_evidence_diagnostics[0].report, "nested/browser.json");
  assert.equal(result.diagnostic_truncated, true);
  assert.ok(!JSON.stringify(result).includes("SECRET"));
  assert.ok(Buffer.byteLength(JSON.stringify(result)) <= 32768);
});

test("probe @2 explicitly negotiates the library case without changing @1", async t => {
  const root = await mkdtemp(path.join(os.tmpdir(), "runner-compat105-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(path.join(root, "scripts"));
  const binding = { invocation_id: "probe105", input_hash: "a".repeat(64), verification_epoch: "b".repeat(64) };
  const api = { runnerContractsValid: () => true, readRunnerEvidence: (_root, _contract, value) => value.invocation_id === binding.invocation_id ? {} : null, checkRepairDisposition: () => "source_repair" };
  const requirement = { path: "scripts/check-evidence-probe.mjs", contract: "dd-tasks/check-evidence-probe@2" };
  const script = `import fs from 'node:fs';import path from 'node:path';const args=process.argv.slice(2),out=args[args.indexOf('--output')+1],binding=JSON.parse(args[args.indexOf('--binding-json')+1]);
const contract=args.includes('--contract')?args[args.indexOf('--contract')+1]:'dd-tasks/check-evidence-probe@1';
fs.mkdirSync(path.join(out,'project'));const ids=['browser-window','runtime-error','runtime-typeerror','compiler','composite'];if(contract.endsWith('@2'))ids.push('library-query');
const cases=ids.map(id=>{fs.mkdirSync(path.join(out,id),{recursive:true});return {id,root:id,candidate_root:'project',contract:{schema_id:'dd-flow/check-runner-evidence@2',path:'report.json'},binding,expected:'source_repair'}});
fs.writeFileSync(path.join(out,'probe.json'),JSON.stringify({schema_id:contract,cases}));`;
  await writeFile(path.join(root, requirement.path), script);
  assert.equal((await verifyRunnerEvidenceCompatibility({ projectRoot: root, outputRoot: root, api, binding })).cases.length, 5);
  const result = await verifyRunnerEvidenceCompatibility({ projectRoot: root, outputRoot: root, api, binding, requirement });
  assert.equal(result.schema_id, requirement.contract);
  assert.equal(result.cases.length, 6);
  for (const broken of [script.replace("ids.push('library-query')", "ids.push('compiler')"), script.replace("ids.push('library-query')", "ids.push('foreign-case')"), script.replace("ids.push('library-query')", "ids.push('library-query','extra')")]) {
    await writeFile(path.join(root, requirement.path), broken);
    await assert.rejects(verifyRunnerEvidenceCompatibility({ projectRoot: root, outputRoot: root, api, binding, requirement }), error => error.details?.reason === "probe_cases_missing");
  }
});
