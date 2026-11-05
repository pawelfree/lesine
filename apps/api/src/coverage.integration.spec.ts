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
      '004_immutable_eod_archive', '005_catalog_refresh', '006_eod_coverage', '007_remove_expected_coverage']) {
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
      assert.equal('expected_scope_status' in first.data, false);
      assert.equal('expected' in first.data.summary, false);
      assert.equal('provider_available' in first.data.summary, false);
      assert.equal('gaps' in first.data.summary, false);
      assert.equal(first.data.rows.length, 2);
      assert.equal('expected_from' in first.data.rows[0], false);
      assert.equal('provider_from' in first.data.rows[0], false);
      assert.deepEqual(new Set(first.data.rows.map((row) => row.source_symbol_id)), new Set([activeId, delistedId]));
      assert.equal(first.data.rows.find((row) => row.source_symbol_id === delistedId)?.status, 'unclassified');
      assert.deepEqual(first.data.rows[0].findings, []);

      await pool.query(`INSERT INTO import_jobs(id, provider, market_scope, data_classes, from_date,
        to_date, scope_hash, mode, status) VALUES ($1, 'eodhd', 'main', ARRAY['daily_bars'],
        '2026-01-01', '2026-01-31', $2, 'incremental', 'queued')`, [jobId, randomUUID()]);
      await pool.query(`INSERT INTO import_chunks(id, job_id, resource_key, from_date, to_date)
        VALUES ($1, $2, $3, '2026-01-01', '2026-01-31')`, [chunkId, jobId, activeId]);
      const queued = await controller.get({ market: 'main' }) as { data: { report_id: string; rows: { findings: { reason_code: string }[] }[] } };
      assert.notEqual(queued.data.report_id, first.data.report_id);
      assert.equal(queued.data.rows[0].findings[0].reason_code, 'import_request_unfinished');
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
      assert.equal(acquired.data.rows[0].findings.length, 0);

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

test('coverage omits calendar intervals while retaining empty archived responses',
  { skip: process.env.LESINE_RUN_DB_TESTS !== '1' }, async () => {
    if (process.env.LESINE_TEST_DATABASE !== '1') throw new Error('Requires isolated test database');
    const { pool, close } = await database();
    const service = new CoverageService({ pool } as Database);
    const controller = new CoverageController({ pool } as Database, service);
    const symbolId = randomUUID();
    const jobId = randomUUID();
    const barsChunkId = randomUUID();
    const emptyChunkId = randomUUID();
    const barsManifestId = randomUUID();
    const emptyManifestId = randomUUID();
    try {
      await pool.query(`INSERT INTO source_symbols(id, provider, provider_symbol, listing_state,
        market_segment, identity_evidence_ref, first_seen_at, last_seen_at)
        VALUES ($1, 'eodhd', 'GAP.WAR', 'active', 'main', 'fixture', now(), now())`, [symbolId]);
      await pool.query(`INSERT INTO import_jobs(id, provider, market_scope, data_classes, from_date,
        to_date, scope_hash, mode, status) VALUES ($1, 'eodhd', 'main', ARRAY['daily_bars'],
        '2026-01-05', '2026-01-15', $2, 'incremental', 'done')`, [jobId, randomUUID()]);
      await pool.query(`INSERT INTO import_chunks(id, job_id, resource_key, from_date, to_date, status)
        VALUES ($1, $2, $3, '2026-01-05', '2026-01-09', 'done'),
          ($4, $2, $3, '2026-01-10', '2026-01-15', 'done')`,
      [barsChunkId, jobId, symbolId, emptyChunkId]);
      await pool.query(`INSERT INTO raw_file_manifests(id, chunk_id, relative_path, sha256,
        provider, data_class, market_scope, min_date, max_date, row_count)
        VALUES ($1, $2, $3, $4, 'eodhd', 'daily_bars', 'main', '2026-01-05', '2026-01-09', 2),
          ($5, $6, $7, $8, 'eodhd', 'daily_bars', 'main', NULL, NULL, 0)`,
      [barsManifestId, barsChunkId, `import/${'a'.repeat(64)}.json`, 'a'.repeat(64),
        emptyManifestId, emptyChunkId, `import/${'b'.repeat(64)}.json`, 'b'.repeat(64)]);
      await pool.query(`UPDATE import_chunks SET manifest_id = CASE WHEN id = $1 THEN $2::uuid ELSE $3::uuid END
        WHERE id IN ($1, $4)`, [barsChunkId, barsManifestId, emptyManifestId, emptyChunkId]);
      await pool.query(`INSERT INTO daily_bar_revisions(id, provider, source_symbol_id, session_date,
        open, high, low, close, volume, fingerprint, first_manifest_id)
        VALUES ($1, 'eodhd', $2, '2026-01-05', 1, 2, 1, 2, 100, $3, $4),
          ($5, 'eodhd', $2, '2026-01-09', 1, 2, 1, 2, 100, $6, $4)`,
      [randomUUID(), symbolId, 'c'.repeat(64), barsManifestId, randomUUID(), 'd'.repeat(64)]);

      const response = await controller.get({}) as { data: { summary: { acquired: number };
        rows: { findings: { from_date: string | null; to_date: string | null; reason_code: string;
          evidence_ref: string | null }[] }[] } };
      assert.equal(response.data.summary.acquired, 2);
      const findings = response.data.rows[0].findings;
      assert.equal(findings.some((finding) => finding.reason_code === 'unverified_date_interval'), false);
      const empty = findings.find((finding) => finding.reason_code === 'archived_empty_response');
      assert.equal(empty?.from_date, '2026-01-10');
      assert.equal(empty?.to_date, '2026-01-15');
      assert.equal(empty?.evidence_ref, emptyManifestId);
    } finally { await close(); }
  });
