import { mkdir, cp } from 'node:fs/promises';
import path from 'node:path';

/** Synthetic engine fixtures explicitly carry the maintenance ABI they claim.
 * Production runtime selection never imports this fixture or a source checkout. */
export async function installMaintenanceFixture(runtimeRoot) {
  const target = path.join(runtimeRoot, 'harness-runtime', 'lib');
  await mkdir(target, { recursive: true });
  for (const name of ['lease-renewal', 'managed-daemon']) await cp(new URL(`./maintenance-${name}.mjs`, import.meta.url), path.join(target, `${name}.mjs`));
}
