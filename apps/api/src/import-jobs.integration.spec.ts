import 'reflect-metadata';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { Pool } from 'pg';
import { Database } from './database.js';
import { ImportJobsController } from './import-jobs.controller.js';

test('job creation materializes bounded ranges and rejects overlapping active scope',
  { skip: process.env.LESINE_RUN_DB_TESTS !== '1' }, async () => {
    if (process.env.LESINE_TEST_DATABASE !== '1') throw new Error('Requires isolated test database');
    const pool = new Pool();
    const symbolId = randomUUID();
    const controller = new ImportJobsController({ pool } as Database);
    let jobId: string | null = null;
    let secondId: string | null = null;
    try {
      await pool.query(
        `INSERT INTO source_symbols(id, provider, provider_symbol, listing_state, market_segment,
         identity_evidence_ref, first_seen_at, last_seen_at)
         VALUES ($1, 'eodhd', $2, 'active', 'main', 'fixture', now(), now())`,
        [symbolId, `TEST${symbolId.slice(0, 8).toUpperCase()}`],
      );
      const request = { provider: 'eodhd', market_scope: 'main', data_classes: ['daily_bars'],
        mode: 'incremental', from_date: '2025-01-15', to_date: '2025-02-10' };
      const created = await controller.create(request);
      jobId = created.data.id;
      assert.equal(created.data.status, 'queued');
      const chunks = await pool.query(
        "SELECT to_char(from_date, 'YYYY-MM-DD') AS start, to_char(to_date, 'YYYY-MM-DD') AS finish FROM import_chunks WHERE job_id = $1 ORDER BY from_date", [jobId],
      );
      assert.deepEqual(chunks.rows, [{ start: '2025-01-15', finish: '2025-02-10' }]);
      await assert.rejects(() => controller.create(request), (error: unknown) => (error as { status?: number }).status === 409);
      const status = await controller.get(jobId);
      assert.equal(status.data.total_chunks, 1);
      assert.equal(status.data.completed_chunks, 0);
      await assert.rejects(() => controller.resume(jobId!, {}), (error: unknown) => (error as { status?: number }).status === 409);
      await pool.query("UPDATE import_jobs SET status = 'paused' WHERE id = $1", [jobId]);
      const resumed = await controller.resume(jobId, {});
      assert.equal(resumed.data.status, 'queued');
      assert.equal((await controller.get(jobId)).data.total_chunks, 1);
      await pool.query("UPDATE import_chunks SET status = 'done' WHERE job_id = $1", [jobId]);
      await pool.query("UPDATE import_jobs SET status = 'done' WHERE id = $1", [jobId]);
      secondId = (await controller.create({ ...request, from_date: '2025-01-10', to_date: '2025-02-15' })).data.id;
      const missing = await pool.query(
        "SELECT to_char(from_date, 'YYYY-MM-DD') AS start, to_char(to_date, 'YYYY-MM-DD') AS finish FROM import_chunks WHERE job_id = $1 ORDER BY from_date", [secondId],
      );
      assert.deepEqual(missing.rows, [{ start: '2025-01-10', finish: '2025-02-15' }],
      'legacy completed chunks without manifests must be scheduled again');
      await assert.rejects(() => controller.create({ ...request, from_date: '2025-02-30' }),
        (error: unknown) => (error as { status?: number }).status === 400);
      await assert.rejects(() => controller.create({ ...request, mode: { toString: null } }),
        (error: unknown) => (error as { status?: number }).status === 400);
      await assert.rejects(() => controller.resume(jobId!, { api_token: 'must-not-be-accepted' }),
        (error: unknown) => (error as { status?: number }).status === 400);
    } finally {
      if (secondId) {
        await pool.query('DELETE FROM import_chunks WHERE job_id = $1', [secondId]);
        await pool.query('DELETE FROM import_jobs WHERE id = $1', [secondId]);
      }
      if (jobId) {
        await pool.query('DELETE FROM import_chunks WHERE job_id = $1', [jobId]);
        await pool.query('DELETE FROM import_jobs WHERE id = $1', [jobId]);
      }
      await pool.query('DELETE FROM source_symbols WHERE id = $1', [symbolId]);
      await pool.end();
    }
  });

