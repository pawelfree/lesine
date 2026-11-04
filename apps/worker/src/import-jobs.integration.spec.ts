import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { mkdir, mkdtemp, readFile, readdir, rm, utimes, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { Pool } from 'pg';
import { claimJob, commitChunk, processImport } from './import-jobs.js';
import { exportBundle, verifyArchive, verifyBundle } from './archive-files.js';

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
      const firstHash = createHash('sha256').update('[]').digest('hex');
      const secondHash = createHash('sha256').update('[ ]').digest('hex');
      await mkdir(join(directory, 'import'));
      await writeFile(join(directory, 'import', `${firstHash}.json`), '[]');
      await writeFile(join(directory, 'import', `${secondHash}.json`), '[ ]');
      assert.equal(await commitChunk(pool, first!, chunk1, firstHash, `import/${firstHash}.json`, []), true);
      await pool.query("UPDATE import_jobs SET lease_expires_at = now() - interval '1 second' WHERE id = $1", [jobId]);
      const reclaimed = await claimJob(pool);
      assert.equal(reclaimed?.id, jobId);
      assert.notEqual(reclaimed?.token, first?.token);
      assert.equal(await commitChunk(pool, first!, chunk2, firstHash, `import/${firstHash}.json`, []), false);
      assert.equal(await commitChunk(pool, reclaimed!, chunk2, secondHash, `import/${secondHash}.json`, []), true);
      const saved = await pool.query('SELECT cursor, status FROM import_jobs WHERE id = $1', [jobId]);
      assert.equal(saved.rows[0].status, 'running');
      assert.match(saved.rows[0].cursor as string, new RegExp(symbolId));
      const chunks = await pool.query('SELECT status, response_hash FROM import_chunks WHERE job_id = $1 ORDER BY from_date', [jobId]);
      assert.deepEqual(chunks.rows.map((row) => row.response_hash), [firstHash, secondHash]);

      // A separate job handles provider success; committed chunks stay immutable.
      await pool.query("UPDATE import_jobs SET status = 'done', lease_token = NULL, lease_expires_at = NULL WHERE id = $1", [jobId]);
      const providerJob = randomUUID();
      const providerChunk = randomUUID();
      extraJobs.push(providerJob);
      await pool.query(
        `INSERT INTO import_jobs(id, provider, market_scope, data_classes, from_date, to_date, scope_hash, mode)
         VALUES ($1, 'eodhd', 'all', ARRAY['daily_bars'], '2025-02-01', '2025-02-28', $2, 'backfill')`,
        [providerJob, randomUUID()],
      );
      await pool.query(`INSERT INTO import_chunks(id, job_id, resource_key, from_date, to_date)
        VALUES ($1, $2, $3, '2025-02-01', '2025-02-28')`, [providerChunk, providerJob, symbolId]);
      let requests = 0;
      const fakeFetch: typeof fetch = async (input) => {
        requests += 1;
        const url = new URL(String(input));
        assert.equal(url.searchParams.get('from'), '2025-02-01');
        return new Response(JSON.stringify([{ date: '2025-02-03', open: 1, high: 3,
          low: 1, close: 2, adjusted_close: 2, volume: 100 }]), { status: 200 });
      };
      await processImport(pool, fakeFetch);
      assert.equal(requests, 1);
      const completed = await pool.query('SELECT status, response_hash, file_id FROM import_chunks WHERE id = $1', [providerChunk]);
      assert.equal(completed.rows[0].status, 'done');
      const raw = await readFile(join(directory, completed.rows[0].file_id as string));
      assert.equal(createHash('sha256').update(raw).digest('hex'), completed.rows[0].response_hash);
      await processImport(pool, fakeFetch);
      assert.equal(requests, 1, 'completed range must not be fetched again');
      assert.equal((await pool.query('SELECT status FROM import_jobs WHERE id = $1', [providerJob])).rows[0].status, 'done');

      const backfill = async (close: number): Promise<string> => {
        const id = randomUUID();
        const chunkId = randomUUID();
        extraJobs.push(id);
        await pool.query(
          `INSERT INTO import_jobs(id, provider, market_scope, data_classes, from_date, to_date, scope_hash, mode)
           VALUES ($1, 'eodhd', 'all', ARRAY['daily_bars'], '2025-02-01', '2025-02-28', $2, 'backfill')`,
          [id, randomUUID()],
        );
        await pool.query(`INSERT INTO import_chunks(id, job_id, resource_key, from_date, to_date)
          VALUES ($1, $2, $3, '2025-02-01', '2025-02-28')`, [chunkId, id, symbolId]);
        await processImport(pool, async () => new Response(JSON.stringify([{ date: '2025-02-03', open: 1,
          high: 3, low: 1, close, adjusted_close: close, volume: 100 }]), { status: 200 }));
        return id;
      };
      process.env.LESINE_EODHD_DAILY_BUDGET = '20';
      await backfill(2);
      assert.equal((await pool.query('SELECT COUNT(*)::int AS count FROM daily_bar_revisions WHERE source_symbol_id = $1',
        [symbolId])).rows[0].count, 1, 'repeat import must not append an unchanged revision');
      await backfill(2.5);
      const revisions = await pool.query(
        `SELECT close, first_manifest_id FROM daily_bar_revisions WHERE source_symbol_id = $1 ORDER BY available_at`, [symbolId],
      );
      assert.deepEqual(revisions.rows.map((bar) => Number(bar.close)), [2, 2.5]);
      assert.notEqual(revisions.rows[0].first_manifest_id, revisions.rows[1].first_manifest_id);
      assert.equal((await pool.query(`SELECT COUNT(*)::int AS count FROM raw_file_manifest_revisions mr
        JOIN daily_bar_revisions r ON r.id = mr.revision_id WHERE r.source_symbol_id = $1`,
      [symbolId])).rows[0].count, 3);

      const bundle = join(directory, 'bundle');
      await mkdir(bundle);
      await writeFile(join(bundle, 'database.dump'), 'fixture-dump');
      const state = await verifyArchive(pool);
      assert.ok(state.files >= 2);
      assert.equal(state.legacyChunks, 0);
      await exportBundle(pool, bundle);
      await verifyBundle(bundle);
      const manifest = await pool.query('SELECT relative_path FROM raw_file_manifests WHERE chunk_id = $1', [providerChunk]);
      const sourcePath = join(directory, manifest.rows[0].relative_path as string);
      const original = await readFile(sourcePath);
      await writeFile(sourcePath, 'tampered');
      await assert.rejects(() => verifyArchive(pool), /archive_file_corrupt/);
      await writeFile(sourcePath, original);
      await writeFile(join(bundle, 'responses', manifest.rows[0].relative_path as string), 'tampered');
      await assert.rejects(() => verifyBundle(bundle), /bundle_file_corrupt/);
      const orphan = join(directory, 'import', `${'a'.repeat(64)}.json`);
      await writeFile(orphan, '{}');
      await utimes(orphan, new Date(0), new Date(0));
      await verifyArchive(pool, true);
      await assert.rejects(() => readFile(orphan), /ENOENT/);
      assert.ok((await readdir(join(directory, 'quarantine'))).length > 0);

      process.env.LESINE_EODHD_DAILY_BUDGET = '2';
      await pool.query("UPDATE source_daily_budget SET reserved_calls = 1 WHERE provider = 'eodhd' AND utc_day = (now() AT TIME ZONE 'UTC')::date");

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
      const rollbackJob = await addJob();
      const rollbackChunk = (await pool.query('SELECT id FROM import_chunks WHERE job_id = $1',
        [rollbackJob])).rows[0].id as string;
      const rollbackLease = await claimJob(pool);
      assert.equal(rollbackLease?.id, rollbackJob);
      await assert.rejects(() => commitChunk(pool, rollbackLease!, rollbackChunk,
        'a'.repeat(64), `import/${'a'.repeat(64)}.json`, [{ date: '2025-03-03', open: 1,
          high: 3, low: 1, close: 2, adjustedClose: null, volume: -1, fingerprint: 'b'.repeat(64) }]),
      /daily_bar_revisions_volume_check/);
      assert.equal((await pool.query('SELECT COUNT(*)::int AS count FROM raw_file_manifests WHERE chunk_id = $1',
        [rollbackChunk])).rows[0].count, 0, 'a failed revision insert must roll back its manifest');
      assert.equal((await pool.query('SELECT status FROM import_chunks WHERE id = $1',
        [rollbackChunk])).rows[0].status, 'queued', 'a failed transaction must not complete the chunk');
      await pool.query("UPDATE import_jobs SET status = 'done', lease_token = NULL, lease_expires_at = NULL WHERE id = $1",
        [rollbackJob]);
      const limited = await addJob();
      const retryStartedAt = Date.now();
      await processImport(pool, async () => new Response('rate limited',
        { status: 429, headers: { 'Retry-After': '172800' } }));
      assert.equal(await getStatus(limited), 'quota_wait');
      const retry = await pool.query('SELECT retry_after_utc FROM import_jobs WHERE id = $1', [limited]);
      assert.ok((retry.rows[0].retry_after_utc as Date).getTime() - retryStartedAt >= 172_799_000,
        'provider Retry-After must not be shortened');
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
      await pool.query('TRUNCATE raw_file_manifest_revisions, daily_bar_revisions, raw_file_manifests CASCADE');
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
