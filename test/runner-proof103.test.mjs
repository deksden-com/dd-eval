import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { validateRunnerProof, runnerEvidencePass } from '../lib/check-runner-proof.mjs';
import { loadRunnerProofSources } from '../lib/runner-proof-sources.mjs';
import { validateFinalCheckReceipts } from '../lib/case-acceptance.mjs';
import { resolveFixtureValidation, verifyFixtureAssessment } from '../lib/fixture-assessment.mjs';

const sha = value => createHash('sha256').update(value).digest('hex');
test('production composite closure survives frozen source loading; opaque extras are not parsed or required', async t => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'proof103-')); t.after(() => rm(root, { recursive: true, force: true }));
  const base = '07-merge/checks/RCP-1', fingerprint = 'e'.repeat(64), contract = { schema_id: 'dd-flow/check-runner-evidence@2', path: 'quality.json' };
  const binding = { invocation_id: 'RCP-1', check_id: 'RCP-1', command: 'pnpm quality', input_hash: 'input', verification_epoch: sha(`merge\0${fingerprint}`) };
  const report = { schema_id: contract.schema_id, binding, runner: { name: 'quality', version: '1' }, completed: true, counts: { passed: 8, failed: 0, skipped: 0 }, failures: [], steps: [] };
  const artifacts = new Map();
  for (let ordinal = 0; ordinal < 8; ordinal++) {
    const id = `check-${ordinal}`, command = `check ${ordinal}`, command_sha256 = sha(command), childBinding = { ...binding, invocation_id: `${binding.invocation_id}:step:${id}`, check_id: `${binding.check_id}/${id}`, command, input_hash: sha(JSON.stringify([binding.input_hash, command_sha256])) };
    const bytes = Buffer.from(JSON.stringify({ ...report, binding: childBinding, counts: { passed: 1, failed: 0, skipped: 0 }, steps: undefined }));
    const relative_path = `steps/${id}/report.json`; artifacts.set(relative_path, bytes);
    report.steps.push({ id, ordinal, command_sha256, state: 'passed', exit_code: 0, binding: childBinding, report: { relative_path, sha256: sha(bytes) } });
  }
  artifacts.set(contract.path, Buffer.from(JSON.stringify(report))); artifacts.set('engine-outcome.json', Buffer.from('{}')); artifacts.set('debug.bin', Buffer.from([255, 0, 1]));
  const check = { id: 'CHK-1', canonical_ref: 'PRT-1/CHK-1', command: '@check/quality', run_at: 'merge' };
  const native = { id: binding.invocation_id, scope: 'aggregate', gate: 'merge', status: 'passed', exit_code: 0, command: binding.command, input_hash: binding.input_hash, verification_epoch: binding.verification_epoch, profile_hash: 'profile', before_fingerprint: fingerprint, after_fingerprint: fingerprint, mutation_paths: [], check_refs: [check.canonical_ref], inputs: [], resources: { ports: {} }, required_artifacts: [...artifacts.keys()].filter(name => name !== 'debug.bin'), runner_evidence_required: contract, artifacts: [...artifacts].map(([path, bytes]) => ({ path, sha256: sha(bytes) })), finished_at: '2026-10-25T00:00:00Z' };
  const matrix = { header: { run_id: 'RUN-1' }, sources: [{ root: 'run', role: 'check_profile_target', path: 'profile.json' }, { root: 'run', role: 'receipt:quality', path: `${base}/receipt.json` }, { root: 'run', role: 'completion:quality', path: `${base}/completion.json` }, ...native.artifacts.map(ref => ({ root: 'run', role: `artifact:quality:${ref.path}`, path: `${base}/artifacts/${ref.path}`, sha256: ref.sha256 }))] };
  const decoded = new Map([['run:profile.json', { profile: { aliases: { '@check/quality': binding.command }, runner_evidence_by_alias: { '@check/quality': contract } } }], [`run:${base}/receipt.json`, native], [`run:${base}/completion.json`, { exit_code: 0, finished_at: native.finished_at }], ['run:07-merge/merge-gate-acceptance.json', { receipts: [{ id: native.id, input_hash: native.input_hash, execution_refs: native.check_refs, binding_refs: native.check_refs }] }]]);
  const proofs = [...decoded].map(([key, value]) => ({ root: 'run', path: key.slice(4), value }));
  for (const [name, bytes] of artifacts) { const file = path.join(root, base, 'artifacts', name); await mkdir(path.dirname(file), { recursive: true }); await writeFile(file, bytes); }
  const gate = { checks: [check], acceptance_refs: [], profile_hash: 'profile' };
  await assert.rejects(loadRunnerProofSources({ ...matrix, sources: [] }, proofs, () => { throw new Error('unreachable'); }), error => error.code === 'runner_proof_invalid' && error.details.reason === 'missing_or_changed_source');
  await assert.rejects(loadRunnerProofSources(matrix, proofs, () => { throw new Error('SECRET backend payload'); }), error => error.code === 'runner_proof_invalid' && error.details.reason === 'source_unavailable' && !JSON.stringify(error).includes('SECRET'));
  await assert.rejects(loadRunnerProofSources(matrix, proofs, () => null), error => error.code === 'runner_proof_invalid' && error.details.reason === 'source_not_bytes');
  for (const transport of ['snapshot', 'packet']) {
    const packet = new Map(matrix.sources.map(source => [source.path, path.join(root, source.path)]));
    const loaded = await loadRunnerProofSources(matrix, proofs, source => readFile(transport === 'snapshot' ? path.join(root, source.path) : packet.get(source.path)));
    assert.equal(loaded.size, 9); // Eight children + root, not debug or engine sidecar.
    assert.doesNotThrow(() => validateFinalCheckReceipts(matrix, gate, decoded, loaded));
    native.required_artifacts.push('debug.bin'); assert.throws(() => validateFinalCheckReceipts(matrix, gate, decoded, loaded), /execution contract differs/); native.required_artifacts.pop();
    const failed = validateRunnerProof(contract, { ...binding, invocation_id: 'foreign' }, relative => loaded.get(`run:${base}/artifacts/${relative}`));
    assert.equal(runnerEvidencePass(failed.evidence), false); assert.equal(failed.diagnostics[0].reason, 'binding_mismatch');
    loaded.delete(`run:${base}/artifacts/steps/check-7/report.json`);
    assert.throws(() => validateFinalCheckReceipts(matrix, gate, decoded, loaded), { code: 'runner_proof_invalid' });
  }
});