test('one-year incremental planning keeps manifest-backed monthly history and only batches missing dates',
  { skip: process.env.LESINE_RUN_DB_TESTS !== '1' }, async () => {
    if (process.env.LESINE_TEST_DATABASE !== '1') throw new Error('Requires isolated test database');
    const pool = new Pool();
    const controller = new ImportJobsController({ pool } as Database);
    const symbolId = randomUUID();
    const priorJob = randomUUID();
    const archivedChunks = [randomUUID(), randomUUID()];
    const newJobs: string[] = [];
    try {
      await pool.query(
        `INSERT INTO source_symbols(id, provider, provider_symbol, listing_state, market_segment,
         identity_evidence_ref, first_seen_at, last_seen_at)
         VALUES ($1, 'eodhd', $2, 'active', 'main', 'fixture', now(), now())`,
        [symbolId, `TEST${symbolId.slice(0, 8).toUpperCase()}`],
      );
      await pool.query(
        `INSERT INTO import_jobs(id, provider, market_scope, data_classes, from_date, to_date, scope_hash, mode, status)
         VALUES ($1, 'eodhd', 'main', ARRAY['daily_bars'], '2025-01-01', '2025-03-10', $2, 'incremental', 'done')`,
        [priorJob, randomUUID()],
      );
      for (const [index, from, to] of [[0, '2025-01-01', '2025-01-10'], [1, '2025-03-01', '2025-03-10']] as const) {
        const manifestId = randomUUID();
        await pool.query(`INSERT INTO import_chunks(id, job_id, resource_key, from_date, to_date, status)
          VALUES ($1, $2, $3, $4, $5, 'done')`, [archivedChunks[index], priorJob, symbolId, from, to]);
        await pool.query(`INSERT INTO raw_file_manifests(id, chunk_id, relative_path, sha256, provider,
          data_class, market_scope, row_count) VALUES ($1, $2, $3, $4, 'eodhd', 'daily_bars', 'main', 0)`,
        [manifestId, archivedChunks[index], `import/${'a'.repeat(63)}${index}.json`, `${'a'.repeat(63)}${index}`]);
        await pool.query('UPDATE import_chunks SET manifest_id = $2 WHERE id = $1', [archivedChunks[index], manifestId]);
      }
      const request = { provider: 'eodhd', market_scope: 'main', data_classes: ['daily_bars'],
        mode: 'incremental', from_date: '2025-01-01', to_date: '2026-01-01' };
      const created = await controller.create(request);
      newJobs.push(created.data.id);
      const ranges = await pool.query(
        `SELECT to_char(from_date, 'YYYY-MM-DD') AS start, to_char(to_date, 'YYYY-MM-DD') AS finish
         FROM import_chunks WHERE job_id = $1 ORDER BY from_date`, [created.data.id],
      );
      assert.deepEqual(ranges.rows, [
        { start: '2025-01-11', finish: '2025-02-28' },
        { start: '2025-03-11', finish: '2026-01-01' },
      ]);
      assert.equal((await pool.query('SELECT count(*)::int AS count FROM import_chunks WHERE job_id = $1',
        [priorJob])).rows[0].count, 2, 'existing monthly chunks are not replanned');
      await pool.query("UPDATE import_jobs SET status = 'done' WHERE id = $1", [created.data.id]);
      const backfill = await controller.create({ ...request, mode: 'backfill' });
      newJobs.push(backfill.data.id);
      const full = await pool.query(
        `SELECT to_char(from_date, 'YYYY-MM-DD') AS start, to_char(to_date, 'YYYY-MM-DD') AS finish
         FROM import_chunks WHERE job_id = $1`, [backfill.data.id],
      );
      assert.deepEqual(full.rows, [{ start: '2025-01-01', finish: '2026-01-01' }]);
    } finally {
      for (const id of newJobs) {
        await pool.query('DELETE FROM import_chunks WHERE job_id = $1', [id]);
        await pool.query('DELETE FROM import_jobs WHERE id = $1', [id]);
      }
      await pool.query('UPDATE import_chunks SET manifest_id = NULL WHERE job_id = $1', [priorJob]);
      // The database is isolated for integration tests. Manifests are immutable and cannot be deleted row by row.
      await pool.query('TRUNCATE raw_file_manifests CASCADE');
      await pool.query('DELETE FROM import_chunks WHERE job_id = $1', [priorJob]);
      await pool.query('DELETE FROM import_jobs WHERE id = $1', [priorJob]);
      await pool.query('DELETE FROM source_symbols WHERE id = $1', [symbolId]);
      await pool.end();
    }
  });
