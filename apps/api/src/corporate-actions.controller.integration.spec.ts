import 'reflect-metadata';
import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { test } from 'node:test';
import { Pool } from 'pg';
import { CorporateActionsController } from './corporate-actions.controller.js';
import { Database } from './database.js';

test('corporate action API reads current revisions, paginates, and rejects corrupt evidence',
  { skip: process.env.LESINE_RUN_DB_TESTS !== '1' }, async () => {
    if (process.env.LESINE_TEST_DATABASE !== '1') throw new Error('Requires isolated test database');
    const database = `lesine_action_view_${randomUUID().replaceAll('-', '')}`;
    const root = await mkdtemp(join(tmpdir(), 'lesine-action-view-'));
    const previous = process.env.LESINE_RESPONSE_DIR;
    process.env.LESINE_RESPONSE_DIR = root;
    const admin = new Pool();
    await admin.query(`CREATE DATABASE ${database}`);
    const pool = new Pool({ database });
    try {
      for (const version of ['001_source_inventory', '002_source_depth_sample', '003_import_jobs',
        '004_immutable_eod_archive', '005_catalog_refresh', '006_eod_coverage',
        '007_remove_expected_coverage', '008_corporate_actions']) {
        await pool.query(await readFile(resolve('db/migrations', `${version}.sql`), 'utf8'));
      }
      const symbol = '1'.repeat(64);
      const otherSymbol = '2'.repeat(64);
      const dividendKey = 'a'.repeat(64);
      const splitKey = 'b'.repeat(64);
      await pool.query(`INSERT INTO source_symbols(id, provider, provider_symbol, listing_state,
        market_segment, identity_evidence_ref, first_seen_at, last_seen_at)
        VALUES ($1, 'eodhd', 'TEST', 'active', 'main', 'fixture', now(), now())`, [symbol]);
      await pool.query(`INSERT INTO source_symbols(id, provider, provider_symbol, listing_state,
        market_segment, identity_evidence_ref, first_seen_at, last_seen_at)
        VALUES ($1, 'eodhd', 'OTHER', 'active', 'main', 'fixture', now(), now())`, [otherSymbol]);
      const job = randomUUID();
      await pool.query(`INSERT INTO import_jobs(id, provider, market_scope, data_classes, from_date,
        to_date, scope_hash, mode, status) VALUES ($1, 'eodhd', 'main', ARRAY['dividends'],
        '2026-01-01', '2026-12-31', $2, 'backfill', 'done')`, [job, 'e'.repeat(64)]);
      const chunk = randomUUID();
      await pool.query(`INSERT INTO import_chunks(id, job_id, resource_key, data_class, from_date,
        to_date, status) VALUES ($1, $2, $3, 'dividends', '2026-01-01', '2026-12-31', 'done')`,
      [chunk, job, symbol]);
      await mkdir(join(root, 'import'));
      const manifestIds: string[] = [];
      const paths: string[] = [];
      for (const content of ['first action response', 'corrected action response']) {
        const sha = createHash('sha256').update(content).digest('hex');
        const path = join(root, 'import', `${sha}.json`);
        await writeFile(path, content);
        const manifest = randomUUID();
        const targetChunk = content === 'first action response' ? chunk : randomUUID();
        if (targetChunk !== chunk) {
          const correctionJob = randomUUID();
          await pool.query(`INSERT INTO import_jobs(id, provider, market_scope, data_classes, from_date,
            to_date, scope_hash, mode, status) VALUES ($1, 'eodhd', 'main', ARRAY['dividends'],
            '2026-01-01', '2026-12-31', $2, 'backfill', 'done')`, [correctionJob, '9'.repeat(64)]);
          await pool.query(`INSERT INTO import_chunks(id, job_id, resource_key, data_class, from_date,
            to_date, status) VALUES ($1, $2, $3, 'dividends', '2026-01-01', '2026-12-31', 'done')`,
          [targetChunk, correctionJob, symbol]);
        }
        await pool.query(`INSERT INTO raw_file_manifests(id, chunk_id, relative_path, sha256,
          provider, data_class, market_scope, min_date, max_date, row_count)
          VALUES ($1, $2, $3, $4, 'eodhd', 'dividends', 'main', '2026-05-01', '2026-05-01', 1)`,
        [manifest, targetChunk, `import/${sha}.json`, sha]);
        manifestIds.push(manifest);
        paths.push(path);
      }
      const first = randomUUID(), corrected = randomUUID();
      for (const [id, state, amount, seen, manifest] of [
        [first, 'active', 2, '2026-05-02T00:00:00Z', manifestIds[0]],
        [corrected, 'withdrawn', null, '2026-06-02T00:00:00Z', manifestIds[1]],
      ] as const) {
        await pool.query(`INSERT INTO corporate_action_revisions(id, provider, source_symbol_id,
          data_class, ex_date, event_key, fingerprint, state, amount, adjusted_amount, currency,
          first_manifest_id, first_seen_at, availability_evidence)
          VALUES ($1, 'eodhd', $2, 'dividends', '2026-05-01', $3, $4, $5,
          $6, $6, 'PLN', $7, $8, 'first_import')`,
        [id, symbol, dividendKey, 'c'.repeat(64), state, amount, manifest, seen]);
      }
      await pool.query(`INSERT INTO corporate_action_revisions(id, provider, source_symbol_id,
        data_class, ex_date, event_key, fingerprint, state, split_numerator, split_denominator,
        first_manifest_id, first_seen_at, availability_evidence)
        VALUES ($1, 'eodhd', $2, 'splits', '2026-05-03', $3, $4, 'active', 2, 1, $5,
        '2026-05-04T00:00:00Z', 'first_import')`,
      [randomUUID(), symbol, splitKey, 'd'.repeat(64), manifestIds[0]]);
      await pool.query(`INSERT INTO corporate_action_revisions(id, provider, source_symbol_id,
        data_class, ex_date, event_key, fingerprint, state, amount, adjusted_amount, currency,
        first_manifest_id, first_seen_at, availability_evidence)
        VALUES ($1, 'eodhd', $2, 'dividends', '2026-05-01', $3, $4, 'active', 3, 3, 'PLN',
        $5, '2026-05-03T00:00:00Z', 'first_import')`,
      [randomUUID(), otherSymbol, dividendKey, 'e'.repeat(64), manifestIds[0]]);
      for (let index = 1; index <= 100; index++) {
        await pool.query(`INSERT INTO corporate_action_revisions(id, provider, source_symbol_id,
          data_class, ex_date, event_key, fingerprint, state, amount, adjusted_amount, currency,
          first_manifest_id, first_seen_at, availability_evidence)
          VALUES ($1, 'eodhd', $2, 'dividends', '2026-04-01', $3, $4, 'active', 1, 1, 'PLN',
          $5, '2026-04-02T00:00:00Z', 'first_import')`,
        [randomUUID(), symbol, index.toString(16).padStart(64, '0'), 'f'.repeat(64), manifestIds[0]]);
      }
      const controller = new CorporateActionsController({ pool } as Database);
      const firstPage = await controller.list({ data_class: 'dividends' });
      assert.equal(firstPage.data.rows.length, 100);
      const correctedRow = firstPage.data.rows.find((row) => row.revision_id === corrected);
      assert.equal(correctedRow?.state, 'withdrawn');
      assert.equal(correctedRow?.has_older_revisions, true);
      assert.equal('relative_path' in firstPage.data.rows[0], false);
      assert.ok(firstPage.page.next_cursor);
      const secondPage = await controller.list({ data_class: 'dividends', cursor: firstPage.page.next_cursor });
      assert.equal(secondPage.data.rows.length, 2);
      assert.equal(secondPage.page.next_cursor, null);
      assert.equal((await controller.list({ data_class: 'splits' })).data.rows[0].event_key, splitKey);
      assert.equal((await controller.list({ provider_symbol: 'TEST', from_date: '2026-05-01' })).data.rows.length, 1);
      assert.equal((await controller.list({ provider_symbol: 'MISSING' })).data.rows.length, 0);
      assert.equal((await controller.list({ data_class: 'dividends', from_date: '2026-12-01' })).data.rows.length, 0);
      const history = await controller.revisions(dividendKey, { source_symbol_id: symbol });
      assert.deepEqual(history.data.rows.map((row) => row.revision_id), [corrected, first]);
      assert.equal((await controller.revisions(dividendKey, { source_symbol_id: otherSymbol })).data.rows.length, 1);
      await assert.rejects(() => controller.revisions(dividendKey, {}),
        (error: unknown) => (error as { status?: number }).status === 400);
      await assert.rejects(() => controller.list({ data_class: 'splits', cursor: firstPage.page.next_cursor }),
        (error: unknown) => (error as { status?: number }).status === 400);
      await assert.rejects(() => controller.list({ from_date: '2026-02-30' }),
        (error: unknown) => (error as { status?: number }).status === 400);
      await assert.rejects(() => controller.list({ provider_symbol: 'TEST;DROP' }),
        (error: unknown) => (error as { status?: number }).status === 400);
      await assert.rejects(() => controller.revisions(dividendKey, { source_symbol_id: symbol, cursor: 'malformed' }),
        (error: unknown) => (error as { status?: number }).status === 400);
      await writeFile(paths[1], 'corrupt');
      await assert.rejects(() => controller.list({ data_class: 'dividends' }),
        (error: unknown) => (error as { status?: number }).status === 503);
    } finally {
      await pool.end();
      await admin.query(`DROP DATABASE IF EXISTS ${database}`);
      await admin.end();
      if (previous === undefined) delete process.env.LESINE_RESPONSE_DIR;
      else process.env.LESINE_RESPONSE_DIR = previous;
      await rm(root, { recursive: true, force: true });
    }
  });