test('consumer-only validation changes reuse one execution and retain failed validation without rerun', async t => {
  const home = await mkdtemp(path.join(os.tmpdir(), 'cache103-')); t.after(() => rm(home, { recursive: true, force: true }));
  let executions = 0, validations = 0;
  const common = { home, executionManifest: { producer: 'fixed', executor: 'fixed' }, assess: async evidence => { executions++; await writeFile(path.join(evidence, 'report.json'), '{}'); return { report: 'retained' }; }, validate: async () => { validations++; return { status: 'passed' }; } };
  const one = await resolveFixtureValidation({ ...common, validationManifest: { reader: 'one' } });
  const [two, same] = await Promise.all([resolveFixtureValidation({ ...common, validationManifest: { reader: 'two' } }), resolveFixtureValidation({ ...common, validationManifest: { reader: 'two' } })]);
  assert.equal(executions, 1); assert.equal(validations, 2); assert.equal(two.file, same.file);
  assert.deepEqual(new Set([two.source, same.source]), new Set(['revalidated_fixture_assessment', 'reused_fixture_assessment']));
  await verifyFixtureAssessment(two, sha(JSON.stringify(common.executionManifest)));
  const bad = { ...common, validationManifest: { reader: 'bad' }, validate: async () => { throw new Error('proof rejected'); } };
  await assert.rejects(resolveFixtureValidation(bad), /proof rejected/);
  await assert.rejects(resolveFixtureValidation(bad), /validation does not qualify/);
  assert.equal(executions, 1);
  assert.notEqual(one.file, two.file);
});

test('frozen pure module bytes are bound to their source/build metadata', async () => {
  const metadata = JSON.parse(await readFile(new URL('../lib/check-runner-proof.source.json', import.meta.url)));
  assert.equal(sha(await readFile(new URL('../lib/check-runner-proof.mjs', import.meta.url))), metadata.build_sha256);
});
