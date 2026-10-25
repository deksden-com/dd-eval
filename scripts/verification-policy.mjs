import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';

const zones = [
  [/model-observations/, /model-observations|runner-execution-contract/],
  [/^operation-errors\.mjs$/, /operation-errors|capacity-policy/],
  [/^check-diagnostic\.mjs$/, /check-diagnostic086|browser-capabilities103/],
  [/^capacity-policy\.mjs$/, /capacity-policy|judge-capacity|capacity-transcript|semantic-decisions/],
  [/^(?:decision-transport|semantic-decisions)\.mjs$/, /semantic-decisions/],
  [/^native-failure-evidence\.mjs$/, /native-failure083/],
  [/browser-capabilit|entry-pack/, /browser-capabilit|entry-pack/],
  [/check-runner-proof|runner-proof-sources|sync-runner-proof|case-acceptance|composite-runner103/, /case-acceptance|runner-proof103|engine-admission/],
  [/baseline-admission|fixture-assessment|world-readiness|check-resources/, /baseline-admission|fixture-assessment102|fixture-validation103|check-resources|runner-compatibility101/],
  [/engine-admission|verification-components|(?:qualify|rebind)-verification-matrix/, /engine-admission|verification-components(?:102|103)/],
  [/hitl|coverage|judge|decision/, /hitl|coverage|judge|decision/],
  [/retirement|cleanup|process|daemon|lease|runner-lock|qualification-owner|qualification-intent|qualification-recovery/, /retirement|cleanup|process|daemon|lease|runner-lock|qualification-owner|qualification-intent|qualification-recovery/],
  [/runner\.mjs|eval-resume|eval-worker|execution|canonical|comparison|compare|run-specify/, /runner-native|comparison-admission|runner-resume|canonical|fork|stop-after/],
  [/verification-policy|verification\.mjs/, /verification-policy102/],
];
const git = (...args) => execFileSync('git', args, { encoding: 'utf8' }).trimEnd();
export function verificationSelection(base = git('merge-base', 'HEAD', 'origin/main')) {
  const paths = [...new Set([...git('diff', '--name-only', '--no-renames', '-z', base, '--').split('\0'), ...git('ls-files', '--others', '--exclude-standard', '-z').split('\0')].filter(Boolean))].sort();
  const available = git('ls-files', '--cached', '--others', '--exclude-standard', '-z').split('\0').filter(file => /^test\/[^/]+\.test\.mjs$/.test(file));
  const tests = new Set(), reasons = [];
  for (const file of paths) {
    if (/^(?:README|CHANGELOG)|^(?:runbooks|specs)\/.*\.md$/.test(file)) continue;
    if (available.includes(file)) { tests.add(file); continue; }
    if (/^(?:cases|schemas|profiles|checkpoints)\//.test(file)) {
      for (const test of available.filter(file => /definition|case-acceptance|baseline-admission/.test(file))) tests.add(test);
      reasons.push({ file, owner: 'definitions' }); continue;
    }
    if (file === 'package.json') {
      const current = JSON.parse(fs.readFileSync(file)), previous = JSON.parse(git('show', `${base}:${file}`));
      delete current.version; delete previous.version;
      if (JSON.stringify(current) === JSON.stringify(previous)) continue;
      // Script wiring is exercised by the policy's own tests. Runtime/dependency
      // changes require explicit ownership instead of a fallback whole suite.
      delete current.scripts; delete previous.scripts;
      assert.deepEqual(current, previous, 'classify changed EVAL dependencies before verification');
      tests.add('test/verification-policy102.test.mjs'); continue;
    }
    const match = zones.find(([source]) => source.test(path.basename(file)));
    assert.ok(match, `Unclassified EVAL impact: ${file}; declare affected contracts in scripts/verification-policy.mjs`);
    const consumers = available.filter(test => match[1].test(path.basename(test)) && (!test.includes('/installed-') || paths.includes(test)));
    assert.ok(consumers.length, `No contracts for ${file}`);
    consumers.forEach(file => tests.add(file)); reasons.push({ file, owner: String(match[0]) });
  }
  return { schema_id: 'dd-eval/verification-selection@1', base, head: git('rev-parse', 'HEAD'), paths, files: [...tests].sort(), reasons, status: tests.size ? 'required' : 'not_required' };
}

export function contractKey(file) {
  const owners = zones.filter(([, consumer]) => consumer.test(path.basename(file)));
  const all = [...new Set(git('ls-files', '--cached', '--others', '--exclude-standard', '-z').split('\0').filter(Boolean))].sort();
  const common = /^(?:lib\/(?:process-json|operation-errors|runner-events|managed-daemon|runtime-maintenance|runner-lock|observation-clock)|scripts\/verification)/;
  const inputs = all.filter(input => input === file || input === 'package.json' || common.test(input) || input.startsWith('test/fixtures/')
    || owners.some(([source]) => source.test(path.basename(input)))
    || /case-acceptance|case-definition/.test(file) && /^(?:cases|schemas)\//.test(input));
  const hash = createHash('sha256').update(JSON.stringify({ file, node: process.version, platform: process.platform, arch: process.arch,
    environment: Object.fromEntries(Object.keys(process.env).filter(key => /^DD_EVAL_(TEST_|PROBE_|LEGACY_REPORT_DIR$)/.test(key)).sort().map(key => [key, createHash('sha256').update(process.env[key]).digest('hex')])) }));
  for (const input of inputs) {
    const stat = fs.lstatSync(input);
    assert.ok(stat.isFile() && !stat.isSymbolicLink(), `unsafe verification input: ${input}`);
    let bytes = fs.readFileSync(input);
    if (input === 'package.json') { const value = JSON.parse(bytes); delete value.version; bytes = Buffer.from(JSON.stringify(value)); }
    hash.update(JSON.stringify([input, stat.mode & 0o111])).update(bytes);
  }
  return hash.digest('hex');
}
