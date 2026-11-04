import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { mkdir, mkdtemp, readFile, rm, utimes, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { test } from 'node:test';
import { Pool } from 'pg';
import { exportBundle, verifyArchive, verifyBundle } from './archive-files.js';

test('legacy response files remain referenced before and after the manifest migration',
  { skip: process.env.LESINE_RUN_DB_TESTS !== '1' }, async () => {
    if (process.env.LESINE_TEST_DATABASE !== '1') throw new Error('Requires isolated test database');
    const name = `lesine_legacy_${randomUUID().replaceAll('-', '')}`;
    const admin = new Pool();
    const directory = await mkdtemp(join(tmpdir(), 'lesine-legacy-'));
    const originalRoot = process.env.LESINE_RESPONSE_DIR;
    process.env.LESINE_RESPONSE_DIR = directory;
    try {
      await admin.query(`CREATE DATABASE ${name}`);
      const pool = new Pool({ database: name });
      try {
        for (const migration of ['001_source_inventory', '002_source_depth_sample', '003_import_jobs']) {
          await pool.query(await readFile(resolve('db/migrations', `${migration}.sql`), 'utf8'));
        }
        const symbol = randomUUID();
        const job = randomUUID();
        const raw = '[]';
        const hash = createHash('sha256').update(raw).digest('hex');
        await mkdir(join(directory, 'import'));
        const response = join(directory, 'import', `${hash}.json`);
        await writeFile(response, raw);
        await utimes(response, new Date(0), new Date(0));
        await pool.query(`INSERT INTO source_symbols(id, provider, provider_symbol, listing_state,
          market_segment, identity_evidence_ref, first_seen_at, last_seen_at)
          VALUES ($1, 'eodhd', 'LEGACY', 'active', 'unclassified', 'fixture', now(), now())`, [symbol]);
        await pool.query(`INSERT INTO import_jobs(id, provider, market_scope, data_classes, from_date,
          to_date, scope_hash, mode, status) VALUES ($1, 'eodhd', 'all', ARRAY['daily_bars'],
          '2025-01-01', '2025-01-31', $2, 'backfill', 'done')`, [job, randomUUID()]);
        await pool.query(`INSERT INTO import_chunks(id, job_id, resource_key, from_date, to_date,
          status, response_hash, file_id) VALUES ($1, $2, $3, '2025-01-01', '2025-01-31',
          'done', $4, $5)`, [randomUUID(), job, symbol, hash, `${hash}.json`]);

        assert.deepEqual(await verifyArchive(pool, true), { files: 1, legacyChunks: 1 });
        const bundle = join(directory, 'bundle');
        await mkdir(bundle);
        await writeFile(join(bundle, 'database.dump'), 'fixture-dump');
        await exportBundle(pool, bundle);
        await verifyBundle(bundle);
        await pool.query(await readFile(resolve('db/migrations/004_immutable_eod_archive.sql'), 'utf8'));
        assert.deepEqual(await verifyArchive(pool, true), { files: 1, legacyChunks: 1 });
        assert.equal((await readFile(response, 'utf8')), raw, 'old file must not be quarantined');
      } finally { await pool.end(); }
    } finally {
      if (originalRoot === undefined) delete process.env.LESINE_RESPONSE_DIR;
      else process.env.LESINE_RESPONSE_DIR = originalRoot;
      await admin.query(`DROP DATABASE IF EXISTS ${name}`);
      await admin.end();
      await rm(directory, { recursive: true, force: true });
    }
  });
