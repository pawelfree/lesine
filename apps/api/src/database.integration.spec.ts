import 'reflect-metadata';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { test } from 'node:test';
import { Pool } from 'pg';
import { Database } from './database.js';

test('forward-only migrations initialize an empty database and do not rerun after restart',
  { skip: process.env.LESINE_RUN_DB_TESTS !== '1' }, async () => {
    if (process.env.LESINE_TEST_DATABASE !== '1') throw new Error('Refusing to create a migration test database outside isolated tests');
    const name = `lesine_migration_${randomUUID().replaceAll('-', '')}`;
    const originalDatabase = process.env.PGDATABASE;
    const admin = new Pool();
    try {
      await admin.query(`CREATE DATABASE ${name}`);
      process.env.PGDATABASE = name;
      for (let attempt = 0; attempt < 2; attempt += 1) {
        const database = new Database();
        try {
          await database.onApplicationBootstrap();
          const versions = await database.pool.query('SELECT version FROM schema_migrations ORDER BY version');
          assert.deepEqual(versions.rows.map((row) => row.version),
            ['001_source_inventory', '002_source_depth_sample', '003_import_jobs', '004_immutable_eod_archive', '005_catalog_refresh', '006_eod_coverage', '007_remove_expected_coverage']);
          const removed = await database.pool.query("SELECT column_name FROM information_schema.columns WHERE table_name = 'eod_coverage_reports' AND column_name = 'expected_scope_status'");
          assert.equal(removed.rowCount, 0);
          const tables = await database.pool.query("SELECT to_regclass('public.source_symbols') AS symbols, to_regclass('public.source_depth_samples') AS samples, to_regclass('public.catalog_refresh_jobs') AS catalog_jobs");
          assert.equal(tables.rows[0].symbols, 'source_symbols');
          assert.equal(tables.rows[0].samples, 'source_depth_samples');
          assert.equal(tables.rows[0].catalog_jobs, 'catalog_refresh_jobs');
        } finally { await database.onModuleDestroy(); }
      }
      // Roll back this additive migration in the disposable database and preserve older tables.
      const rollback = new Pool();
      try {
        await rollback.query('DROP TABLE catalog_head');
        await rollback.query('DROP TABLE catalog_refresh_members');
        await rollback.query('DROP TABLE catalog_refresh_jobs');
        await rollback.query('ALTER TABLE import_chunks DROP COLUMN manifest_id');
        await rollback.query('DROP TABLE raw_file_manifest_revisions');
        await rollback.query('DROP TABLE daily_bar_revisions');
        await rollback.query('DROP TABLE raw_file_manifests');
        await rollback.query('DROP FUNCTION forbid_archive_row_change()');
        await rollback.query('DROP TABLE import_chunks');
        await rollback.query('DROP TABLE import_jobs');
        const tables = await rollback.query("SELECT to_regclass('public.source_symbols') AS symbols, to_regclass('public.import_jobs') AS jobs");
        assert.equal(tables.rows[0].symbols, 'source_symbols');
        assert.equal(tables.rows[0].jobs, null);
      } finally { await rollback.end(); }
    } finally {
      if (originalDatabase === undefined) delete process.env.PGDATABASE; else process.env.PGDATABASE = originalDatabase;
      await admin.query(`DROP DATABASE IF EXISTS ${name}`);
      await admin.end();
    }
  });

test('catalog migration preserves pre-existing EODHD symbols as a legacy current list',
  { skip: process.env.LESINE_RUN_DB_TESTS !== '1' }, async () => {
    if (process.env.LESINE_TEST_DATABASE !== '1') throw new Error('Refusing to create a migration test database outside isolated tests');
    const name = `lesine_catalog_legacy_${randomUUID().replaceAll('-', '')}`;
    const originalDatabase = process.env.PGDATABASE;
    const admin = new Pool();
    try {
      await admin.query(`CREATE DATABASE ${name}`);
      process.env.PGDATABASE = name;
      const seeded = new Pool();
      try {
        await seeded.query('CREATE TABLE schema_migrations (version text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())');
        for (const version of ['001_source_inventory', '002_source_depth_sample', '003_import_jobs', '004_immutable_eod_archive']) {
          await seeded.query(await readFile(resolve('db/migrations', `${version}.sql`), 'utf8'));
          await seeded.query('INSERT INTO schema_migrations(version) VALUES ($1)', [version]);
        }
        await seeded.query(`INSERT INTO source_symbols(id, provider, provider_symbol, listing_state,
          market_segment, identity_evidence_ref, first_seen_at, last_seen_at)
          VALUES ('legacy-eodhd', 'eodhd', 'OLD', 'active', 'unclassified', 'legacy', now(), now()),
                 ('other-provider', 'other', 'OTHER', 'active', 'unclassified', 'other', now(), now())`);
      } finally { await seeded.end(); }
      const database = new Database();
      try {
        await database.onApplicationBootstrap();
        const head = await database.pool.query(`SELECT j.origin, j.published_at, array_agg(s.id ORDER BY s.id) AS ids
          FROM catalog_head h JOIN catalog_refresh_jobs j ON j.id = h.job_id
          JOIN catalog_refresh_members m ON m.job_id = j.id
          JOIN source_symbols s ON s.id = m.source_symbol_id
          WHERE h.provider = 'eodhd' GROUP BY j.id`);
        assert.equal(head.rows[0].origin, 'legacy');
        assert.equal(head.rows[0].published_at, null);
        assert.deepEqual(head.rows[0].ids, ['legacy-eodhd']);
        await database.onApplicationBootstrap();
        assert.equal((await database.pool.query('SELECT count(*)::int AS n FROM catalog_head')).rows[0].n, 1);
      } finally { await database.onModuleDestroy(); }
    } finally {
      if (originalDatabase === undefined) delete process.env.PGDATABASE; else process.env.PGDATABASE = originalDatabase;
      await admin.query(`DROP DATABASE IF EXISTS ${name}`);
      await admin.end();
    }
  });
