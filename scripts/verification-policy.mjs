import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';

const zones = [
  [/snapshot-observation/, /recovery-finalization105|runner-recovery|cleanup-observation/],
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
  [/retirement|cleanup|process|daemon|lease|runner-lock|qualification-owner|qualification-intent|qualification-recovery/, /retirement|cleanup|process|daemon|lease|runner-lock|qualification-owner|qualification-intent|qualification-recovery|admission104/],
  [/runner\.mjs|eval-resume|eval-worker|execution|canonical|comparison|compare|run-specify/, /runner-native|comparison-admission|runner-resume|runner-control|runner-recovery|runner-execution-contract|recovery-finalization105|managed-resume|canonical|fork|stop-after/],
  [/verification-policy|verification\.mjs|verification-jobs/, /verification-policy102|verification104/],
  [/case-definition/, /definition|case-acceptance|baseline-admission/],
];
// The control/recovery tests exercise these shared runner helpers directly.
// Keep their explicit closure local; unrelated libs are not a whole-suite key.
const controlContracts = ['test/runner-control.test.mjs','test/managed-resume.test.mjs','test/recovery-finalization105.test.mjs'];
const controlInputs = ['lib/runner.mjs','lib/eval-retirement.mjs','lib/eval-resume-worker.mjs','lib/cleanup-observation.mjs','lib/snapshot-observation.mjs','lib/recovery-safety.mjs','lib/execution-state.mjs','lib/execution-contract.mjs','lib/entry-pack.mjs','lib/engine-admission.mjs','lib/baseline-admission.mjs','lib/runtime-maintenance.mjs','lib/managed-flow-client.mjs','lib/homes.mjs','lib/hitl-contract.mjs','lib/hitl-retained.mjs','lib/native-failure-evidence.mjs','lib/driver-recovery.mjs','lib/operation-context.mjs'];
const repoGit = (root, ...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio:['ignore','pipe','pipe'] }).trimEnd();
const sha = value => createHash('sha256').update(typeof value === 'string' ? value : JSON.stringify(value)).digest('hex');
export function verificationSelection(base = null, { root = process.cwd(), env = process.env } = {}) {
  const git = (...args) => repoGit(root, ...args);
  if (!base) {
    try { base = git('merge-base', 'HEAD', 'origin/main'); }
    catch { base = git('rev-list', '--max-parents=0', 'HEAD').split('\n')[0]; }
  }
  const paths = [...new Set([...git('diff', '--name-only', '--no-renames', '-z', base, '--').split('\0'), ...git('ls-files', '--others', '--exclude-standard', '-z').split('\0')].filter(Boolean))].sort();
  const available = git('ls-files', '--cached', '--others', '--exclude-standard', '-z').split('\0').filter(file => /^test\/[^/]+\.test\.mjs$/.test(file));
  const tests = new Set(), reasons = [];
  for (const file of paths) {
    if (/^(?:README|CHANGELOG)|^(?:runbooks|specs)\/.*\.md$/.test(file)) continue;
    if (available.includes(file)) { tests.add(file); continue; }
    if (controlInputs.includes(file)) controlContracts.filter(test=>available.includes(test)).forEach(test=>tests.add(test));
    if (file==='lib/runner.mjs' && available.includes('test/baseline-admission.test.mjs')) tests.add('test/baseline-admission.test.mjs');
    if (/^(?:cases|schemas|profiles|checkpoints)\//.test(file)) {
      for (const test of available.filter(file => /definition|case-acceptance|baseline-admission/.test(file))) tests.add(test);
      reasons.push({ file, owner: 'definitions' }); continue;
    }
    if (file === 'package.json') {
      const current = JSON.parse(fs.readFileSync(path.join(root, file))), previous = JSON.parse(git('show', `${base}:${file}`));
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
    const consumers = [...new Set([...available.filter(test => match[1].test(path.basename(test)) && (!test.includes('/installed-') || paths.includes(test))), ...(controlInputs.includes(file)?controlContracts.filter(test=>available.includes(test)):[])])];
    assert.ok(consumers.length, `No contracts for ${file}`);
    consumers.forEach(file => tests.add(file)); reasons.push({ file, owner: String(match[0]) });
  }
  const files = [...tests].sort();
  return { schema_id: 'dd-eval/verification-selection@2', base, head: git('rev-parse', 'HEAD'), paths, files, reasons,
    required_contracts: files.map(file => contractDescriptor(file, { root, env })), status: tests.size ? 'required' : 'not_required' };
}

const processHelpers = ['lib/process-json.mjs','lib/operation-errors.mjs','lib/runner-events.mjs','lib/managed-daemon.mjs','lib/runtime-maintenance.mjs','lib/runner-lock.mjs','lib/process-snapshot.mjs','lib/observation-clock.mjs'];
const fixtureOwners = [
  [/maintenance-/, /baseline-admission|e2e-reliability|runner|retirement|control|managed|lease|admission|engine-admission/],
  [/capacity-policy\.mjs|judge-cleanup\.mjs/, /capacity|hitl|judge|semantic|eval\.test|runner|control|managed|recovery-finalization105/],
  [/composite-runner/, /case-acceptance|engine-admission|runner-proof|composite-runner/],
  [/hitl-/, /hitl|coverage|judge|canonical/],
  [/memory-upgrade\//, /memory-upgrade/],
  [/memory-grounding\//, /memory-grounding/],
  [/diagnostic\//, /diagnostic/],
  [/intent-preservation/, /intent-preservation/],
  [/migration-proof/, /judge-supplement|migration/],
  [/check-proof-limits/, /check-runner|runner-proof/],
];
export function contractDescriptor(file, { root = process.cwd(), env = process.env } = {}) {
  assert.match(file, /^test\/[A-Za-z0-9_.-]+\.test\.mjs$/);
  const owners = zones.filter(([, consumer]) => consumer.test(path.basename(file)));
  assert.ok(owners.length, `Unclassified EVAL contract: ${file}; declare source/test ownership`);
  const all = [...new Set(repoGit(root, 'ls-files', '--cached', '--others', '--exclude-standard', '-z').split('\0').filter(Boolean))].sort();
  const technical = /verification-policy102|verification104/.test(file);
  const processConsumer = /runner|recovery|baseline|fixture-validation|admission|capacity|judge|hitl|control|managed|lease|retirement|cleanup|process|semantic/.test(file);
  const fixtures = all.filter(input => input.startsWith('test/fixtures/') && fixtureOwners.some(([pattern, consumer]) => pattern.test(input.slice('test/fixtures/'.length)) && consumer.test(file)));
  const inputs = [...new Set([file, ...fixtures, ...(processConsumer ? processHelpers : []), ...(controlContracts.includes(file)?controlInputs:[]), ...(file==='test/baseline-admission.test.mjs'?['lib/runner.mjs']:[]), ...all.filter(input =>
    /^(lib|bin)\//.test(input) && owners.some(([source]) => source.test(path.basename(input)))
    || technical && /^(?:scripts\/verification(?:-policy)?\.mjs|tools\/verification-jobs\.mjs)$/.test(input)
    || /case-acceptance|case-definition|memory-case-definition|hitl105/.test(file) && /^(?:cases|schemas)\//.test(input))])].sort();
  const records = inputs.map(input => {
    const absolute = path.join(root, input), stat = fs.lstatSync(absolute, { throwIfNoEntry: false });
    if (!stat) return [input, 'absent'];
    assert.ok(stat.isFile() && !stat.isSymbolicLink(), `unsafe verification input: ${input}`);
    return [input, stat.mode & 0o111, sha(fs.readFileSync(absolute))];
  });
  const pkgFile = path.join(root,'package.json'), pkg = fs.existsSync(pkgFile) ? JSON.parse(fs.readFileSync(pkgFile)) : {};
  const lockFile = path.join(root,'package-lock.json');
  const lock = fs.existsSync(lockFile) ? JSON.parse(fs.readFileSync(lockFile)) : null;
  const dependencies = { dependencies: pkg.dependencies, devDependencies: pkg.devDependencies,
    packages: lock ? Object.entries(lock.packages ?? {}).filter(([name])=>name).map(([name,p])=>[name,{version:p.version,integrity:p.integrity,dependencies:p.dependencies,optionalDependencies:p.optionalDependencies}]) : null,
    ...(technical ? { scripts: pkg.scripts } : {}) };
  const declaration = owners.map(([source,consumer])=>[source.source,consumer.source]);
  const runner = { command:'node', args:['--test','--test-concurrency=1','--test-reporter=tap'] };
  const executionKey = sha({ file, records, declaration, dependencies, runner, node:process.version, platform:process.platform, arch:process.arch,node_options:env.NODE_OPTIONS??null,
    environment:Object.fromEntries(Object.keys(env).filter(key=>/^DD_EVAL_(TEST_|PROBE_|LEGACY_REPORT_DIR$)/.test(key)).sort().map(key=>[key,sha(env[key])])) });
  const reader = path.join(root,'scripts/verification.mjs'), helper = path.join(root,'tools/verification-jobs.mjs');
  const validationKey = sha({ format:'complete-tap@2',reader:fs.existsSync(reader)?sha(fs.readFileSync(reader)):null,helper:fs.existsSync(helper)?sha(fs.readFileSync(helper)):null });
  return { id:`eval:${path.basename(file)}`, files:[file], inputs, execution_key:executionKey, validation_key:validationKey,
    declaration_sha256:sha(declaration), runner, execution_class:technical || /fixture-assessment102/.test(file) ? 'isolated':'exclusive', prerequisites:[] };
}
export function contractKey(file, options) { return contractDescriptor(file, options).execution_key; }
