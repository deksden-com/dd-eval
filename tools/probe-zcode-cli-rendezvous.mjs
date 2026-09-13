// Bounded native diagnostic. No dd-flow mutations or user configuration changes.
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, rename } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import os from 'node:os';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { AcpBridge } from '../../dd-flow-cli/src/harness-runtime/lib/dd-zcode.mjs';

if (process.argv[2] === 'wait') {
  const [, , , directory, token] = process.argv;
  const started = Date.now();
  await writeFile(path.join(directory, `${token}.started.json`), JSON.stringify({ started }));
  let receipt;
  while (Date.now() - started < 20000) {
    try { receipt = JSON.parse(await readFile(path.join(directory, `${token}.receipt.json`), 'utf8')); break; }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
    await delay(50);
  }
  assert.equal(receipt?.token, token, 'No exact native receipt before timeout');
  const result = { started, executed: Date.now(), receipt };
  await writeFile(path.join(directory, `${token}.result.json`), JSON.stringify(result));
  console.log(JSON.stringify(result));
} else {
  const cwd = await mkdtemp(path.join(os.tmpdir(), 'dd-zcode-rendezvous-'));
  const script = fileURLToPath(import.meta.url);
  const cases = ['root', 'child'].map(role => {
    const token = randomUUID();
    return { role, token, command: `node '${script}' wait '${cwd}' '${token}'` };
  });
  const seen = new Set();
  let sessionId;
  const bridge = new AcpBridge({
    bin: '/Users/deksden/Library/pnpm/zcode-acp', cwd,
    journal: path.join(cwd, 'adapter.events.jsonl'), permission: 'allow',
    onNotification: async message => {
      const update = message.params?.update;
      if (update?.sessionUpdate !== 'tool_call') return;
      const command = update.rawInput?.command ?? update.rawInput?.cmd;
      const probe = cases.find(item => item.command === command);
      if (!probe || seen.has(probe.token)) return;
      seen.add(probe.token);
      const observed = Date.now();
      // Wait for the CLI to be demonstrably active before acknowledging it.
      const deadline = Date.now() + 10000;
      while (true) {
        try { await readFile(path.join(cwd, `${probe.token}.started.json`)); break; }
        catch (error) { if (error.code !== 'ENOENT' || Date.now() >= deadline) throw error; }
        await delay(50);
      }
      await delay(1000);
      const receipt = { token: probe.token, role: probe.role, observed, confirmed: Date.now(),
        session: update._meta?.zcodeRuntime?.childSessionId ?? message.params.sessionId,
        tool: update.toolCallId, metadata: update._meta?.zcodeRuntime ?? null };
      const target = path.join(cwd, `${probe.token}.receipt.json`);
      await writeFile(`${target}.tmp`, JSON.stringify(receipt));
      await rename(`${target}.tmp`, target);
      console.log(JSON.stringify({ receipt }));
    },
  });
  console.log(JSON.stringify({ cwd, cases }));
  try {
    await bridge.start();
    ({ sessionId } = await bridge.request('session/new', { cwd, mcpServers: [] }, 30000));
    const prompt = `Bounded diagnostic in an empty temporary directory. Do not inspect files or run any other commands. First use Bash yourself to run exactly: ${cases[0].command}\nThen create exactly ONE foreground subagent whose sole task is to use Bash once to run exactly: ${cases[1].command}\nThese commands intentionally wait briefly; do not interrupt or retry them. Wait for the child and answer DONE. No background tasks.`;
    const response = await bridge.request('session/prompt', { sessionId, prompt: [{ type: 'text', text: prompt }] }, 180000);
    await bridge.flush();
    const results = await Promise.all(cases.map(async probe => JSON.parse(await readFile(path.join(cwd, `${probe.token}.result.json`), 'utf8'))));
    for (const result of results) {
      assert.ok(result.receipt.tool);
      assert.ok(result.started < result.receipt.confirmed);
      assert.ok(result.receipt.confirmed <= result.executed);
    }
    assert.equal(results[0].receipt.session, sessionId);
    assert.notEqual(results[1].receipt.session, sessionId);
    assert.ok(results[1].receipt.session);
    console.log(JSON.stringify({ status: 'PASS', sessionId, response, results,
      topology: await bridge.request('zcode/session/subagents', { sessionId }, 15000) }));
  } finally {
    if (sessionId) bridge.notify('session/cancel', { sessionId });
    await bridge.close();
  }
}
