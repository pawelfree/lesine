import 'reflect-metadata';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { test } from 'node:test';
import { Pool } from 'pg';
import { readActionRevisions } from './corporate-actions.js';

test('action reader pins retained revisions before a local knowledge cutoff',
  { skip: process.env.LESINE_RUN_DB_TESTS !== '1' }, async () => {
    if (process.env.LESINE_TEST_DATABASE !== '1') throw new Error('Requires isolated test database');
    const name = `lesine_action_reader_${randomUUID().replaceAll('-', '')}`;
    const admin = new Pool();
    await admin.query(`CREATE DATABASE ${name}`);
    const pool = new Pool({ database: name });
    const sourceId = randomUUID();
    const jobId = randomUUID();
    const chunkId = randomUUID();
    const manifestId = randomUUID();
    try {
      for (const version of ['001_source_inventory', '002_source_depth_sample', '003_import_jobs',
        '004_immutable_eod_archive', '005_catalog_refresh', '006_eod_coverage',
        '007_remove_expected_coverage', '008_corporate_actions']) {
        await pool.query(await readFile(resolve('db/migrations', `${version}.sql`), 'utf8'));
      }
      await pool.query(`INSERT INTO source_symbols(id, provider, provider_symbol, listing_state,
        market_segment, identity_evidence_ref, first_seen_at, last_seen_at)
        VALUES ($1, 'eodhd', 'TEST', 'active', 'main', 'fixture', now(), now())`, [sourceId]);
      await pool.query(`INSERT INTO import_jobs(id, provider, market_scope, data_classes,
        from_date, to_date, scope_hash, mode, status) VALUES ($1, 'eodhd', 'main',
        ARRAY['dividends'], '2026-01-01', '2026-12-31', $2, 'backfill', 'done')`, [jobId, randomUUID()]);
      await pool.query(`INSERT INTO import_chunks(id, job_id, resource_key, data_class, from_date,
        to_date, status) VALUES ($1, $2, $3, 'dividends', '2026-01-01', '2026-12-31', 'done')`,
      [chunkId, jobId, sourceId]);
      await pool.query(`INSERT INTO raw_file_manifests(id, chunk_id, relative_path, sha256,
        provider, data_class, market_scope, min_date, max_date, row_count)
        VALUES ($1, $2, $3, $4, 'eodhd', 'dividends', 'main', '2026-05-01', '2026-05-01', 1)`,
      [manifestId, chunkId, `import/${'a'.repeat(64)}.json`, 'a'.repeat(64)]);
      const first = randomUUID(); const second = randomUUID();
      for (const [id, amount, knownAt] of [[first, 2, '2026-05-02T00:00:00Z'],
        [second, 3, '2026-06-02T00:00:00Z']] as const) {
        await pool.query(`INSERT INTO corporate_action_revisions(id, provider, source_symbol_id,
          data_class, ex_date, event_key, fingerprint, state, amount, adjusted_amount, currency,
          first_manifest_id, first_seen_at, availability_evidence)
          VALUES ($1, 'eodhd', $2, 'dividends', '2026-05-01', $3, $4,
            'active', $5, $5, 'PLN', $6, $7, 'ex_date_only')`,
        [id, sourceId, 'b'.repeat(64), id.replaceAll('-', '').padEnd(64, '0').slice(0, 64),
          amount, manifestId, knownAt]);
      }
      const before = await readActionRevisions(pool, sourceId, 'dividends', '2026-01-01',
        '2026-12-31', new Date('2026-05-15T00:00:00Z'));
      assert.deepEqual(await readActionRevisions(pool, sourceId, 'dividends', '2026-01-01',
        '2026-12-31', new Date('2026-05-01T00:00:00Z')), []);
      assert.equal(before.length, 1);
      assert.equal(before[0].id, first);
      assert.equal(before[0].source_file_sha256, 'a'.repeat(64));
      const after = await readActionRevisions(pool, sourceId, 'dividends', '2026-01-01',
        '2026-12-31', new Date('2026-07-01T00:00:00Z'));
      assert.equal(after[0].id, second);
    } finally {
      await pool.end();
      await admin.query(`DROP DATABASE IF EXISTS ${name}`);
      await admin.end();
    }
  });
