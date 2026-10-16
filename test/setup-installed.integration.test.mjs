import assert from 'node:assert/strict';
import { createHash, generateKeyPairSync, sign } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import { setupMemoryRuntime } from '../lib/memory-runtime-setup.mjs';

const bindings = ['DD_EVAL_TEST_SETUP_CLI', 'DD_EVAL_TEST_SETUP_CANON_ARCHIVE',
  'DD_EVAL_TEST_SETUP_ENGINE_ARCHIVE', 'DD_EVAL_TEST_SETUP_CONSOLE_ROOT'];
const configured = bindings.every(key => process.env[key]);
if (process.env.DD_EVAL_REQUIRE_SETUP === '1') {
  for (const key of bindings) assert(process.env[key] && path.isAbsolute(process.env[key]), `${key} requires an absolute installed candidate input`);
}
const digest = bytes => createHash('sha256').update(bytes).digest('hex');

// Private fixture authority tests installation mechanics, not native route
// qualification. No public signing key, release, model or account is used.
// Several bounded setup/replay commands precede asynchronous Console startup
// and owned shutdown. The outer guard must not cancel that cleanup mid-flight;
// individual command and HTTP deadlines below remain unchanged.
test('installed setup and Console observation preserve isolated producer boundaries', { skip: !configured, timeout: 600_000 }, async t => {
  const cli = fs.realpathSync(process.env.DD_EVAL_TEST_SETUP_CLI);
  const packageRoot = path.dirname(path.dirname(cli));
  assert.equal(path.basename(packageRoot), 'dd-flow-cli');
  assert.equal(path.basename(path.dirname(packageRoot)), '@deksden-com');
  assert.equal(path.basename(path.dirname(path.dirname(packageRoot))), 'node_modules', 'Require an installed npm consumer, not a source checkout');
  assert.equal(fs.lstatSync(path.resolve(process.env.DD_EVAL_TEST_SETUP_CLI)).isSymbolicLink(), false);
  const build = JSON.parse(fs.readFileSync(path.join(packageRoot, 'dist/build-info.json'), 'utf8'));
  assert.match(build.cli_commit, /^[a-f0-9]{40}$/);
  assert.match(build.built_with_canon.commit, /^[a-f0-9]{40}$/);
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'eval-installed-setup-')));
  let consoleSettled = true;
  t.after(() => {
    if (consoleSettled) fs.rmSync(root, { recursive: true, force: true });
    else t.diagnostic(`Unsettled Console fixture retained at ${root}`);
  });
  const cwd = path.join(root, 'outside-project'), home = path.join(root, 'flow-home');
  fs.mkdirSync(cwd);
  const source = path.join(root, 'private-bundle'); fs.mkdirSync(source);
  const canon = fs.readFileSync(process.env.DD_EVAL_TEST_SETUP_CANON_ARCHIVE);
  const engine = fs.readFileSync(process.env.DD_EVAL_TEST_SETUP_ENGINE_ARCHIVE);
  const route = Buffer.from(JSON.stringify({ scope: 'offline-installation-fixture-only', native_qualified: false }));
  const impact = Buffer.from(JSON.stringify({ scope: 'fixture', project_effects: false }));
  const manifest = {
    schema_id: 'dd-flow/release-manifest@1', channel: 'development', version: build.built_with_canon.version,
    canon: { version: build.built_with_canon.version, commit: build.built_with_canon.commit,
      archive: { url: 'https://fixture.invalid/canon.tgz', sha256: digest(canon), bytes: canon.length } },
    engine: { package: build.cli_package, version: build.cli_version, compatible_range: build.cli_version,
      archive: { url: 'https://fixture.invalid/engine.tgz', sha256: digest(engine), bytes: engine.length } },
    min_router_version: build.cli_version, catalog_versions: { harness: '1.0.0', model: '1.0.0', flow: '1.0.0' },
    schema_versions: { descriptor: 'dd-flow/flow-descriptor@1', execution: 'dd-flow/execution-settings@1', bundle: 'dd-flow/execution-bundle@1' },
    qualified_routes: [{ platform: 'darwin-arm64', harness: 'codex', flow: 'mb-init', delegation: 'external',
      evidence: { path: 'receipts/route.json', sha256: digest(route) } }],
    impact: { path: 'receipts/impact.json', sha256: digest(impact) }
  };
  const payload = Buffer.from(JSON.stringify({ schema_id: 'dd-flow/release-payload@1',
    manifest_base64: Buffer.from(JSON.stringify(manifest)).toString('base64'),
    source: { kind: 'source_checkout', repository: 'deksden/dd-memorybank', commit: manifest.canon.commit, tag: null },
    qualifications: [{ route: 'darwin-arm64/codex/mb-init/external', sha256: digest(route), request_id: 'offline-fixture',
      project_root: '/fixture/project', workspace: '/fixture/workspace', canon_sha256: digest(canon), engine_sha256: digest(engine) }],
    evidence: [{ path: 'receipts/route.json', bytes_base64: route.toString('base64') }, { path: 'receipts/impact.json', bytes_base64: impact.toString('base64') }] }));
  const { publicKey, privateKey } = generateKeyPairSync('ed25519');
  const envelope = { schema_id: 'dd-flow/release-envelope@1', producer_key_id: digest(publicKey.export({ type: 'spki', format: 'der' })),
    payload_base64: payload.toString('base64'), signature_base64: sign(null, payload, privateKey).toString('base64') };
  const envelopeFile = path.join(source, 'release-envelope.json'), trust = path.join(root, 'trust.json');
  fs.writeFileSync(envelopeFile, JSON.stringify(envelope));
  fs.writeFileSync(path.join(source, 'canon.tgz'), canon); fs.writeFileSync(path.join(source, 'engine.tgz'), engine);
  fs.writeFileSync(trust, JSON.stringify({ schema_id: 'dd-flow/release-trust@1', producers: [{
    public_key_pem: publicKey.export({ type: 'spki', format: 'pem' }), repository: 'deksden/dd-memorybank', channels: ['development'] }] }));
  const registry = path.join(root, 'private-registry.json');
  const canary = '{unrelated registry must remain unread and unchanged'; fs.writeFileSync(registry, canary);
  const env = { PATH: '', DD_FLOW_HOME: home, DD_FLOW_CONFIG_HOME: home, DD_EVAL_REGISTRY_FILE: registry,
    DD_FLOW_RESOURCE_HOME: path.join(root, 'resources') };
  // Node's Permission Model disables fsync even for an allowed specific write
  // root. Do not weaken installation durability to satisfy a test sandbox.
  // Read-only ingress denies writes; mutating setup uses explicit private homes.
  const invoke = (args, selectedHome = home) => spawnSync(process.execPath,
    [...(args[0] === 'setup' && args[1] === 'status' ? ['--permission', `--allow-fs-read=${root}`,
      `--allow-fs-read=${path.dirname(path.dirname(packageRoot))}`] : []), cli, ...args],
    { cwd, env: { ...env, DD_FLOW_HOME: selectedHome }, encoding: 'utf8', timeout: 30_000 });
  const accepted = args => { const result = invoke(args); assert.equal(result.status, 0, result.stderr); return JSON.parse(result.stdout); };
  assert.equal(accepted(['setup', 'status', '--json']).installation_readiness, 'not_installed');
  assert.equal(fs.existsSync(home), false);
  const args = ['--canon-source', source, '--trust-file', trust, '--channel', 'development', '--skip-agent-setup', '--non-interactive', '--json'];
  const headlessHome = path.join(root, 'headless-home');
  const missingExecutor = invoke(['setup', ...args.filter(arg => arg !== '--skip-agent-setup'), '--request-id', 'missing-executor'], headlessHome);
  assert.equal(missingExecutor.status, 1);
  assert.equal(JSON.parse(missingExecutor.stderr).error.code, 'agent_profile_missing');
  assert.equal(fs.existsSync(headlessHome), false);
  const installed = accepted(['setup', ...args, '--request-id', 'install']);
  assert.equal(installed.installation_readiness, 'installed'); assert.equal(installed.executor.profile_id, null);
  const memoryHome = path.join(root, 'memory-eval-home');
  const checkpoint = { flow_pack: { delivery: 'installed_canon', commit: manifest.canon.commit,
    memory_bank_version: manifest.canon.version, engine: { version: manifest.engine.version } } };
  const memorySetup = await setupMemoryRuntime({ bin: cli, env, projectRoot: cwd, runtimeRoot: memoryHome,
    declaration: { canonSource: source, trustFile: trust, channel: 'development' }, checkpoint, requestId: 'memory-eval-setup' });
  assert.equal(memorySetup.installation_readiness, 'installed');
  assert.equal(memorySetup.installation.manifest_sha256, installed.installation.manifest_sha256);
  assert.equal(memorySetup.executor.profile_id, null);
  assert.equal(fs.existsSync(path.join(cwd, '.memory-bank')), false);
  for (const name of ['db.sqlite', 'projects', 'agent-profiles', 'profile-settings.json']) assert.equal(fs.existsSync(path.join(memoryHome, name)), false);
  const memorySelection = fs.readFileSync(path.join(memoryHome, 'installation.json'));
  const memoryReplay = await setupMemoryRuntime({ bin: cli, env, projectRoot: cwd, runtimeRoot: memoryHome,
    declaration: { canonSource: source, trustFile: trust, channel: 'development' }, checkpoint, requestId: 'memory-eval-setup' });
  assert.equal(memoryReplay.replayed, true);
  assert.deepEqual(fs.readFileSync(path.join(memoryHome, 'installation.json')), memorySelection);
  if (process.env.DD_EVAL_REQUIRE_MEMORY_BOOTSTRAP === '1') {
    const product = path.join(root, 'blank-product'), snapshot = path.join(root, 'memory-bootstrap');
    fs.mkdirSync(product);
    fs.writeFileSync(path.join(product, 'README.md'), 'Installed Memory bootstrap product.\n');
    for (const gitArgs of [['init', '--quiet', '--initial-branch=main'], ['add', 'README.md'],
      ['-c', 'user.name=Fixture', '-c', 'user.email=fixture@localhost', 'commit', '--quiet', '-m', 'blank product']]) {
      const result = spawnSync('git', gitArgs, { cwd: product, encoding: 'utf8' });
      assert.equal(result.status, 0, result.stderr);
    }
    const memoryEnv = { ...env, PATH: process.env.PATH, DD_FLOW_HOME: memoryHome, DD_FLOW_CONFIG_HOME: memoryHome };
    for (const command of [['engine', 'install', '--force', '--json'], ['run', 'snapshot', 'bootstrap', 'create', '--flow', 'mb-init', '--project-root', product, '--output', snapshot, '--json']]) {
      const result = spawnSync(process.execPath, [cli, ...command], { cwd: product, env: memoryEnv, encoding: 'utf8', timeout: 30_000 });
      assert.equal(result.status, 0, result.stderr);
    }
    const bootstrap = JSON.parse(fs.readFileSync(path.join(snapshot, 'bootstrap.json'), 'utf8'));
    assert.equal(bootstrap.schema_id, 'dd-eval/bootstrap-snapshot@2');
    assert.equal(bootstrap.stage, 'preflight');
    assert.equal(bootstrap.flow.id, 'mb-init');
    for (const key of ['source_sha256', 'descriptor_sha256']) assert.match(bootstrap.flow[key], /^[a-f0-9]{64}$/);
    assert.equal(fs.existsSync(path.join(product, '.memory-bank')), false);
    assert.equal(fs.readFileSync(path.join(product, 'README.md'), 'utf8'), 'Installed Memory bootstrap product.\n');
    const databaseFile = path.join(memoryHome, 'db.sqlite');
    if (fs.existsSync(databaseFile)) {
      const db = new DatabaseSync(databaseFile, { readOnly: true });
      try {
        for (const table of ['runs', 'sessions', 'run_controllers']) {
          if (db.prepare("SELECT 1 FROM sqlite_schema WHERE type='table' AND name=?").get(table)) assert.equal(db.prepare(`SELECT count(*) AS n FROM ${table}`).get().n, 0);
        }
      } finally { db.close(); }
    }
  }
  const cachedPackage = path.join(installed.installation.engine_root, 'package');
  for (const name of ['dist/cli.js', 'dist/build-info.json', 'dist/schemas/execution-bundle.schema.json']) {
    assert.deepEqual(fs.readFileSync(path.join(cachedPackage, name)), fs.readFileSync(path.join(packageRoot, name)), `Installed and archived ${name} must be the same bytes`);
  }
  const selectionFile = path.join(home, 'installation.json'), before = fs.readFileSync(selectionFile);
  assert.equal(accepted(['setup', ...args, '--request-id', 'install']).replayed, true);
  assert.deepEqual(fs.readFileSync(selectionFile), before);
  assert.equal(accepted(['setup', 'update', ...args, '--request-id', 'update']).installation_readiness, 'installed');
  for (const name of ['db.sqlite', 'projects', 'agent-profiles', 'profile-settings.json']) assert.equal(fs.existsSync(path.join(home, name)), false);
  assert.deepEqual(fs.readdirSync(cwd), []);
  assert.equal(fs.readFileSync(registry, 'utf8'), canary);

  const existingHome = path.join(root, 'existing-home'), frozen = path.join(existingHome, 'projects/fixture/runs/RUN-retained/engine-binding.json');
  fs.mkdirSync(path.dirname(frozen), { recursive: true });
  const frozenBytes = Buffer.from('unrelated frozen RUN binding'), databaseBytes = Buffer.from('incompatible storage must not be opened or migrated');
  fs.writeFileSync(frozen, frozenBytes); fs.writeFileSync(path.join(existingHome, 'db.sqlite'), databaseBytes);
  const existing = invoke(['setup', ...args, '--request-id', 'existing'], existingHome);
  assert.equal(existing.status, 0, existing.stderr);
  const existingStatus = JSON.parse(existing.stdout);
  assert.equal(existingStatus.storage_readiness, 'unknown_requires_diagnostic');
  assert.equal(existingStatus.next_action, 'dd-flow migration plan --help');
  assert.deepEqual(existingStatus.storage_continuation, { kind: 'storage_admission', status: 'requires_diagnostic',
    reason: 'existing_storage_not_inspected', help_command: 'dd-flow migration plan --help', automatic_migration: false });
  assert.deepEqual(fs.readFileSync(frozen), frozenBytes);
  assert.deepEqual(fs.readFileSync(path.join(existingHome, 'db.sqlite')), databaseBytes);

  const consoleRoot = fs.realpathSync(process.env.DD_EVAL_TEST_SETUP_CONSOLE_ROOT);
  assert.equal(path.basename(consoleRoot), 'dd-console');
  assert.equal(path.basename(path.dirname(path.dirname(consoleRoot))), 'node_modules');
  const consoleCli = path.join(consoleRoot, 'dist/cli.js');
  const consoleEnv = { ...env, PATH: process.env.PATH, DD_CONSOLE_HOME: path.join(root, 'console-home'),
    DD_EVAL_HOME: path.join(root, 'absent-eval-home'), DD_EVAL_REGISTRY_FILE: path.join(root, 'absent-eval-registry.json') };
  const consoleCommand = args => {
    const result = spawnSync(process.execPath, [consoleCli, ...args], { cwd, env: consoleEnv, encoding: 'utf8', timeout: 20_000 });
    assert.equal(result.status, 0, result.stderr);
    return JSON.parse(result.stdout);
  };
  const sourceRecord = consoleCommand(['sources', 'add', '--kind', 'flow', '--path', home, '--label', 'installation fixture']);
  let observationError;
  consoleSettled = false;
  try {
    const instance = consoleCommand(['start', '--port', '0', '--json']);
    assert.equal(instance.status, 'running');
    const response = await fetch(`${instance.server.url}/api/v1/sources/${sourceRecord.id}/readiness`, { signal: AbortSignal.timeout(10_000) });
    assert.equal(response.status, 200);
    const body = await response.json(), projection = body.data;
    assert.equal(projection.installation_readiness, 'metadata_present_unverified');
    assert.equal(projection.storage_readiness, 'not_initialized');
    assert.equal(projection.runtime_readiness, 'unknown_requires_qualification');
    assert.equal(projection.reported_canon_version, manifest.version);
    const bytes = JSON.stringify(body);
    for (const forbidden of [root, packageRoot, 'public_key_pem', 'manifest_base64', 'signature_base64']) assert.equal(bytes.includes(forbidden), false);
    assert.deepEqual(fs.readFileSync(selectionFile), before);
  } catch (error) { observationError = error; throw error; }
  finally {
    try { assert.equal(consoleCommand(['stop', '--json']).status, 'stopped'); consoleSettled = true; }
    catch (cleanupError) {
      if (observationError) throw new AggregateError([observationError, cleanupError], 'Console observation and owned cleanup failed');
      throw cleanupError;
    }
  }

  const rejectedHome = path.join(root, 'rejected-home');
  fs.writeFileSync(envelopeFile, JSON.stringify({ ...envelope, signature_base64: Buffer.alloc(64).toString('base64') }));
  const untrusted = invoke(['setup', ...args, '--request-id', 'bad-signature'], rejectedHome);
  assert.equal(untrusted.status, 1); assert.equal(fs.existsSync(rejectedHome), false);
  fs.writeFileSync(envelopeFile, JSON.stringify(envelope));
  fs.writeFileSync(path.join(source, 'canon.tgz'), Buffer.from('corrupt'));
  const corrupt = invoke(['setup', ...args, '--request-id', 'bad-archive'], rejectedHome);
  assert.equal(corrupt.status, 1); assert.equal(fs.existsSync(rejectedHome), false);
  fs.writeFileSync(path.join(source, 'canon.tgz'), canon);
  const cachedCli = path.join(cachedPackage, 'dist/cli.js'), tampered = Buffer.from('retained cache canary');
  fs.writeFileSync(cachedCli, tampered);
  assert.equal(accepted(['setup', 'status', '--json']).installation_readiness, 'degraded');
  assert.equal(invoke(['setup', ...args, '--request-id', 'install']).status, 1);
  assert.deepEqual(fs.readFileSync(cachedCli), tampered, 'Corrupt immutable cache must not be silently replaced');
  assert.equal(fs.readFileSync(registry, 'utf8'), canary);
  assert.deepEqual(fs.readFileSync(selectionFile), before);
  t.diagnostic(JSON.stringify({ scope: 'offline-installed-setup-only', cli_commit: build.cli_commit,
    canon_commit: manifest.canon.commit, canon_sha256: digest(canon), engine_sha256: digest(engine),
    console_build: JSON.parse(fs.readFileSync(path.join(consoleRoot, 'dist/build.json'), 'utf8')) }));
});
