import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { mkdir, mkdtemp, readFile, readdir, rm, utimes, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { test } from 'node:test';
import { Pool } from 'pg';
import { claimJob, commitChunk, processImport as processImportActual } from './import-jobs.js';
import { exportBundle, verifyArchive, verifyBundle } from './archive-files.js';

const processImport = (pool: Pool, fetcher: typeof fetch): Promise<boolean> =>
  processImportActual(pool, fetcher, new Date('2025-02-28T12:00:00Z'));

async function isolatedImportPool(): Promise<{ pool: Pool; close: () => Promise<void> }> {
  const name = `lesine_import_${randomUUID().replaceAll('-', '')}`;
  const admin = new Pool();
  await admin.query(`CREATE DATABASE ${name}`);
  const pool = new Pool({ database: name });
  try {
    for (const migration of ['001_source_inventory', '002_source_depth_sample',
      '003_import_jobs', '004_immutable_eod_archive', '005_catalog_refresh',
      '006_eod_coverage', '007_remove_expected_coverage', '008_corporate_actions']) {
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

test('import checkpoints survive restart and stale leases cannot publish',
  { skip: process.env.LESINE_RUN_DB_TESTS !== '1' }, async () => {
    if (process.env.LESINE_TEST_DATABASE !== '1') throw new Error('Requires isolated test database');
    const { pool, close } = await isolatedImportPool();
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
      const staleTemp = join(directory, 'import', `.${randomUUID()}.tmp`);
      const activeTemp = join(directory, 'import', `.${randomUUID()}.tmp`);
      await writeFile(orphan, '{}');
      await writeFile(staleTemp, 'incomplete');
      await writeFile(activeTemp, 'still being written');
      await utimes(orphan, new Date(0), new Date(0));
      await utimes(staleTemp, new Date(0), new Date(0));
      await verifyArchive(pool, true);
      await assert.rejects(() => readFile(orphan), /ENOENT/);
      await assert.rejects(() => readFile(staleTemp), /ENOENT/);
      assert.equal(await readFile(activeTemp, 'utf8'), 'still being written');
      assert.equal((await readdir(join(directory, 'quarantine'))).length, 2);

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
      await close();
      await rm(directory, { recursive: true, force: true });
      for (const [key, value] of [['EODHD_API_TOKEN', previous.token], ['LESINE_EODHD_DAILY_BUDGET', previous.budget], ['LESINE_RESPONSE_DIR', previous.responseDir]] as const) {
        if (value === undefined) delete process.env[key]; else process.env[key] = value;
      }
    }
  });

test('expired Free window stops before reserving or calling the provider',
  { skip: process.env.LESINE_RUN_DB_TESTS !== '1' }, async () => {
    if (process.env.LESINE_TEST_DATABASE !== '1') throw new Error('Requires isolated test database');
    const { pool, close } = await isolatedImportPool();
    try {
      const symbolId = randomUUID();
      const jobId = randomUUID();
      await pool.query(`INSERT INTO source_symbols(id, provider, provider_symbol, listing_state,
        market_segment, identity_evidence_ref, first_seen_at, last_seen_at)
        VALUES ($1, 'eodhd', 'NEM', 'delisted', 'unclassified', 'fixture', now(), now())`, [symbolId]);
      await pool.query(`INSERT INTO import_jobs(id, provider, market_scope, data_classes, from_date,
        to_date, scope_hash, mode) VALUES ($1, 'eodhd', 'all', ARRAY['daily_bars'],
        '2025-11-05', '2026-11-05', $2, 'incremental')`, [jobId, randomUUID()]);
      await pool.query(`INSERT INTO import_chunks(id, job_id, resource_key, from_date, to_date)
        VALUES ($1, $2, $3, '2025-11-05', '2026-11-05')`, [randomUUID(), jobId, symbolId]);
      await processImportActual(pool, async () => { throw new Error('provider must not be called'); },
        new Date('2026-11-06T06:30:00Z'));
      const job = await pool.query('SELECT status, error_code FROM import_jobs WHERE id = $1', [jobId]);
      assert.deepEqual(job.rows[0], { status: 'failed', error_code: 'free_window_expired' });
      assert.equal((await pool.query('SELECT count(*)::int AS count FROM source_daily_budget')).rows[0].count, 0);
    } finally { await close(); }
  });

test('action import retains corrections and withdrawals with immutable source manifests',
  { skip: process.env.LESINE_RUN_DB_TESTS !== '1' }, async () => {
    if (process.env.LESINE_TEST_DATABASE !== '1') throw new Error('Requires isolated test database');
    const { pool, close } = await isolatedImportPool();
    const directory = await mkdtemp(join(tmpdir(), 'lesine-actions-'));
    const previous = { token: process.env.EODHD_API_TOKEN, budget: process.env.LESINE_EODHD_DAILY_BUDGET,
      responseDir: process.env.LESINE_RESPONSE_DIR };
    process.env.EODHD_API_TOKEN = 'fixture-token';
    process.env.LESINE_EODHD_DAILY_BUDGET = '20';
    process.env.LESINE_RESPONSE_DIR = directory;
    const sourceId = randomUUID();
    try {
      await pool.query(`INSERT INTO source_symbols(id, provider, provider_symbol, listing_state,
        market_segment, identity_evidence_ref, first_seen_at, last_seen_at)
        VALUES ($1, 'eodhd', 'ACTION', 'active', 'unclassified', 'fixture', now(), now())`, [sourceId]);
      const request = async (response: unknown): Promise<void> => {
        const jobId = randomUUID();
        await pool.query(`INSERT INTO import_jobs(id, provider, market_scope, data_classes, from_date,
          to_date, scope_hash, mode) VALUES ($1, 'eodhd', 'all', ARRAY['dividends'],
          '2026-01-01', '2026-12-31', $2, 'backfill')`, [jobId, randomUUID()]);
        await pool.query(`INSERT INTO import_chunks(id, job_id, resource_key, data_class, from_date, to_date)
          VALUES ($1, $2, $3, 'dividends', '2026-01-01', '2026-12-31')`,
        [randomUUID(), jobId, sourceId]);
        let calls = 0;
        await processImport(pool, async (input) => {
          calls += 1;
          const url = new URL(String(input));
          assert.equal(url.pathname, '/api/div/ACTION.WAR');
          assert.equal(url.searchParams.get('fmt'), 'json');
          return new Response(JSON.stringify(response), { status: 200 });
        });
        assert.equal(calls, 1);
        await processImport(pool, async () => { throw new Error('completed chunk refetched'); });
        assert.equal((await pool.query('SELECT status FROM import_jobs WHERE id = $1', [jobId])).rows[0].status, 'done');
      };
      await request([{ date: '2026-05-01', value: 0.5, unadjustedValue: 2, currency: 'PLN' }]);
      await request([{ date: '2026-05-01', value: 0.5, unadjustedValue: 2, currency: 'PLN' }]);
      await request([{ date: '2026-05-01', value: 0.75, unadjustedValue: 3, currency: 'PLN' }]);
      await request([]);
      const splitJob = randomUUID();
      await pool.query(`INSERT INTO import_jobs(id, provider, market_scope, data_classes, from_date,
        to_date, scope_hash, mode) VALUES ($1, 'eodhd', 'all', ARRAY['splits'],
        '2026-01-01', '2026-12-31', $2, 'backfill')`, [splitJob, randomUUID()]);
      await pool.query(`INSERT INTO import_chunks(id, job_id, resource_key, data_class, from_date, to_date)
        VALUES ($1, $2, $3, 'splits', '2026-01-01', '2026-12-31')`,
      [randomUUID(), splitJob, sourceId]);
      await processImport(pool, async (input) => {
        assert.equal(new URL(String(input)).pathname, '/api/splits/ACTION.WAR');
        return new Response(JSON.stringify([{ date: '2026-08-01', split: '3.000000/2.000000' }]),
          { status: 200 });
      });
      await processImport(pool, async () => { throw new Error('completed split refetched'); });
      const split = await pool.query(`SELECT split_numerator, split_denominator
        FROM corporate_action_revisions WHERE source_symbol_id = $1 AND data_class = 'splits'`, [sourceId]);
      assert.equal(split.rows[0].split_numerator, '3');
      assert.equal(split.rows[0].split_denominator, '2');
      const revisions = await pool.query(`SELECT id, state, amount, adjusted_amount, first_manifest_id
        FROM corporate_action_revisions WHERE source_symbol_id = $1 AND data_class = 'dividends'
        ORDER BY first_seen_at, id`, [sourceId]);
      assert.equal(revisions.rowCount, 3);
      assert.deepEqual(revisions.rows.map((row) => row.state), ['active', 'active', 'withdrawn']);
      assert.deepEqual(revisions.rows.map((row) => row.amount === null ? null : Number(row.amount)), [2, 3, null]);
      assert.equal((await pool.query(`SELECT count(*)::int AS n FROM action_manifest_revisions`)).rows[0].n, 5);
      assert.equal((await pool.query(`SELECT count(*)::int AS n FROM raw_file_manifests
        WHERE data_class = 'dividends'`)).rows[0].n, 4);
      await assert.rejects(() => pool.query(`UPDATE corporate_action_revisions SET amount = 9
        WHERE id = $1`, [revisions.rows[0].id]), /archive records are append-only/);
      assert.equal((await verifyArchive(pool)).legacyChunks, 0);
      const bundle = join(directory, 'bundle');
      await mkdir(bundle);
      await writeFile(join(bundle, 'database.dump'), 'fixture-dump');
      await exportBundle(pool, bundle);
      await verifyBundle(bundle);
      const missingJob = randomUUID();
      await pool.query(`INSERT INTO import_jobs(id, provider, market_scope, data_classes, from_date,
        to_date, scope_hash, mode) VALUES ($1, 'eodhd', 'all', ARRAY['splits'],
        '2025-01-01', '2025-12-31', $2, 'backfill')`, [missingJob, randomUUID()]);
      await pool.query(`INSERT INTO import_chunks(id, job_id, resource_key, data_class, from_date, to_date)
        VALUES ($1, $2, $3, 'splits', '2025-01-01', '2025-12-31')`,
      [randomUUID(), missingJob, sourceId]);
      await processImport(pool, async () => new Response('Symbol not found', { status: 404 }));
      const failed = await pool.query('SELECT status, error_code FROM import_jobs WHERE id = $1', [missingJob]);
      assert.deepEqual(failed.rows[0], { status: 'failed', error_code: 'source_unavailable' });
      const oversizedJob = randomUUID();
      const oversizedChunk = randomUUID();
      await pool.query(`INSERT INTO import_jobs(id, provider, market_scope, data_classes, from_date,
        to_date, scope_hash, mode) VALUES ($1, 'eodhd', 'all', ARRAY['dividends'],
        '2025-01-01', '2025-12-31', $2, 'backfill')`, [oversizedJob, randomUUID()]);
      await pool.query(`INSERT INTO import_chunks(id, job_id, resource_key, data_class, from_date, to_date)
        VALUES ($1, $2, $3, 'dividends', '2025-01-01', '2025-12-31')`,
      [oversizedChunk, oversizedJob, sourceId]);
      await processImport(pool, async () => new Response(' '.repeat(5_000_001), { status: 200 }));
      const oversized = await pool.query('SELECT status, error_code FROM import_jobs WHERE id = $1', [oversizedJob]);
      assert.deepEqual(oversized.rows[0], { status: 'failed', error_code: 'invalid_action_payload' });
      assert.equal((await pool.query('SELECT manifest_id FROM import_chunks WHERE id = $1',
        [oversizedChunk])).rows[0].manifest_id, null);
      assert.equal(await processImport(pool, async () => { throw new Error('failed action refetched'); }), false);
    } finally {
      if (previous.token === undefined) delete process.env.EODHD_API_TOKEN; else process.env.EODHD_API_TOKEN = previous.token;
      if (previous.budget === undefined) delete process.env.LESINE_EODHD_DAILY_BUDGET;
      else process.env.LESINE_EODHD_DAILY_BUDGET = previous.budget;
      if (previous.responseDir === undefined) delete process.env.LESINE_RESPONSE_DIR;
      else process.env.LESINE_RESPONSE_DIR = previous.responseDir;
      await close();
      await rm(directory, { recursive: true, force: true });
    }
  });

test('year-sized EOD request reserves each attempt and publishes one immutable archive chunk',
  { skip: process.env.LESINE_RUN_DB_TESTS !== '1' }, async () => {
    if (process.env.LESINE_TEST_DATABASE !== '1') throw new Error('Requires isolated test database');
    const { pool, close } = await isolatedImportPool();
    const directory = await mkdtemp(join(tmpdir(), 'lesine-year-import-'));
    const previous = { token: process.env.EODHD_API_TOKEN, budget: process.env.LESINE_EODHD_DAILY_BUDGET,
      responseDir: process.env.LESINE_RESPONSE_DIR };
    const symbolId = randomUUID();
    const jobId = randomUUID();
    const chunkId = randomUUID();
    process.env.EODHD_API_TOKEN = 'fixture-token';
    process.env.LESINE_EODHD_DAILY_BUDGET = '3';
    process.env.LESINE_RESPONSE_DIR = directory;
    try {
      await pool.query("DELETE FROM source_daily_budget WHERE provider = 'eodhd' AND utc_day = (now() AT TIME ZONE 'UTC')::date");
      await pool.query(
        `INSERT INTO source_symbols(id, provider, provider_symbol, listing_state, market_segment,
         identity_evidence_ref, first_seen_at, last_seen_at)
         VALUES ($1, 'eodhd', $2, 'active', 'main', 'fixture', now(), now())`,
        [symbolId, `TEST${symbolId.slice(0, 8).toUpperCase()}`],
      );
      await pool.query(
        `INSERT INTO import_jobs(id, provider, market_scope, data_classes, from_date, to_date, scope_hash, mode)
         VALUES ($1, 'eodhd', 'main', ARRAY['daily_bars'], '2025-01-01', '2026-01-01', $2, 'incremental')`,
        [jobId, randomUUID()],
      );
      await pool.query(`INSERT INTO import_chunks(id, job_id, resource_key, from_date, to_date)
        VALUES ($1, $2, $3, '2025-01-01', '2026-01-01')`, [chunkId, jobId, symbolId]);
      let requests = 0;
      const payload = JSON.stringify([
        { date: '2025-01-02', open: 1, high: 3, low: 1, close: 2, adjusted_close: 2, volume: 100 },
        { date: '2025-12-31', open: 2, high: 4, low: 2, close: 3, adjusted_close: 3, volume: 200 },
      ]);
      const fetcher: typeof fetch = async (input) => {
        requests += 1;
        const url = new URL(String(input));
        assert.equal(url.searchParams.get('from'), '2025-01-01');
        assert.equal(url.searchParams.get('to'), '2026-01-01');
        return requests === 1
          ? new Response('rate limited', { status: 429, headers: { 'Retry-After': '60' } })
          : new Response(payload, { status: 200 });
      };
      await processImport(pool, fetcher);
      assert.equal(requests, 1);
      assert.equal((await pool.query('SELECT status FROM import_jobs WHERE id = $1', [jobId])).rows[0].status, 'quota_wait');
      await pool.query("UPDATE import_jobs SET retry_after_utc = now() - interval '1 second' WHERE id = $1", [jobId]);
      await processImport(pool, fetcher);
      assert.equal(requests, 2);
      const budget = await pool.query(
        "SELECT reserved_calls FROM source_daily_budget WHERE provider = 'eodhd' AND utc_day = (now() AT TIME ZONE 'UTC')::date");
      assert.equal(budget.rows[0].reserved_calls, 2, 'one reservation for each provider attempt');
      const chunk = await pool.query('SELECT attempts, status, response_hash, file_id, manifest_id FROM import_chunks WHERE id = $1', [chunkId]);
      assert.equal(chunk.rows[0].attempts, 2);
      assert.equal(chunk.rows[0].status, 'done');
      assert.equal((await readFile(join(directory, chunk.rows[0].file_id as string), 'utf8')), payload);
      assert.equal(chunk.rows[0].response_hash, createHash('sha256').update(payload).digest('hex'));
      const manifest = await pool.query('SELECT sha256, row_count FROM raw_file_manifests WHERE id = $1', [chunk.rows[0].manifest_id]);
      assert.equal(manifest.rows[0].sha256, chunk.rows[0].response_hash);
      assert.equal(manifest.rows[0].row_count, 2);
      assert.equal((await pool.query('SELECT count(*)::int AS count FROM daily_bar_revisions WHERE source_symbol_id = $1',
        [symbolId])).rows[0].count, 2);
      await processImport(pool, async () => { throw new Error('completed import must not be retried'); });
      assert.equal((await pool.query('SELECT status FROM import_jobs WHERE id = $1', [jobId])).rows[0].status, 'done');
    } finally {
      await pool.query('TRUNCATE raw_file_manifest_revisions, daily_bar_revisions, raw_file_manifests CASCADE');
      await pool.query('DELETE FROM import_chunks WHERE job_id = $1', [jobId]);
      await pool.query('DELETE FROM import_jobs WHERE id = $1', [jobId]);
      await pool.query('DELETE FROM source_symbols WHERE id = $1', [symbolId]);
      await pool.query("DELETE FROM source_daily_budget WHERE provider = 'eodhd' AND utc_day = (now() AT TIME ZONE 'UTC')::date");
      await close();
      await rm(directory, { recursive: true, force: true });
      for (const [key, value] of [['EODHD_API_TOKEN', previous.token], ['LESINE_EODHD_DAILY_BUDGET', previous.budget], ['LESINE_RESPONSE_DIR', previous.responseDir]] as const) {
        if (value === undefined) delete process.env[key]; else process.env[key] = value;
      }
    }
  });
