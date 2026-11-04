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
      assert.deepEqual(chunks.rows, [{ start: '2025-01-15', finish: '2025-01-31' }, { start: '2025-02-01', finish: '2025-02-10' }]);
      await assert.rejects(() => controller.create(request), (error: unknown) => (error as { status?: number }).status === 409);
      const status = await controller.get(jobId);
      assert.equal(status.data.total_chunks, 2);
      assert.equal(status.data.completed_chunks, 0);
      await assert.rejects(() => controller.resume(jobId!, {}), (error: unknown) => (error as { status?: number }).status === 409);
      await pool.query("UPDATE import_jobs SET status = 'paused' WHERE id = $1", [jobId]);
      const resumed = await controller.resume(jobId, {});
      assert.equal(resumed.data.status, 'queued');
      assert.equal((await controller.get(jobId)).data.total_chunks, 2);
      await pool.query("UPDATE import_chunks SET status = 'done' WHERE job_id = $1", [jobId]);
      await pool.query("UPDATE import_jobs SET status = 'done' WHERE id = $1", [jobId]);
      secondId = (await controller.create({ ...request, from_date: '2025-01-10', to_date: '2025-02-15' })).data.id;
      const missing = await pool.query(
        "SELECT to_char(from_date, 'YYYY-MM-DD') AS start, to_char(to_date, 'YYYY-MM-DD') AS finish FROM import_chunks WHERE job_id = $1 ORDER BY from_date", [secondId],
      );
      assert.deepEqual(missing.rows, [{ start: '2025-01-10', finish: '2025-01-14' }, { start: '2025-02-11', finish: '2025-02-15' }]);
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
