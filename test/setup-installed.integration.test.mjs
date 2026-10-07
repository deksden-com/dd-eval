import assert from 'node:assert/strict';
import { createHash, generateKeyPairSync, sign } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import test from 'node:test';

const bindings = ['DD_EVAL_TEST_SETUP_CLI', 'DD_EVAL_TEST_SETUP_CANON_ARCHIVE',
  'DD_EVAL_TEST_SETUP_ENGINE_ARCHIVE', 'DD_EVAL_TEST_SETUP_CONSOLE_ROOT'];
const configured = bindings.every(key => process.env[key]);
if (process.env.DD_EVAL_REQUIRE_SETUP === '1') {
  for (const key of bindings) assert(process.env[key] && path.isAbsolute(process.env[key]), `${key} requires an absolute installed candidate input`);
}
const digest = bytes => createHash('sha256').update(bytes).digest('hex');

// Private fixture authority tests installation mechanics, not native route
// qualification. No public signing key, release, model or account is used.
test('installed setup and Console observation preserve isolated producer boundaries', { skip: !configured, timeout: 60_000 }, async t => {
  const cli = fs.realpathSync(process.env.DD_EVAL_TEST_SETUP_CLI);
  const packageRoot = path.dirname(path.dirname(cli));
  assert.equal(path.basename(packageRoot), 'dd-flow-cli');
  assert.equal(fs.lstatSync(path.resolve(process.env.DD_EVAL_TEST_SETUP_CLI)).isSymbolicLink(), false);
  const build = JSON.parse(fs.readFileSync(path.join(packageRoot, 'dist/build-info.json'), 'utf8'));
  assert.match(build.cli_commit, /^[a-f0-9]{40}$/);
  assert.match(build.built_with_canon.commit, /^[a-f0-9]{40}$/);
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'eval-installed-setup-')));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
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
  const invoke = (args, selectedHome = home) => spawnSync(process.execPath,
    ['--permission', `--allow-fs-read=${root}`, `--allow-fs-read=${path.dirname(path.dirname(packageRoot))}`,
      `--allow-fs-write=${root}`, cli, ...args], { cwd, env: { ...env, DD_FLOW_HOME: selectedHome }, encoding: 'utf8', timeout: 30_000 });
  const accepted = args => { const result = invoke(args); assert.equal(result.status, 0, result.stderr); return JSON.parse(result.stdout); };
  assert.equal(accepted(['setup', 'status', '--json']).installation_readiness, 'not_installed');
  assert.equal(fs.existsSync(home), false);
  const args = ['--canon-source', source, '--trust-file', trust, '--channel', 'development', '--skip-agent-setup', '--non-interactive', '--json'];
  const installed = accepted(['setup', ...args, '--request-id', 'install']);
  assert.equal(installed.installation_readiness, 'installed'); assert.equal(installed.executor.profile_id, null);
  const selectionFile = path.join(home, 'installation.json'), before = fs.readFileSync(selectionFile);
  assert.equal(accepted(['setup', ...args, '--request-id', 'install']).replayed, true);
  assert.deepEqual(fs.readFileSync(selectionFile), before);
  assert.equal(accepted(['setup', 'update', ...args, '--request-id', 'update']).installation_readiness, 'installed');
  for (const name of ['db.sqlite', 'projects', 'agent-profiles', 'profile-settings.json']) assert.equal(fs.existsSync(path.join(home, name)), false);
  assert.deepEqual(fs.readdirSync(cwd), []);
  assert.equal(fs.readFileSync(registry, 'utf8'), canary);

  const consoleRoot = fs.realpathSync(process.env.DD_EVAL_TEST_SETUP_CONSOLE_ROOT);
  const { sourceAdd } = await import(pathToFileURL(path.join(consoleRoot, 'dist/sources.js')).href);
  const { serve } = await import(pathToFileURL(path.join(consoleRoot, 'dist/server.js')).href);
  const consoleEnv = { ...env, DD_CONSOLE_HOME: path.join(root, 'console-home'), DD_EVAL_REGISTRY_FILE: path.join(root, 'absent-eval-registry.json') };
  const sourceRecord = await sourceAdd('flow', home, 'installation fixture', consoleEnv);
  const instance = await serve(0, consoleEnv);
  try {
    const response = await fetch(`${instance.url}/api/v1/sources/${sourceRecord.id}/readiness`);
    assert.equal(response.status, 200);
    const projection = await response.json();
    assert.equal(projection.installation_readiness, 'metadata_present_unverified');
    assert.equal(projection.storage_readiness, 'not_initialized');
    assert.equal(projection.runtime_readiness, 'unknown_requires_qualification');
    assert.equal(projection.reported_canon_version, manifest.version);
    const bytes = JSON.stringify(projection);
    for (const forbidden of [root, packageRoot, 'public_key_pem', 'manifest_base64', 'signature_base64']) assert.equal(bytes.includes(forbidden), false);
    assert.deepEqual(fs.readFileSync(selectionFile), before);
  } finally { instance.server.close(); instance.server.closeAllConnections(); await instance.closed; }

  const rejectedHome = path.join(root, 'rejected-home');
  fs.writeFileSync(envelopeFile, JSON.stringify({ ...envelope, signature_base64: Buffer.alloc(64).toString('base64') }));
  const untrusted = invoke(['setup', ...args, '--request-id', 'bad-signature'], rejectedHome);
  assert.equal(untrusted.status, 1); assert.equal(fs.existsSync(rejectedHome), false);
  fs.writeFileSync(envelopeFile, JSON.stringify(envelope));
  fs.writeFileSync(path.join(source, 'canon.tgz'), Buffer.from('corrupt'));
  const corrupt = invoke(['setup', ...args, '--request-id', 'bad-archive'], rejectedHome);
  assert.equal(corrupt.status, 1); assert.equal(fs.existsSync(rejectedHome), false);
  assert.equal(fs.readFileSync(registry, 'utf8'), canary);
  assert.deepEqual(fs.readFileSync(selectionFile), before);
});
