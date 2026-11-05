import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { test } from 'node:test';
import { Pool } from 'pg';

test('action migration joins an archive-generation counter installed earlier',
  { skip: process.env.LESINE_RUN_DB_TESTS !== '1' }, async () => {
    if (process.env.LESINE_TEST_DATABASE !== '1') throw new Error('Requires isolated test database');
    const name = `lesine_action_generation_${randomUUID().replaceAll('-', '')}`;
    const admin = new Pool();
    await admin.query(`CREATE DATABASE ${name}`);
    const pool = new Pool({ database: name });
    try {
      const migrations = (await readdir(resolve('db/migrations'))).filter((file) => /^\d{3}_.*\.sql$/.test(file)).sort();
      for (const file of migrations.filter((item) => item < '008_'))
        await pool.query(await readFile(resolve('db/migrations', file), 'utf8'));
      await pool.query(`CREATE TABLE archive_generation_state(singleton boolean PRIMARY KEY, generation bigint NOT NULL);
        INSERT INTO archive_generation_state(singleton, generation) VALUES (true, 1);
        CREATE FUNCTION assign_action_archive_generation() RETURNS trigger LANGUAGE plpgsql AS $$
        BEGIN UPDATE archive_generation_state SET generation = generation + 1 WHERE singleton = true
          RETURNING generation INTO NEW.archive_generation; RETURN NEW; END $$;`);
      await pool.query(await readFile(resolve('db/migrations/008_corporate_actions.sql'), 'utf8'));
      const hasColumn = await pool.query<{ exists: boolean }>(`SELECT EXISTS (
        SELECT 1 FROM information_schema.columns WHERE table_name = 'corporate_action_revisions'
          AND column_name = 'archive_generation') AS exists`);
      assert.equal(hasColumn.rows[0].exists, true);
      const symbol = 'a'.repeat(64);
      const job = randomUUID();
      const chunk = randomUUID();
      const manifest = randomUUID();
      await pool.query(`INSERT INTO source_symbols(id, provider, provider_symbol, listing_state,
        market_segment, identity_evidence_ref, first_seen_at, last_seen_at)
        VALUES ($1, 'eodhd', 'TEST', 'active', 'unclassified', 'fixture', now(), now())`, [symbol]);
      await pool.query(`INSERT INTO import_jobs(id, provider, market_scope, data_classes, from_date, to_date,
        scope_hash, mode, status) VALUES ($1, 'eodhd', 'all', ARRAY['dividends'], '2025-01-01',
        '2025-01-01', $2, 'backfill', 'done')`, [job, randomUUID()]);
      await pool.query(`INSERT INTO import_chunks(id, job_id, resource_key, from_date, to_date,
        status, data_class) VALUES ($1, $2, $3, '2025-01-01', '2025-01-01', 'done', 'dividends')`,
      [chunk, job, symbol]);
      await pool.query(`INSERT INTO raw_file_manifests(id, chunk_id, relative_path, sha256,
        provider, data_class, market_scope, min_date, max_date, row_count)
        VALUES ($1, $2, $3, $4, 'eodhd', 'dividends', 'all', '2025-01-01', '2025-01-01', 1)`,
      [manifest, chunk, `import/${'b'.repeat(64)}.json`, 'b'.repeat(64)]);
      await pool.query(`INSERT INTO corporate_action_revisions(id, provider, source_symbol_id,
        data_class, ex_date, event_key, fingerprint, state, amount, adjusted_amount, currency,
        first_manifest_id, availability_evidence)
        VALUES ($1, 'eodhd', $2, 'dividends', '2025-01-01', $3, $4, 'active', 1, 1, 'PLN',
        $5, 'first_import')`, [randomUUID(), symbol, 'c'.repeat(64), 'd'.repeat(64), manifest]);
      const result = await pool.query<{ generation: string; revision_generation: string }>(
        `SELECT s.generation::text, r.archive_generation::text AS revision_generation
         FROM archive_generation_state s CROSS JOIN corporate_action_revisions r`);
      assert.equal(result.rows[0].generation, '2');
      assert.equal(result.rows[0].revision_generation, '2');
    } finally {
      await pool.end();
      await admin.query(`DROP DATABASE ${name}`);
      await admin.end();
    }
  });
