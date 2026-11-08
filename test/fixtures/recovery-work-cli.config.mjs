import path from 'node:path';
import { fileURLToPath } from 'node:url';

const cli = process.env.DD_EVAL_RECOVERY_CLI_ROOT;
if (!cli || !path.isAbsolute(cli)) throw new Error('Select the exact built CLI checkout');
export default {
  resolve: { alias: { '@cli': cli, vitest: path.join(cli, 'node_modules/vitest/dist/index.js') } },
  test: { include: [fileURLToPath(new URL('./recovery-work-cli.vitest.ts', import.meta.url))],
    reporters: ['verbose'], pool: 'forks', fileParallelism: false, maxWorkers: 1, retry: 0,
    testTimeout: 600_000, hookTimeout: 240_000 }
};
