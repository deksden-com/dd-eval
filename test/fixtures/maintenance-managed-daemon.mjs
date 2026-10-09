import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { RENEWAL_POLICY } from './lease-renewal.mjs';
export async function runtimeProcess(config, action, options = {}, { timeoutMs = RENEWAL_POLICY.budgetMs, signal } = {}) {
  const args = ['runtime', 'process', action];
  for (const [name, value] of Object.entries(options)) if (value !== undefined && value !== null) args.push(`--${name}`, String(value));
  args.push('--json');
  const script = /\.[cm]?js$/.test(config.ddFlowBin);
  const { stdout } = await promisify(execFile)(script ? process.execPath : config.ddFlowBin, [...(script ? [config.ddFlowBin] : []), ...args], { cwd: config.cwd, env: { ...process.env, ...config.env, DD_FLOW_HOME: config.ddFlowHome, DD_FLOW_RESOURCE_HOME: config.resourceHome }, timeout: timeoutMs, signal });
  const receipt = JSON.parse(stdout);
  if (receipt.ok === false && receipt.error?.code) throw Object.assign(new Error(receipt.error.message), receipt.error);
  return receipt;
}
