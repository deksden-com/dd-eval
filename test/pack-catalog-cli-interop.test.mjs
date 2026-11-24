import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { readPackCatalogHistory } from '../lib/recovery/pack-history.mjs';

const { DD_EVAL_PACK_CATALOG: catalogFile, DD_EVAL_PACK_SNAPSHOT_SHA256: digest } = process.env;

test('reads a pinned public CLI catalog and rejects a substituted visit', { skip: !catalogFile && !digest }, async () => {
  assert.ok(catalogFile && /^[a-f0-9]{64}$/.test(digest ?? ''), 'Catalog file and independent snapshot digest are both required');
  const catalog = JSON.parse(await readFile(catalogFile, 'utf8'));
  assert.equal(catalog.ok, true);
  const matches = catalog.snapshots.filter(item => item.manifest_sha256 === digest);
  assert.equal(matches.length, 1, 'Pinned snapshot must select exactly one catalog entry');
  const entry = matches[0];
  assert.equal(entry.catalog?.provenance, 'capture');
  assert.equal(entry.reason, 'pack_assessment_only');
  assert.equal(entry.forkable, false);
  const request = { snapshot: entry.snapshot, snapshotSha256: digest, runId: catalog.run_id, catalog: entry };
  const history = await readPackCatalogHistory(request);
  assert.ok(history.visits.length > 0);
  assert.equal(history.coverage.forkability, 'unverified');
  assert.equal(history.coverage.matrix_components, 'unavailable');
  const substituted = structuredClone(entry);
  substituted.pack_boundary.accepted[0].visit += 1;
  await assert.rejects(readPackCatalogHistory({ ...request, catalog: substituted }), { code: 'pack_history_invalid' });
});
