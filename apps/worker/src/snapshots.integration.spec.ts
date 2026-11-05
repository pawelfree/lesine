import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { test } from 'node:test';
import { Pool } from 'pg';
import { exportBundle, restoreFiles, verifyArchive } from './archive-files.js';
import { createSnapshot, readSnapshot, SnapshotError } from './snapshots.js';

test('strict snapshots pin committed revisions and reject unknown or corrupt provenance',
  { skip: process.env.LESINE_RUN_DB_TESTS !== '1' }, async () => {
    if (process.env.LESINE_TEST_DATABASE !== '1') throw new Error('Requires isolated test database');
    const name = `lesine_snapshots_${randomUUID().replaceAll('-', '')}`;
    const admin = new Pool();
    const root = await mkdtemp(join(tmpdir(), 'lesine-snapshots-'));
    const responses = join(root, 'responses');
    await mkdir(join(responses, 'import'), { recursive: true });
    const oldRoot = process.env.LESINE_RESPONSE_DIR;
    process.env.LESINE_RESPONSE_DIR = responses;
    await admin.query(`CREATE DATABASE ${name}`);
    const pool = new Pool({ database: name });
    const symbol = 'a'.repeat(64);
    const session = '2025-11-04';
    const earlier = new Date(Date.now() - 7_200_000).toISOString();
    const decision = new Date(Date.now() - 3_600_000).toISOString();
    const later = new Date(Date.now() - 1_800_000).toISOString();
    async function bar(close: number, available: string): Promise<{ id: string; file: string }> {
      const chunk = randomUUID();
      const job = randomUUID();
      const manifest = randomUUID();
      const revision = randomUUID();
      const bytes = Buffer.from(JSON.stringify([{ date: session, close }]));
      const sha = createHash('sha256').update(bytes).digest('hex');
      const path = join(responses, 'import', `${sha}.json`);
      await writeFile(path, bytes);
      await pool.query(`INSERT INTO import_jobs(id, provider, market_scope, data_classes, from_date, to_date,
        scope_hash, mode, status) VALUES ($1, 'eodhd', 'all', ARRAY['daily_bars'], $2, $2, $3, 'backfill', 'done')`,
      [job, session, randomUUID()]);
      await pool.query(`INSERT INTO import_chunks(id, job_id, resource_key, from_date, to_date, status)
        VALUES ($1, $2, $3, $4, $4, 'done')`, [chunk, job, symbol, session]);
      await pool.query(`INSERT INTO raw_file_manifests(id, chunk_id, relative_path, sha256, provider,
        data_class, market_scope, min_date, max_date, row_count, created_at)
        VALUES ($1, $2, $3, $4, 'eodhd', 'daily_bars', 'all', $5, $5, 1, $6)`,
      [manifest, chunk, `import/${sha}.json`, sha, session, available]);
      await pool.query('UPDATE import_chunks SET manifest_id = $2 WHERE id = $1', [chunk, manifest]);
      await pool.query(`INSERT INTO daily_bar_revisions(id, provider, source_symbol_id, session_date,
        open, high, low, close, volume, fingerprint, first_manifest_id, available_at)
        VALUES ($1, 'eodhd', $2, $3, 1, 2, 1, $4, 100, $5, $6, $7)`,
      [revision, symbol, session, close, createHash('sha256').update(String(close)).digest('hex'), manifest, available]);
      return { id: revision, file: path };
    }
    try {
      for (const file of (await readdir(resolve('db/migrations'))).filter((item) => /^\d{3}_.*\.sql$/.test(item)).sort())
        await pool.query(await readFile(resolve('db/migrations', file), 'utf8'));
      await pool.query(`INSERT INTO source_symbols(id, provider, provider_symbol, listing_state,
        market_segment, identity_evidence_ref, first_seen_at, last_seen_at)
        VALUES ($1, 'eodhd', 'TEST', 'active', 'unclassified', 'fixture', now(), now())`, [symbol]);
      const original = await bar(10, earlier);
      const request = { as_of_utc: decision, source_symbol_ids: [symbol], data_classes: ['daily_bars'] as const,
        from_date: session, to_date: session };
      const saved = await createSnapshot(pool, { ...request, data_classes: [...request.data_classes] });
      assert.equal(saved.evidence, 'verified');
      assert.equal(saved.evidence_scope, 'local_first_seen');
      await assert.rejects(() => createSnapshot(pool, { ...request, data_classes: ['dividends'] }),
        (error: unknown) => (error as SnapshotError).code === 'unsupported_data_class');
      const firstRead = await readSnapshot(pool, { snapshot_id: saved.snapshot_id, data_class: 'daily_bars' });
      assert.deepEqual(firstRead.rows.map((row) => (row as { revision_id: string }).revision_id), [original.id]);
      assert.equal((firstRead.rows[0] as { close: string }).close, '10');
      const corrected = await bar(11, later);
      const oldRead = await readSnapshot(pool, { snapshot_id: saved.snapshot_id, data_class: 'daily_bars' });
      assert.equal((oldRead.rows[0] as { revision_id: string }).revision_id, original.id);
      const sameCutoff = await createSnapshot(pool, { ...request, data_classes: [...request.data_classes] });
      const sameRead = await readSnapshot(pool, { snapshot_id: sameCutoff.snapshot_id, data_class: 'daily_bars' });
      assert.equal((sameRead.rows[0] as { revision_id: string }).revision_id, original.id);
      const recent = await createSnapshot(pool, { ...request, as_of_utc: new Date().toISOString(), data_classes: [...request.data_classes] });
      assert.equal(((await readSnapshot(pool, { snapshot_id: recent.snapshot_id, data_class: 'daily_bars' })).rows[0] as { revision_id: string }).revision_id, corrected.id);
      const assumed = await createSnapshot(pool, { ...request, as_of_utc: '2025-11-07T18:00:00Z',
        data_classes: [...request.data_classes], availability_policy: 'research_assumed_v1' });
      assert.equal(assumed.evidence, 'assumed');
      assert.equal(((await readSnapshot(pool, { snapshot_id: assumed.snapshot_id, data_class: 'daily_bars' })).rows[0] as { revision_id: string }).revision_id, original.id);
      const uncommitted = await pool.connect();
      try {
        await uncommitted.query('BEGIN');
        const manifest = await uncommitted.query<{ first_manifest_id: string }>(
          'SELECT first_manifest_id FROM daily_bar_revisions WHERE id = $1', [corrected.id]);
        await uncommitted.query(`INSERT INTO daily_bar_revisions(id, provider, source_symbol_id, session_date,
          open, high, low, close, volume, fingerprint, first_manifest_id, available_at)
          VALUES ($1, 'eodhd', $2, $3, 1, 2, 1, 12, 100, $4, $5, $6)`,
          [randomUUID(), symbol, session, 'd'.repeat(64), manifest.rows[0].first_manifest_id, earlier]);
        const concurrent = await createSnapshot(pool, { ...request, as_of_utc: new Date().toISOString(),
          data_classes: [...request.data_classes] });
        assert.equal(((await readSnapshot(pool, { snapshot_id: concurrent.snapshot_id, data_class: 'daily_bars' })).rows[0] as { revision_id: string }).revision_id, corrected.id);
      } finally {
        await uncommitted.query('ROLLBACK');
        uncommitted.release();
      }
      await assert.rejects(() => createSnapshot(pool, { ...request, as_of_utc: new Date(Date.now() - 10_800_000).toISOString(),
        data_classes: [...request.data_classes] }), (error: unknown) => (error as SnapshotError).code === 'unknown_availability');
      const count = await pool.query<{ count: string }>('SELECT count(*)::text AS count FROM data_snapshots');
      assert.equal(Number(count.rows[0].count), 5);
      const incomplete = await createSnapshot(pool, { ...request,
        as_of_utc: new Date(Date.now() - 10_800_000).toISOString(),
        data_classes: [...request.data_classes], allow_missing: true });
      assert.equal(incomplete.evidence, 'incomplete');
      assert.equal(incomplete.missing[0].reason, 'first_seen_after_cutoff');
      await assert.rejects(() => pool.query('UPDATE data_snapshots SET evidence = $2 WHERE id = $1',
        [saved.snapshot_id, 'assumed']), /append-only/);
      const bundle = join(root, 'bundle');
      await mkdir(bundle);
      await writeFile(join(bundle, 'database.dump'), 'fixture-dump');
      await exportBundle(pool, bundle);
      const recovered = join(root, 'recovered');
      await mkdir(recovered);
      process.env.LESINE_RESPONSE_DIR = recovered;
      await restoreFiles(bundle);
      assert.equal((await verifyArchive(pool)).files, 2);
      assert.equal(((await readSnapshot(pool, { snapshot_id: saved.snapshot_id, data_class: 'daily_bars' })).rows[0] as { revision_id: string }).revision_id, original.id);
      process.env.LESINE_RESPONSE_DIR = responses;
      await pool.query(`CREATE TABLE identity_batches(id uuid PRIMARY KEY, relative_path text NOT NULL, sha256 text NOT NULL)`);
      await pool.query(`CREATE TABLE identity_head(singleton boolean PRIMARY KEY, batch_id uuid NOT NULL)`);
      await pool.query(`CREATE TABLE identity_links(batch_id uuid NOT NULL, source_symbol_id text NOT NULL,
        instrument_id uuid NOT NULL, valid_from date NOT NULL, valid_to_exclusive date)`);
      const instrument = randomUUID();
      const identityBatch = randomUUID();
      const identityBytes = Buffer.from('{"schema_version":1,"links":[]}');
      const identitySha = createHash('sha256').update(identityBytes).digest('hex');
      await mkdir(join(responses, 'identity'));
      await writeFile(join(responses, 'identity', `${identitySha}.json`), identityBytes);
      await pool.query(`INSERT INTO identity_batches(id, relative_path, sha256) VALUES ($1, $2, $3)`,
        [identityBatch, `identity/${identitySha}.json`, identitySha]);
      await pool.query(`INSERT INTO identity_head(singleton, batch_id) VALUES (true, $1)`, [identityBatch]);
      await pool.query(`INSERT INTO identity_links(batch_id, source_symbol_id, instrument_id, valid_from)
        VALUES ($1, $2, $3, '2020-01-01')`, [identityBatch, symbol, instrument]);
      await pool.query(`ALTER TABLE raw_file_manifests DROP CONSTRAINT raw_file_manifests_data_class_check`);
      await pool.query(`ALTER TABLE raw_file_manifests ADD CONSTRAINT raw_file_manifests_data_class_check
        CHECK (data_class IN ('daily_bars', 'dividends', 'splits'))`);
      await pool.query(`CREATE TABLE corporate_action_revisions(id uuid PRIMARY KEY, source_symbol_id text NOT NULL,
        data_class text NOT NULL, ex_date date NOT NULL, event_key text NOT NULL, first_seen_at timestamptz NOT NULL,
        first_manifest_id uuid NOT NULL, state text NOT NULL, ambiguous boolean NOT NULL DEFAULT false,
        archive_generation bigint NOT NULL DEFAULT 1,
        amount numeric, adjusted_amount numeric,
        currency text, split_numerator numeric, split_denominator numeric)`);
      const actionBytes = Buffer.from('[{"date":"2025-11-04","value":1}]');
      const actionSha = createHash('sha256').update(actionBytes).digest('hex');
      await writeFile(join(responses, 'import', `${actionSha}.json`), actionBytes);
      const actionJob = randomUUID();
      const actionChunk = randomUUID();
      const actionManifest = randomUUID();
      const actionRevision = randomUUID();
      await pool.query(`INSERT INTO import_jobs(id, provider, market_scope, data_classes, from_date, to_date,
        scope_hash, mode, status) VALUES ($1, 'eodhd', 'all', ARRAY['daily_bars'], $2, $2, $3, 'backfill', 'done')`,
        [actionJob, session, randomUUID()]);
      await pool.query(`INSERT INTO import_chunks(id, job_id, resource_key, from_date, to_date, status)
        VALUES ($1, $2, $3, $4, $4, 'done')`, [actionChunk, actionJob, symbol, session]);
      await pool.query(`INSERT INTO raw_file_manifests(id, chunk_id, relative_path, sha256, provider,
        data_class, market_scope, min_date, max_date, row_count)
        VALUES ($1, $2, $3, $4, 'eodhd', 'dividends', 'all', $5, $5, 1)`,
        [actionManifest, actionChunk, `import/${actionSha}.json`, actionSha, session]);
      await pool.query('UPDATE import_chunks SET manifest_id = $2 WHERE id = $1', [actionChunk, actionManifest]);
      await pool.query(`INSERT INTO corporate_action_revisions(id, source_symbol_id, data_class, ex_date,
        event_key, first_seen_at, first_manifest_id, state, amount, adjusted_amount, currency)
        VALUES ($1, $2, 'dividends', $3, $4, now(), $5, 'active', 1, 1, 'PLN')`,
        [actionRevision, symbol, session, 'c'.repeat(64), actionManifest]);
      await assert.rejects(() => createSnapshot(pool, { ...request, as_of_utc: new Date().toISOString(),
        data_classes: ['dividends'] }), (error: unknown) => (error as SnapshotError).code === 'unknown_availability');
      const actionSnapshot = await createSnapshot(pool, { ...request, as_of_utc: new Date().toISOString(),
        data_classes: ['dividends'], availability_policy: 'research_assumed_v1' });
      assert.equal(actionSnapshot.identity_batch_id, identityBatch);
      assert.equal(actionSnapshot.evidence, 'assumed');
      const actionRead = await readSnapshot(pool, { snapshot_id: actionSnapshot.snapshot_id,
        data_class: 'dividends', instrument_id: instrument });
      assert.equal((actionRead.rows[0] as { revision_id: string }).revision_id, actionRevision);
      await pool.query(`INSERT INTO corporate_action_revisions(id, source_symbol_id, data_class, ex_date,
        event_key, first_seen_at, first_manifest_id, state, ambiguous, amount, adjusted_amount, currency)
        VALUES ($1, $2, 'dividends', $3, $4, now(), $5, 'active', true, 1, 1, 'PLN')`,
        [randomUUID(), symbol, session, 'c'.repeat(64), actionManifest]);
      await assert.rejects(() => createSnapshot(pool, { ...request, as_of_utc: new Date().toISOString(),
        data_classes: ['dividends'], availability_policy: 'research_assumed_v1' }),
      (error: unknown) => (error as SnapshotError).code === 'unknown_availability');
      const emptyDate = '2025-11-05';
      const emptyBytes = Buffer.from('[]');
      const emptySha = createHash('sha256').update(emptyBytes).digest('hex');
      await writeFile(join(responses, 'import', `${emptySha}.json`), emptyBytes);
      const emptyJob = randomUUID();
      const emptyChunk = randomUUID();
      await pool.query(`INSERT INTO import_jobs(id, provider, market_scope, data_classes, from_date, to_date,
        scope_hash, mode, status) VALUES ($1, 'eodhd', 'all', ARRAY['daily_bars'], $2, $2, $3, 'backfill', 'done')`,
        [emptyJob, emptyDate, randomUUID()]);
      await pool.query(`INSERT INTO import_chunks(id, job_id, resource_key, from_date, to_date, status)
        VALUES ($1, $2, $3, $4, $4, 'done')`, [emptyChunk, emptyJob, symbol, emptyDate]);
      const emptyManifest = randomUUID();
      await pool.query(`INSERT INTO raw_file_manifests(id, chunk_id, relative_path, sha256, provider,
        data_class, market_scope, row_count)
        VALUES ($1, $2, $3, $4, 'eodhd', 'dividends', 'all', 0)`,
        [emptyManifest, emptyChunk, `import/${emptySha}.json`, emptySha]);
      await pool.query('UPDATE import_chunks SET manifest_id = $2 WHERE id = $1', [emptyChunk, emptyManifest]);
      const empty = await createSnapshot(pool, { ...request, as_of_utc: new Date().toISOString(),
        from_date: emptyDate, to_date: emptyDate, data_classes: ['dividends'] });
      assert.equal(empty.evidence, 'verified');
      assert.equal((await readSnapshot(pool, { snapshot_id: empty.snapshot_id, data_class: 'dividends' })).rows.length, 0);
      await rm(join(responses, 'import', `${emptySha}.json`));
      await assert.rejects(() => readSnapshot(pool, { snapshot_id: empty.snapshot_id, data_class: 'dividends' }),
        (error: unknown) => (error as SnapshotError).code === 'snapshot_corrupt');
      await assert.rejects(() => createSnapshot(pool, { ...request, as_of_utc: new Date().toISOString(),
        from_date: '2025-11-06', to_date: '2025-11-06', data_classes: ['dividends'] }),
      (error: unknown) => (error as SnapshotError).code === 'unknown_availability');
      await assert.rejects(() => readSnapshot(pool, { snapshot_id: saved.snapshot_id,
        data_class: 'daily_bars', instrument_id: instrument }),
      (error: unknown) => (error as SnapshotError).code === 'identity_unresolved');
      await rm(original.file);
      await assert.rejects(() => readSnapshot(pool, { snapshot_id: saved.snapshot_id, data_class: 'daily_bars' }),
        (error: unknown) => (error as SnapshotError).code === 'snapshot_corrupt');
      await assert.rejects(() => readSnapshot(pool, { snapshot_id: randomUUID(), data_class: 'daily_bars' }),
        (error: unknown) => (error as SnapshotError).code === 'snapshot_not_found');
    } finally {
      await pool.end();
      await admin.query(`DROP DATABASE ${name}`);
      await admin.end();
      if (oldRoot === undefined) delete process.env.LESINE_RESPONSE_DIR;
      else process.env.LESINE_RESPONSE_DIR = oldRoot;
      await rm(root, { recursive: true, force: true });
    }
  });
