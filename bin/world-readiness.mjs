import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { pathToFileURL } from 'node:url';

// Runs only inside the product's existing owned test-world launcher. It checks
// that new world's actual routing/ownership, not the fixture's CRUD behavior.
const require = createRequire(path.join(process.cwd(), 'package.json'));
const postgres = require('postgres');
const token = process.env.DD_TASKS_TEST_WORLD, url = new URL(process.env.DATABASE_URL);
assert.match(token ?? '', /^[a-f0-9]{32}$/);
assert.equal(url.pathname, `/dd_tasks_foundation_test_${token}`);
assert.ok(['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname));
const sql = postgres(url.toString(), { max: 1 });
try {
  const [owner] = await sql`SELECT current_database() AS name, shobj_description(oid, 'pg_database') AS owner FROM pg_database WHERE datname = current_database()`;
  assert.equal(owner.name, url.pathname.slice(1)); assert.equal(owner.owner, `dd-tasks:${token}`);
  const { applyMigrations, migrationState, migrationStateMatches } = await import(pathToFileURL(path.join(process.cwd(), 'src/db/migrations.ts')).href);
  await applyMigrations(sql);
  assert.equal(migrationStateMatches(await migrationState(sql)), true);
  const { seedDemoData } = await import(pathToFileURL(path.join(process.cwd(), 'src/db/fixtures.ts')).href);
  await seedDemoData(sql, { profile: 'test', runId: token, worldId: token });
  const marker = randomUUID();
  await sql`CREATE TEMP TABLE readiness_probe (value text)`;
  await sql`INSERT INTO readiness_probe VALUES (${marker})`;
  assert.equal((await sql`SELECT value FROM readiness_probe`)[0].value, marker);
  await sql`DROP TABLE readiness_probe`;
  process.stdout.write(JSON.stringify({ schema_id: 'dd-eval/world-readiness@1', world_id: token, owner_pid: process.ppid, ready: true }) + '\n');
} finally { await sql.end(); }
