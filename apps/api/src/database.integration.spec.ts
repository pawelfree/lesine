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
            ['001_source_inventory', '002_source_depth_sample', '003_import_jobs', '004_immutable_eod_archive', '005_catalog_refresh', '006_eod_coverage', '007_remove_expected_coverage', '008_corporate_actions']);
          const removed = await database.pool.query("SELECT column_name FROM information_schema.columns WHERE table_name = 'eod_coverage_reports' AND column_name = 'expected_scope_status'");
          assert.equal(removed.rowCount, 0);
          const tables = await database.pool.query("SELECT to_regclass('public.source_symbols') AS symbols, to_regclass('public.source_depth_samples') AS samples, to_regclass('public.catalog_refresh_jobs') AS catalog_jobs, to_regclass('public.corporate_action_revisions') AS actions");
          assert.equal(tables.rows[0].symbols, 'source_symbols');
          assert.equal(tables.rows[0].samples, 'source_depth_samples');
          assert.equal(tables.rows[0].catalog_jobs, 'catalog_refresh_jobs');
          assert.equal(tables.rows[0].actions, 'corporate_action_revisions');
        } finally { await database.onModuleDestroy(); }
      }
      // Roll back this additive migration in the disposable database and preserve older tables.
      const rollback = new Pool();
      try {
        await rollback.query('DROP TABLE action_manifest_revisions');
        await rollback.query('DROP TABLE corporate_action_revisions');
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

test('coverage migration upgrades a populated archive without changing bars or old reports',
  { skip: process.env.LESINE_RUN_DB_TESTS !== '1' }, async () => {
    if (process.env.LESINE_TEST_DATABASE !== '1') throw new Error('Requires isolated test database');
    const name = `lesine_coverage_upgrade_${randomUUID().replaceAll('-', '')}`;
    const originalDatabase = process.env.PGDATABASE;
    const admin = new Pool();
    try {
      await admin.query(`CREATE DATABASE ${name}`);
      process.env.PGDATABASE = name;
      const seeded = new Pool();
      const symbolId = randomUUID();
      const jobId = randomUUID();
      const chunkId = randomUUID();
      const manifestId = randomUUID();
      const reportId = randomUUID();
      try {
        await seeded.query('CREATE TABLE schema_migrations (version text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())');
        for (const version of ['001_source_inventory', '002_source_depth_sample', '003_import_jobs',
          '004_immutable_eod_archive', '005_catalog_refresh', '006_eod_coverage']) {
          await seeded.query(await readFile(resolve('db/migrations', `${version}.sql`), 'utf8'));
          await seeded.query('INSERT INTO schema_migrations(version) VALUES ($1)', [version]);
        }
        await seeded.query(`INSERT INTO source_symbols(id, provider, provider_symbol, listing_state,
          market_segment, identity_evidence_ref, first_seen_at, last_seen_at)
          VALUES ($1, 'eodhd', 'OLD.WAR', 'active', 'main', 'fixture', now(), now())`, [symbolId]);
        await seeded.query(`INSERT INTO import_jobs(id, provider, market_scope, data_classes, from_date,
          to_date, scope_hash, mode, status) VALUES ($1, 'eodhd', 'main', ARRAY['daily_bars'],
          '2026-01-05', '2026-01-05', $2, 'incremental', 'done')`, [jobId, randomUUID()]);
        await seeded.query(`INSERT INTO import_chunks(id, job_id, resource_key, from_date, to_date, status)
          VALUES ($1, $2, $3, '2026-01-05', '2026-01-05', 'done')`, [chunkId, jobId, symbolId]);
        await seeded.query(`INSERT INTO raw_file_manifests(id, chunk_id, relative_path, sha256,
          provider, data_class, market_scope, min_date, max_date, row_count)
          VALUES ($1, $2, $3, $4, 'eodhd', 'daily_bars', 'main', '2026-01-05', '2026-01-05', 1)`,
        [manifestId, chunkId, `import/${'a'.repeat(64)}.json`, 'a'.repeat(64)]);
        await seeded.query('UPDATE import_chunks SET manifest_id = $2 WHERE id = $1', [chunkId, manifestId]);
        await seeded.query(`INSERT INTO daily_bar_revisions(id, provider, source_symbol_id, session_date,
          open, high, low, close, volume, fingerprint, first_manifest_id)
          VALUES ($1, 'eodhd', $2, '2026-01-05', 1, 2, 1, 2, 100, $3, $4)`,
        [randomUUID(), symbolId, 'b'.repeat(64), manifestId]);
        const before = await seeded.query<{ revision: string }>('SELECT revision FROM eod_coverage_input_state WHERE id = 1');
        await seeded.query(`INSERT INTO eod_coverage_reports(id, input_revision, source_symbol_count)
          VALUES ($1, $2, 1)`, [reportId, before.rows[0].revision]);
        await seeded.query(`INSERT INTO eod_coverage_rows(report_id, source_symbol_id, provider,
          provider_symbol, market_segment, listing, in_current_catalog, acquired_from,
          acquired_to, acquired_count, status, findings)
          VALUES ($1, $2, 'eodhd', 'OLD.WAR', 'main', 'active', false,
          '2026-01-05', '2026-01-05', 1, 'unknown', '[]'::jsonb)`, [reportId, symbolId]);
        const database = new Database();
        try {
          await database.onApplicationBootstrap();
          const after = await database.pool.query<{ revision: string }>('SELECT revision FROM eod_coverage_input_state WHERE id = 1');
          assert.equal(BigInt(after.rows[0].revision), BigInt(before.rows[0].revision) + 1n);
          const bars = await database.pool.query('SELECT source_symbol_id, session_date, close FROM daily_bar_revisions');
          assert.equal(bars.rowCount, 1);
          assert.equal(bars.rows[0].source_symbol_id, symbolId);
          assert.equal(bars.rows[0].close, '2');
          const reports = await database.pool.query('SELECT id, input_revision FROM eod_coverage_reports');
          assert.equal(reports.rowCount, 1);
          assert.equal(reports.rows[0].id, reportId);
          const rows = await database.pool.query('SELECT acquired_count FROM eod_coverage_rows WHERE report_id = $1', [reportId]);
          assert.equal(rows.rows[0].acquired_count, 1);
          const removed = await database.pool.query("SELECT 1 FROM information_schema.columns WHERE table_name = 'eod_coverage_reports' AND column_name = 'expected_scope_status'");
          assert.equal(removed.rowCount, 0);
        } finally { await database.onModuleDestroy(); }
      } finally { await seeded.end(); }
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
