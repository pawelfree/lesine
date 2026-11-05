import 'reflect-metadata';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { test } from 'node:test';
import { Pool } from 'pg';
import { CatalogController } from './catalog.controller.js';
import { CatalogRefreshesController } from './catalog-refreshes.controller.js';
import { Database } from './database.js';
import { ImportJobsController } from './import-jobs.controller.js';

test('catalog API protects replacement, reports published version and plans imports from current members',
  { skip: process.env.LESINE_RUN_DB_TESTS !== '1' }, async () => {
    if (process.env.LESINE_TEST_DATABASE !== '1') throw new Error('Requires isolated test database');
    const name = `lesine_catalog_api_${randomUUID().replaceAll('-', '')}`;
    const admin = new Pool();
    await admin.query(`CREATE DATABASE ${name}`);
    const pool = new Pool({ database: name });
    try {
      for (const file of (await readdir(resolve('db/migrations'))).filter((item) => /^\d{3}_.*\.sql$/.test(item)).sort())
        await pool.query(await readFile(resolve('db/migrations', file), 'utf8'));
      const catalog = new CatalogController({ pool } as Database);
      const jobs = new CatalogRefreshesController({ pool } as Database);
      const imports = new ImportJobsController({ pool } as Database);
      const oldId = 'a'.repeat(64);
      const currentId = 'b'.repeat(64);
      await pool.query(`INSERT INTO source_symbols(id, provider, provider_symbol, listing_state,
        market_segment, identity_evidence_ref, first_seen_at, last_seen_at) VALUES
        ($1, 'eodhd', 'OLD', 'active', 'unclassified', 'fixture', now(), now()),
        ($2, 'eodhd', 'CURRENT', 'active', 'unclassified', 'fixture', now(), now())`, [oldId, currentId]);
      const legacy = randomUUID();
      await pool.query(`INSERT INTO catalog_refresh_jobs(id, provider, origin, status)
        VALUES ($1, 'eodhd', 'legacy', 'done')`, [legacy]);
      await pool.query(`INSERT INTO catalog_refresh_members(job_id, source_symbol_id)
        VALUES ($1, $2), ($1, $3)`, [legacy, oldId, currentId]);
      await pool.query(`INSERT INTO catalog_head(provider, job_id) VALUES ('eodhd', $1)`, [legacy]);
      const before = await catalog.catalog();
      assert.equal(before.data.status, 'partial');
      assert.equal(before.data.checked_at, null);
      assert.equal(before.data.count, 2);
      assert.deepEqual(before.data.sample, []);
      await assert.rejects(() => jobs.create({ expected_catalog_id: legacy, replace_existing: false }),
        (cause: unknown) => (cause as { status?: number }).status === 409);
      await assert.rejects(() => jobs.create({ expected_catalog_id: randomUUID(), replace_existing: true }),
        (cause: unknown) => (cause as { status?: number }).status === 409);
      await assert.rejects(() => jobs.create({ expected_catalog_id: legacy, replace_existing: true, api_token: 'bad' }),
        (cause: unknown) => (cause as { status?: number }).status === 400);
      const queued = await jobs.create({ expected_catalog_id: legacy, replace_existing: true });
      assert.equal(queued.data.status, 'queued');
      await assert.rejects(() => jobs.create({ expected_catalog_id: legacy, replace_existing: true }),
        (cause: unknown) => (cause as { status?: number }).status === 409);
      const during = await catalog.catalog();
      assert.equal(during.data.current_catalog_id, legacy);
      assert.equal(during.data.count, 2);
      assert.equal((during.data.latest_refresh as { status: string }).status, 'queued');
      await pool.query(`UPDATE catalog_refresh_jobs SET status = 'failed', error_code = 'source_unavailable'
        WHERE id = $1`, [queued.data.id]);
      const failed = await catalog.catalog();
      assert.equal(failed.data.status, 'partial');
      assert.equal(failed.data.checked_at, null);
      assert.equal((failed.data.latest_refresh as { error_code: string }).error_code, 'source_unavailable');
      assert.equal((await jobs.resume(queued.data.id, {})).data.status, 'queued');
      await pool.query(`UPDATE catalog_refresh_jobs SET status = 'done', active_count = 1,
        delisted_count = 0, active_sha256 = $2, active_fetched_at = now(),
        delisted_sha256 = $3, delisted_fetched_at = now(), published_at = now()
        WHERE id = $1`, [queued.data.id, '1'.repeat(64), '2'.repeat(64)]);
      await pool.query(`INSERT INTO catalog_refresh_members(job_id, source_symbol_id) VALUES ($1, $2)`,
        [queued.data.id, currentId]);
      await pool.query(`UPDATE catalog_head SET job_id = $1 WHERE provider = 'eodhd'`, [queued.data.id]);
      const published = await catalog.catalog();
      assert.equal(published.data.status, 'available');
      assert.equal(published.data.count, 1);
      assert.equal(published.data.rows.length, 1);
      assert.equal((published.data.rows[0] as { provider_symbol: string }).provider_symbol, 'CURRENT');
      assert.equal(published.data.sample.length, 2);
      assert.ok(published.data.checked_at);
      await assert.rejects(() => catalog.catalog('all', 'all', undefined, legacy),
        (cause: unknown) => (cause as { status?: number }).status === 409);
      await assert.rejects(() => jobs.create({ expected_catalog_id: legacy, replace_existing: true }),
        (cause: unknown) => (cause as { status?: number }).status === 409);
      const importJob = await imports.create({ provider: 'eodhd', market_scope: 'all', data_classes: ['daily_bars'],
        mode: 'incremental', from_date: '2025-01-01', to_date: '2025-01-02' });
      const chunks = await pool.query(`SELECT s.provider_symbol FROM import_chunks c
        JOIN source_symbols s ON s.id = c.resource_key WHERE c.job_id = $1`, [importJob.data.id]);
      assert.deepEqual(chunks.rows.map((row) => row.provider_symbol), ['CURRENT']);
      assert.equal((await pool.query(`SELECT count(*)::int AS n FROM source_symbols WHERE id = $1`, [oldId])).rows[0].n, 1);
    } finally {
      await pool.end();
      await admin.query(`DROP DATABASE ${name}`);
      await admin.end();
    }
  });
