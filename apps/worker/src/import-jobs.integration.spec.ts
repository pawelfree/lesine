import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { Pool } from 'pg';
import { claimJob, commitChunk, processImport } from './import-jobs.js';

test('import checkpoints survive restart and stale leases cannot publish',
  { skip: process.env.LESINE_RUN_DB_TESTS !== '1' }, async () => {
    if (process.env.LESINE_TEST_DATABASE !== '1') throw new Error('Requires isolated test database');
    const pool = new Pool();
    const symbol = `TEST${randomUUID().slice(0, 8).toUpperCase()}`;
    const symbolId = randomUUID();
    const jobId = randomUUID();
    const chunk1 = randomUUID();
    const chunk2 = randomUUID();
    const extraJobs: string[] = [];
    const directory = await mkdtemp(join(tmpdir(), 'lesine-import-'));
    const previous = { token: process.env.EODHD_API_TOKEN, budget: process.env.LESINE_EODHD_DAILY_BUDGET,
      responseDir: process.env.LESINE_RESPONSE_DIR };
    process.env.EODHD_API_TOKEN = 'fixture-token';
    process.env.LESINE_EODHD_DAILY_BUDGET = '2';
    process.env.LESINE_RESPONSE_DIR = directory;
    try {
      await pool.query("DELETE FROM source_daily_budget WHERE provider = 'eodhd' AND utc_day = (now() AT TIME ZONE 'UTC')::date");
      await pool.query(
        `INSERT INTO source_symbols(id, provider, provider_symbol, listing_state, market_segment,
         identity_evidence_ref, first_seen_at, last_seen_at)
         VALUES ($1, 'eodhd', $2, 'active', 'unclassified', 'fixture', now(), now())`, [symbolId, symbol],
      );
      await pool.query(
        `INSERT INTO import_jobs(id, provider, market_scope, data_classes, from_date, to_date, scope_hash, mode)
         VALUES ($1, 'eodhd', 'all', ARRAY['daily_bars'], '2025-01-01', '2025-02-28', $2, 'incremental')`,
        [jobId, randomUUID()],
      );
      for (const [chunkId, from, to] of [[chunk1, '2025-01-01', '2025-01-31'], [chunk2, '2025-02-01', '2025-02-28']]) {
        await pool.query(`INSERT INTO import_chunks(id, job_id, resource_key, from_date, to_date)
          VALUES ($1, $2, $3, $4, $5)`, [chunkId, jobId, symbolId, from, to]);
      }
      const [first, concurrent] = await Promise.all([claimJob(pool), claimJob(pool)]);
      assert.equal(first?.id, jobId);
      assert.equal(concurrent, null);
      assert.equal(await commitChunk(pool, first!, chunk1, 'first', 'first.json'), true);
      await pool.query("UPDATE import_jobs SET lease_expires_at = now() - interval '1 second' WHERE id = $1", [jobId]);
      const reclaimed = await claimJob(pool);
      assert.equal(reclaimed?.id, jobId);
      assert.notEqual(reclaimed?.token, first?.token);
      assert.equal(await commitChunk(pool, first!, chunk2, 'stale', 'stale.json'), false);
      assert.equal(await commitChunk(pool, reclaimed!, chunk2, 'second', 'second.json'), true);
      const saved = await pool.query('SELECT cursor, status FROM import_jobs WHERE id = $1', [jobId]);
      assert.equal(saved.rows[0].status, 'running');
      assert.match(saved.rows[0].cursor as string, new RegExp(symbolId));
      const chunks = await pool.query('SELECT status, response_hash FROM import_chunks WHERE job_id = $1 ORDER BY from_date', [jobId]);
      assert.deepEqual(chunks.rows.map((row) => row.response_hash), ['first', 'second']);

      // Another fresh lease handles a provider success and retains the original response.
      await pool.query("UPDATE import_jobs SET lease_expires_at = now() - interval '1 second' WHERE id = $1", [jobId]);
      await pool.query("UPDATE import_chunks SET status = 'queued', response_hash = NULL, file_id = NULL WHERE id = $1", [chunk2]);
      let requests = 0;
      const fakeFetch: typeof fetch = async (input) => {
        requests += 1;
        const url = new URL(String(input));
        assert.equal(url.searchParams.get('from'), '2025-02-01');
        return new Response(JSON.stringify([{ date: '2025-02-03', open: 1, close: 2 }]), { status: 200 });
      };
      await processImport(pool, fakeFetch);
      assert.equal(requests, 1);
      const completed = await pool.query('SELECT status, response_hash, file_id FROM import_chunks WHERE id = $1', [chunk2]);
      assert.equal(completed.rows[0].status, 'done');
      const raw = await readFile(join(directory, 'import', completed.rows[0].file_id as string));
      assert.equal(createHash('sha256').update(raw).digest('hex'), completed.rows[0].response_hash);
      await processImport(pool, fakeFetch);
      assert.equal(requests, 1, 'completed range must not be fetched again');
      assert.equal((await pool.query('SELECT status FROM import_jobs WHERE id = $1', [jobId])).rows[0].status, 'done');

      const addJob = async (): Promise<string> => {
        const id = randomUUID();
        extraJobs.push(id);
        await pool.query(
          `INSERT INTO import_jobs(id, provider, market_scope, data_classes, from_date, to_date, scope_hash, mode)
           VALUES ($1, 'eodhd', 'all', ARRAY['daily_bars'], '2025-03-01', '2025-03-31', $2, 'backfill')`,
          [id, randomUUID()],
        );
        await pool.query(
          `INSERT INTO import_chunks(id, job_id, resource_key, from_date, to_date)
           VALUES ($1, $2, $3, '2025-03-01', '2025-03-31')`, [randomUUID(), id, symbolId],
        );
        return id;
      };
      const getStatus = async (id: string): Promise<string> =>
        (await pool.query('SELECT status FROM import_jobs WHERE id = $1', [id])).rows[0].status as string;
      const limited = await addJob();
      await processImport(pool, async () => new Response('rate limited', { status: 429 }));
      assert.equal(await getStatus(limited), 'quota_wait');
      const exhausted = await addJob();
      await processImport(pool, async () => { throw new Error('budget must block provider request'); });
      assert.equal(await getStatus(exhausted), 'quota_wait');
      process.env.LESINE_EODHD_DAILY_BUDGET = '20';
      const unentitled = await addJob();
      await processImport(pool, async () => new Response('denied', { status: 403 }));
      assert.equal(await getStatus(unentitled), 'failed');
      const network = await addJob();
      await processImport(pool, async () => { throw new Error('fixture network error'); });
      assert.equal(await getStatus(network), 'quota_wait');
      delete process.env.EODHD_API_TOKEN;
      const noKey = await addJob();
      await processImport(pool, async () => { throw new Error('missing key must block provider request'); });
      assert.equal(await getStatus(noKey), 'paused');
      const empty = await addJob();
      await pool.query('DELETE FROM import_chunks WHERE job_id = $1', [empty]);
      await processImport(pool, async () => { throw new Error('empty job must not contact provider'); });
      assert.equal(await getStatus(empty), 'done');
    } finally {
      for (const id of extraJobs) {
        await pool.query('DELETE FROM import_chunks WHERE job_id = $1', [id]);
        await pool.query('DELETE FROM import_jobs WHERE id = $1', [id]);
      }
      await pool.query('DELETE FROM import_chunks WHERE job_id = $1', [jobId]);
      await pool.query('DELETE FROM import_jobs WHERE id = $1', [jobId]);
      await pool.query('DELETE FROM source_symbols WHERE id = $1', [symbolId]);
      await pool.query("DELETE FROM source_daily_budget WHERE provider = 'eodhd' AND utc_day = (now() AT TIME ZONE 'UTC')::date");
      await pool.end();
      await rm(directory, { recursive: true, force: true });
      for (const [key, value] of [['EODHD_API_TOKEN', previous.token], ['LESINE_EODHD_DAILY_BUDGET', previous.budget], ['LESINE_RESPONSE_DIR', previous.responseDir]] as const) {
        if (value === undefined) delete process.env[key]; else process.env[key] = value;
      }
    }
  });
