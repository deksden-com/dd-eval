import { createHash } from 'node:crypto';
const sha = value => createHash('sha256').update(value).digest('hex');
export function compositeRunner(binding, contract = { schema_id: 'dd-flow/check-runner-evidence@2', path: 'quality.json' }) {
  const report = { schema_id: contract.schema_id, binding, runner: { name: 'quality', version: '1' }, completed: true, counts: { passed: 8, failed: 0, skipped: 0 }, failures: [], steps: [] }, artifacts = new Map();
  for (let ordinal = 0; ordinal < 8; ordinal++) {
    const id = `check-${ordinal}`, command = `check ${ordinal}`, command_sha256 = sha(command);
    const childBinding = { ...binding, invocation_id: `${binding.invocation_id}:step:${id}`, check_id: `${binding.check_id}/${id}`, command, input_hash: sha(JSON.stringify([binding.input_hash, command_sha256])) };
    const bytes = Buffer.from(JSON.stringify({ ...report, binding: childBinding, counts: { passed: 1, failed: 0, skipped: 0 }, steps: undefined }));
    const relative_path = `steps/${id}/report.json`; artifacts.set(relative_path, bytes);
    report.steps.push({ id, ordinal, command_sha256, state: 'passed', exit_code: 0, binding: childBinding, report: { relative_path, sha256: sha(bytes) } });
  }
  artifacts.set(contract.path, Buffer.from(JSON.stringify(report))); artifacts.set('engine-outcome.json', Buffer.from('{}'));
  return { contract, report, artifacts };
}
