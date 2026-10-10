import path from 'node:path';
import { commandJson } from './process-json.mjs';

const fail = (message, details = { effect: 'no_effect' }) => { throw Object.assign(new Error(message), { code: 'memory_setup_invalid', details }); };
export function validateMemorySetup(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).some(key => !['canonSource', 'trustFile', 'channel'].includes(key))
    || ![value.canonSource, value.trustFile].every(item => typeof item === 'string' && path.isAbsolute(item))
    || value.channel !== undefined && !['stable', 'preview', 'development'].includes(value.channel)) fail('Memory setup requires explicit absolute canon source and trust file');
  return value;
}

/** Setup owns signatures, archive validation, activation and exact replay.
 * This client checks case identity, never manufactures a trusted selection. */
export async function setupMemoryRuntime({ bin, env, projectRoot, runtimeRoot, declaration, checkpoint, requestId }) {
  validateMemorySetup(declaration);
  if (typeof runtimeRoot !== 'string' || !path.isAbsolute(runtimeRoot) || !checkpoint?.flow_pack || checkpoint.flow_pack.delivery !== 'installed_canon'
    || !/^[a-f0-9]{40}$/.test(checkpoint.flow_pack.commit ?? '') || typeof checkpoint.flow_pack.memory_bank_version !== 'string' || typeof checkpoint.flow_pack.engine?.version !== 'string') fail('Memory setup requires its private runtime and installed-canon checkpoint');
  const relative = path.relative(projectRoot, runtimeRoot);
  if (relative === '' || relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative)) fail('Memory setup Home must be outside the product workspace');
  const scoped = { ...env, DD_FLOW_HOME: runtimeRoot, DD_FLOW_CONFIG_HOME: runtimeRoot };
  const result = await commandJson(bin, ['setup', '--canon-source', declaration.canonSource, '--trust-file', declaration.trustFile,
    '--request-id', requestId, '--skip-agent-setup', '--non-interactive', ...(declaration.channel ? ['--channel', declaration.channel] : [])], { cwd: projectRoot, env: scoped });
  const manifest = result?.installation?.manifest;
  if (result?.installation_readiness !== 'installed' || manifest?.canon?.commit !== checkpoint.flow_pack.commit
    || manifest.canon.version !== checkpoint.flow_pack.memory_bank_version || manifest?.engine?.version !== checkpoint.flow_pack.engine?.version)
    fail('Installed Memory canon/engine does not match the pinned case checkpoint', {
      effect: result?.installation_readiness === 'installed' ? 'committed' : 'unknown',
      runtime_root: runtimeRoot,
      request_id: requestId
    });
  return result;
}
