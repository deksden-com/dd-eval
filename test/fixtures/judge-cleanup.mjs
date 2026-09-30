import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { finishJudgeCleanup } from '../../lib/judge-cleanup.mjs';

export async function settledJudge(root, verdict) {
  const stateDir = path.join(root, 'daemon');
  await mkdir(stateDir, { recursive: true });
  await writeFile(path.join(root, 'result.json'), JSON.stringify(verdict));
  const state = { daemon_id: 'offline-daemon', pid: 2147483647, config: { cwd: root }, shutdown_state: 'running', active_tree: false };
  await writeFile(path.join(stateDir, 'daemon.json'), JSON.stringify(state));
  return finishJudgeCleanup({ root, profileId: verdict.profile_id, stop: async operationId => {
    await writeFile(path.join(stateDir, 'daemon.json'), JSON.stringify({ ...state, shutdown_state: 'clean', shutdown: { schema_id: 'dd-flow/daemon-shutdown@1', daemon_id: state.daemon_id, result: { clean: true }, required_phases: ['tree', 'provider_close', 'daemon_resource'], phases: { tree: true, provider_close: true, daemon_resource: true } } }));
    const result = { stopped: true, clean: true, shutdown_contract: 'dd-flow/daemon-shutdown@1' };
    const operation = path.join(stateDir, 'operations', createHash('sha256').update(operationId).digest('hex'));
    await mkdir(operation, { recursive: true });
    await writeFile(path.join(operation, 'requested.json'), JSON.stringify({ operation_id: operationId, operation: 'daemon.stop', daemon_id: state.daemon_id }));
    await writeFile(path.join(operation, 'result.json'), JSON.stringify({ state: 'completed', result }));
    return result;
  } });
}
