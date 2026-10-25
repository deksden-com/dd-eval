import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { assertCheckpointEngine, verifyEngineArtifact, assertVerificationMatrixQualification } from '../lib/engine-admission.mjs';
import { matrixComponentFingerprint } from '../lib/verification-components.mjs';

// Pure artifact equivalence, never a new fixture/model call or an edit to the
// original RUN, checkpoint, engine image, or publication receipt.
const argument = name => {
  const index = process.argv.indexOf(name);
  assert.ok(index > 0 && process.argv[index + 1], `required ${name}`);
  return path.resolve(process.argv[index + 1]);
};
const file = argument('--checkpoint'), output = argument('--output');
assert.equal(path.dirname(output), path.dirname(file), 'write the supplement next to its retained source checkpoint');
const source = JSON.parse(await readFile(argument('--source-engine'), 'utf8'));
const target = JSON.parse(await readFile(argument('--target-engine'), 'utf8'));
const checkpoint = { file, value: JSON.parse(await readFile(file, 'utf8')) };
await assertCheckpointEngine(checkpoint, source, { checker: 'task-priority@4' });
await verifyEngineArtifact(target);
const ref = checkpoint.value.flow_pack.verification_matrix;
const originalBytes = await readFile(path.resolve(path.dirname(file), ref.file));
const original = JSON.parse(originalBytes);
assert.equal(original.schema_id, 'dd-eval/verification-matrix-qualification@3', 'component-bound proofs can already be reused unchanged');
const inventory = await readFile(path.join(target.snapshot_root, 'dist/verification-components.json'));
const oldComponent = await matrixComponentFingerprint(source.snapshot_root, inventory);
const component = await matrixComponentFingerprint(target.snapshot_root);
assert.equal(oldComponent, component, 'technical matrix inputs changed; only their offline qualification is required');
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const receipt = { ...original, schema_id: 'dd-eval/verification-matrix-qualification@4', component_sha256: component,
  equivalence: { legacy_receipt: { path: ref.file, sha256: ref.sha256 }, source_engine_artifact_sha256: original.engine_artifact_sha256,
    target_engine_artifact_sha256: target.integrity?.checksum ?? target.integrity_checksum, component_inventory_sha256: sha(inventory) } };
const bytes = Buffer.from(JSON.stringify(receipt, null, 2) + '\n');
await assertVerificationMatrixQualification({ ...checkpoint, value: { ...checkpoint.value, flow_pack: { ...checkpoint.value.flow_pack,
  verification_matrix: { ...ref, file: path.basename(output), sha256: sha(bytes) } } } }, target, { checker: 'task-priority@4' }, bytes);
await writeFile(output, bytes, { flag: 'wx' });
process.stdout.write(JSON.stringify({ status: 'passed', file: output, sha256: sha(bytes), source: 'verified-artifact-equivalence', fixture_calls: 0, model_calls: 0 }) + '\n');
