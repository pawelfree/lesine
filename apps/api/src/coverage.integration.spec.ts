import 'reflect-metadata';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { test } from 'node:test';
import { Pool } from 'pg';
import { CoverageController } from './coverage.controller.js';
import { CoverageService } from './coverage.service.js';
import { Database } from './database.js';

async function database(): Promise<{ pool: Pool; close: () => Promise<void> }> {
  const name = `lesine_coverage_${randomUUID().replaceAll('-', '')}`;
  const admin = new Pool();
  await admin.query(`CREATE DATABASE ${name}`);
  const pool = new Pool({ database: name });
  try {
    for (const migration of ['001_source_inventory', '002_source_depth_sample', '003_import_jobs',
      '004_immutable_eod_archive', '005_catalog_refresh', '006_eod_coverage']) {
      await pool.query(await readFile(resolve('db/migrations', `${migration}.sql`), 'utf8'));
    }
  } catch (error) {
    await pool.end();
    await admin.query(`DROP DATABASE ${name}`);
    await admin.end();
    throw error;
  }
  return { pool, close: async () => {
    await pool.end();
    await admin.query(`DROP DATABASE ${name}`);
    await admin.end();
  } };
}

test('coverage distinguishes no report, retained identities, request gaps and acquired revisions',
  { skip: process.env.LESINE_RUN_DB_TESTS !== '1' }, async () => {
    if (process.env.LESINE_TEST_DATABASE !== '1') throw new Error('Requires isolated test database');
    const { pool, close } = await database();
    const service = new CoverageService({ pool } as Database);
    const controller = new CoverageController({ pool } as Database, service);
    const activeId = randomUUID();
    const delistedId = randomUUID();
    const jobId = randomUUID();
    const chunkId = randomUUID();
    const manifestId = randomUUID();
    try {
      const empty = await controller.get({}) as { data: { report_id: string | null; summary: { acquired: number | null } } };
      assert.equal(empty.data.report_id, null);
      assert.equal(empty.data.summary.acquired, null);

      await pool.query(`INSERT INTO source_symbols(id, provider, provider_symbol, listing_state,
        market_segment, identity_evidence_ref, first_seen_at, last_seen_at) VALUES
        ($1, 'eodhd', 'SAME.WAR', 'active', 'main', 'fixture-main', now(), now()),
        ($2, 'eodhd', 'SAME.WAR', 'delisted', 'unclassified', 'fixture-old', now(), now())`,
      [activeId, delistedId]);
      const first = await controller.get({}) as { data: { report_id: string; summary: { acquired: number }; rows: { source_symbol_id: string; status: string; findings: { reason_code: string }[] }[] } };
      assert.equal(first.data.summary.acquired, 0);
      assert.equal(first.data.rows.length, 2);
      assert.deepEqual(new Set(first.data.rows.map((row) => row.source_symbol_id)), new Set([activeId, delistedId]));
      assert.equal(first.data.rows.find((row) => row.source_symbol_id === delistedId)?.status, 'unclassified');
      assert.equal(first.data.rows[0].findings[0].reason_code, 'expected_scope_unknown');

      await pool.query(`INSERT INTO import_jobs(id, provider, market_scope, data_classes, from_date,
        to_date, scope_hash, mode, status) VALUES ($1, 'eodhd', 'main', ARRAY['daily_bars'],
        '2026-01-01', '2026-01-31', $2, 'incremental', 'queued')`, [jobId, randomUUID()]);
      await pool.query(`INSERT INTO import_chunks(id, job_id, resource_key, from_date, to_date)
        VALUES ($1, $2, $3, '2026-01-01', '2026-01-31')`, [chunkId, jobId, activeId]);
      const queued = await controller.get({ market: 'main' }) as { data: { report_id: string; rows: { findings: { reason_code: string }[] }[] } };
      assert.notEqual(queued.data.report_id, first.data.report_id);
      assert.equal(queued.data.rows[0].findings[1].reason_code, 'import_request_unfinished');
      await pool.query("UPDATE import_chunks SET status = 'failed' WHERE id = $1", [chunkId]);
      const failed = await controller.get({ market: 'main' }) as { data: { report_id: string } };
      assert.notEqual(failed.data.report_id, queued.data.report_id, 'status-only changes refresh the report');

      await pool.query(`INSERT INTO raw_file_manifests(id, chunk_id, relative_path, sha256,
        provider, data_class, market_scope, min_date, max_date, row_count)
        VALUES ($1, $2, $3, $4, 'eodhd', 'daily_bars', 'main',
        '2026-01-05', '2026-01-05', 1)`,
      [manifestId, chunkId, `import/${'a'.repeat(64)}.json`, 'a'.repeat(64)]);
      await pool.query(`INSERT INTO daily_bar_revisions(id, provider, source_symbol_id, session_date,
        open, high, low, close, volume, fingerprint, first_manifest_id)
        VALUES ($1, 'eodhd', $2, '2026-01-05', 1, 2, 1, 2, 100, $3, $4)`,
      [randomUUID(), activeId, 'b'.repeat(64), manifestId]);
      await pool.query("UPDATE import_chunks SET status = 'done', manifest_id = $2 WHERE id = $1", [chunkId, manifestId]);
      const acquired = await controller.get({ market: 'main' }) as { data: { summary: { acquired: number }; rows: { acquired_from: string; findings: { reason_code: string }[] }[] } };
      assert.equal(acquired.data.summary.acquired, 1);
      assert.equal(acquired.data.rows[0].acquired_from, '2026-01-05');
      assert.equal(acquired.data.rows[0].findings.length, 1);

      await pool.query(`INSERT INTO daily_bar_revisions(id, provider, source_symbol_id, session_date,
        open, high, low, close, volume, fingerprint, first_manifest_id)
        VALUES ($1, 'eodhd', $2, '2026-01-05', 1, 3, 1, 3, 100, $3, $4)`,
      [randomUUID(), activeId, 'c'.repeat(64), manifestId]);
      const corrected = await controller.get({ market: 'main' }) as { data: { summary: { acquired: number } } };
      assert.equal(corrected.data.summary.acquired, 1, 'correction does not add an acquired date');
      const delisted = await controller.get({ listing: 'delisted' }) as { data: { rows: { source_symbol_id: string }[]; summary: { acquired: number } } };
      assert.deepEqual(delisted.data.rows.map((row) => row.source_symbol_id), [delistedId]);
      assert.equal(delisted.data.summary.acquired, 0);
      const pageOne = await controller.get({ limit: '1' }) as { data: { report_id: string; summary: { acquired: number }; rows: unknown[] }; page: { next_cursor: string } };
      assert.equal(pageOne.data.rows.length, 1);
      assert.equal(pageOne.data.summary.acquired, 1, 'summary includes rows beyond the page');
      const pageTwo = await controller.get({ limit: '1', cursor: pageOne.page.next_cursor }) as { data: { rows: unknown[] }; page: { next_cursor: string | null } };
      assert.equal(pageTwo.data.rows.length, 1);
      assert.equal(pageTwo.page.next_cursor, null);
      await assert.rejects(() => controller.get({ limit: '1', market: 'main', cursor: pageOne.page.next_cursor }),
        (error: unknown) => (error as { status?: number }).status === 400);

      await pool.query('UPDATE source_symbols SET display_name = $2 WHERE id = $1', [activeId, 'Renamed']);
      const revised = await controller.get({}) as { data: { report_id: string } };
      assert.notEqual(revised.data.report_id, pageOne.data.report_id);
      await assert.rejects(() => controller.get({ limit: '1', cursor: pageOne.page.next_cursor }),
        (error: unknown) => (error as { status?: number }).status === 400,
        'a cursor cannot cross report generations');

      await pool.query(`CREATE FUNCTION fail_coverage_fixture() RETURNS trigger LANGUAGE plpgsql AS $$
        BEGIN RAISE EXCEPTION 'fixture failure'; END $$`);
      await pool.query(`CREATE TRIGGER fail_coverage_report BEFORE INSERT ON eod_coverage_reports
        FOR EACH ROW EXECUTE FUNCTION fail_coverage_fixture()`);
      await pool.query('UPDATE source_symbols SET display_name = $2 WHERE id = $1', [activeId, 'Changed']);
      const stale = await controller.get({}) as { data: { report_id: string; refresh_status: string; refresh_error_code: string } };
      assert.equal(stale.data.report_id, revised.data.report_id);
      assert.equal(stale.data.refresh_status, 'stale');
      assert.equal(stale.data.refresh_error_code, 'coverage_refresh_failed');
      await assert.rejects(() => controller.get({ source: 'unknown' }), (error: unknown) => (error as { status?: number }).status === 400);
    } finally { await close(); }
  });
