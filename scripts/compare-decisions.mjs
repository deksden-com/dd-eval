import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { parseEnv } from 'node:util';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { lunaDecisionRequest, requestLunaDecision } from '../lib/luna-decisions.mjs';
import { jevRequest, requestJev } from '../lib/hitl-coverage.mjs';

// Explicit output directory and packet paths; never reads or changes EVAL state.
const [out, ...files] = process.argv.slice(2);
if (!out || !files.length) throw new Error('Usage: node scripts/compare-decisions.mjs OUTPUT PACKET...');
const env = async file => parseEnv(await readFile(file, 'utf8'));
const openaiKey = process.env.OPENAI_DECISIONS_API_KEY ?? (await env('/Users/deksden/Documents/_Projects/dd-flow-cli/.env')).OPENAI_DECISIONS_API_KEY;
const routerKey = process.env.OPENROUTER_API_KEY ?? (await env('/Users/deksden/Documents/_Projects/docoved-agent/.env')).OPENROUTER_API_KEY;
if (!openaiKey && !routerKey) throw new Error('Missing both comparison credentials');
const policy = { requested_model: 'typesafe/jev-1.13', resolved_model: 'typesafe/jev-1.13-20260917', provider: 'TypeSafe' };
const rows = [];
await mkdir(out, { recursive: true });
for (const file of files) {
  const packet = JSON.parse(await readFile(file, 'utf8'));
  for (const variant of ['real', 'smtp-gap']) {
    const luna = lunaDecisionRequest(packet), jev = jevRequest(packet, policy);
    // Mutate only the experimental semantic projection, not the grounded packet.
    if (variant === 'smtp-gap') {
      jev.state.question += '\n\nДополнительное обязательное решение: какой SMTP-провайдер использовать для отправки уведомлений по электронной почте, и где хранить его учётные данные?';
      luna.input = JSON.stringify(jev.state);
    }
    const sha = createHash('sha256').update(JSON.stringify(jev.state)).digest('hex');
    // Alternate order to avoid a systematic first-request advantage.
    const calls = rows.length % 2 ? ['jev', 'luna'] : ['luna', 'jev'];
    const observations = {};
    for (const provider of calls) {
      observations[provider] = provider === 'luna'
        ? await requestLunaDecision(luna, { key: openaiKey })
        : await requestJev(jev, policy, { key: routerKey });
    }
    rows.push({ source: file, variant, expected_uncovered: variant === 'smtp-gap' ? true : null,
      input_sha256: sha, input: jev.state, observations });
    await writeFile(path.join(out, 'results.json'), JSON.stringify(rows, null, 2) + '\n', { mode: 0o600 });
    console.log(JSON.stringify({ source: file.match(/EVAL-[^/]+/)?.[0], variant,
      observations: Object.fromEntries(Object.entries(observations).map(([k, v]) => [k, { state: v.state, p: v.probability, ms: Math.round(v.latency_ms ?? 0), reason: v.reason, usage: v.response?.usage }])) }));
  }
}
