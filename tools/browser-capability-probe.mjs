import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import { createHash } from 'node:crypto';
import os from 'node:os';
import path from 'node:path';

// An isolated static select: no product server, database or model is involved.
const project = process.argv[2];
const require = createRequire(path.join(project, 'apps/web/package.json'));
let identity;
try {
  const playwright = require.resolve('@playwright/test');
  const implementation = createRequire(playwright).resolve('playwright');
  const core = createRequire(implementation).resolve('playwright-core');
  const root = path.dirname(core);
  let registry;
  try { ({ registry } = require(path.join(root, 'lib/coreBundle.js'))); }
  catch (error) { if (error.code !== 'MODULE_NOT_FOUND') throw error; ({ registry } = require(path.join(root, 'lib/server/registry/index.js'))); }
  registry = registry.registry ?? registry;
  const executable = registry.findExecutable('chromium-headless-shell').executablePath();
  const binaryHash = createHash('sha256');
  for await (const chunk of createReadStream(executable)) binaryHash.update(chunk);
  const version = JSON.parse(await readFile(path.join(root, 'package.json'))).version;
  identity = { platform: process.platform, os_release: os.release(), arch: process.arch,
    executable, executable_sha256: binaryHash.digest('hex'),
    driver: 'playwright', driver_version: version, transport: 'cdp',
    launch: { headless: true, args: [], locale: 'en-US' },
    operation: { control: 'native-select', sequence: ['focus', 'ArrowDown', 'Enter'], initial: 'none', expected: 'low' } };
  if (process.argv.includes('--identity-only')) process.stdout.write(JSON.stringify({ identity }));
  else {
    const { chromium } = require(core);
    const browser = await chromium.launch({ headless: true, executablePath: executable });
    try {
      const page = await browser.newPage({ locale: 'en-US' });
      await page.setContent('<label for="priority">Priority</label><select id="priority"><option value="none">None</option><option value="low">Low</option></select>');
      await page.locator('select').focus();
      await page.keyboard.press('ArrowDown'); await page.keyboard.press('Enter');
      const actual = await page.locator('select').inputValue();
      process.stdout.write(JSON.stringify({ identity, probe_executed: true, outcome: actual === 'low' ? 'supported' : 'unsupported', observed_value: actual }));
    } finally { await browser.close(); }
  }
} catch (error) {
  // Unknown is evidence of missing qualification, never a platform-wide skip.
  process.stdout.write(JSON.stringify({ ...(identity ? { identity } : {}), probe_executed: false, outcome: 'unknown', reason: error?.code === 'MODULE_NOT_FOUND' ? 'driver_unavailable' : 'probe_unavailable', error_code: /^[A-Z_0-9]{1,80}$/.test(error?.code ?? '') ? error.code : 'PROBE_ERROR' }));
}
