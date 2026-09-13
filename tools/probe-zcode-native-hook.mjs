// Native hook / marker fixture. Only writes experiment evidence under mkdtemp.
import { appendFileSync, closeSync, openSync, writeSync, fsyncSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
const evidence = process.env.DD_ZCODE_HOOK_PROBE_DIR;
if (!evidence || !path.basename(evidence).startsWith('dd-native-hook-')) { console.log('{}'); process.exit(0); }
const log = event => appendFileSync(path.join(evidence, 'native-hook.jsonl'), `${JSON.stringify({ at: Date.now(), ...event })}\n`);
if (process.argv[2] === 'execute') {
  const [role, mode] = process.argv.slice(3);
  const idIndex = process.argv.indexOf('--hook-event-id');
  log({ kind: 'executed', role, mode, receipt: idIndex < 0 ? null : process.argv[idIndex + 1] });
  console.log(`NATIVE_HOOK_MARKER ${role} ${mode} receipt=${idIndex < 0 ? 'MISSING' : process.argv[idIndex + 1]}`);
} else {
  let raw = '';
  for await (const chunk of process.stdin) raw += chunk;
  const input = JSON.parse(raw);
  log({ kind: 'hook_seen', session: input.session_id ?? input.sessionId, cwd: input.cwd, command: input.tool_input?.command ?? input.toolInput?.command });
  if (path.resolve(input.cwd ?? '/') !== path.resolve(evidence)) { console.log('{}'); process.exit(0); }
  const command = input.tool_input?.command ?? input.toolInput?.command ?? '';
  const match = / execute (root|child) (rewrite|deny|error)\s*$/.exec(command);
  if (!match) { console.log('{}'); process.exit(0); }
  const [, role, mode] = match;
  log({ kind: 'hook_enter', role, mode, input });
  if (mode === 'deny') { log({ kind: 'hook_deny', role, mode }); process.stderr.write('Intentional diagnostic denial; do not retry.\n'); process.exit(2); }
  if (mode === 'error') { log({ kind: 'hook_error', role, mode }); process.stderr.write('Intentional diagnostic ordinary error; do not retry.\n'); process.exit(1); }
  await new Promise(resolve => setTimeout(resolve, 1000));
  const id = randomUUID();
  const record = { kind: 'receipt_saved', at: Date.now(), role, mode, receipt: id, session: input.session_id ?? input.sessionId, tool: input.tool_use_id ?? input.toolUseId };
  const fd = openSync(path.join(evidence, 'native-hook.jsonl'), 'a');
  try { writeSync(fd, `${JSON.stringify(record)}\n`); fsyncSync(fd); } finally { closeSync(fd); }
  console.log(JSON.stringify({ hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'allow', updatedInput: { ...(input.tool_input ?? input.toolInput), command: `${command} --hook-event-id ${id}` } } }));
}
