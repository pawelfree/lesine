import 'reflect-metadata';
import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { test } from 'node:test';
import { Pool } from 'pg';
import { Database } from './database.js';
import { IdentitiesController } from './identities.controller.js';

test('identity API reads only published links and refuses corrupted evidence',
  { skip: process.env.LESINE_RUN_DB_TESTS !== '1' }, async () => {
    if (process.env.LESINE_TEST_DATABASE !== '1') throw new Error('Requires isolated test database');
    const name = `lesine_identity_api_${randomUUID().replaceAll('-', '')}`;
    const admin = new Pool();
    const root = await mkdtemp(join(tmpdir(), 'lesine-identity-api-'));
    const oldRoot = process.env.LESINE_RESPONSE_DIR;
    process.env.LESINE_RESPONSE_DIR = root;
    await admin.query(`CREATE DATABASE ${name}`);
    const pool = new Pool({ database: name });
    try {
      for (const file of (await readdir(resolve('db/migrations'))).filter((item) => /^\d{3}_.*\.sql$/.test(item)).sort())
        await pool.query(await readFile(resolve('db/migrations', file), 'utf8'));
      const controller = new IdentitiesController({ pool } as Database);
      const symbol = 'a'.repeat(64);
      const unresolved = 'b'.repeat(64);
      for (const id of [symbol, unresolved]) await pool.query(`INSERT INTO source_symbols(id, provider, provider_symbol,
        listing_state, market_segment, identity_evidence_ref, first_seen_at, last_seen_at)
        VALUES ($1, 'eodhd', $2, 'active', 'unclassified', 'fixture', now(), now())`, [id, id]);
      const instrument = randomUUID();
      const batch = randomUUID();
      const bytes = Buffer.from('{"schema_version":1,"links":[]}');
      const sha = createHash('sha256').update(bytes).digest('hex');
      await mkdir(join(root, 'identity'));
      await writeFile(join(root, 'identity', `${sha}.json`), bytes);
      await pool.query('INSERT INTO instruments(id, stable_key) VALUES ($1, $2)', [instrument, 'issuer-a']);
      await pool.query(`INSERT INTO identity_batches(id, schema_version, sha256, relative_path)
        VALUES ($1, 1, $2, $3)`, [batch, sha, `identity/${sha}.json`]);
      await pool.query(`INSERT INTO identity_links(id, batch_id, source_symbol_id, instrument_id,
        valid_from, evidence_source, evidence_ref, evidence_observed_at)
        VALUES ($1, $2, $3, $4, '2024-01-01', 'owner-document', 'archive/page-1', '2025-01-01')`,
      [randomUUID(), batch, symbol, instrument]);
      await pool.query('INSERT INTO identity_head(batch_id) VALUES ($1)', [batch]);
      const found = await controller.instrument(instrument);
      assert.equal(found.data.batch_id, batch);
      assert.equal((found.data.links[0] as { evidence_class: string }).evidence_class, 'owner_attested');
      const gaps = await controller.unresolved();
      assert.deepEqual(gaps.data.rows.map((row) => (row as { id: string }).id), [unresolved]);
      await assert.rejects(() => controller.instrument(randomUUID()), (error: unknown) => (error as { status?: number }).status === 404);
      await writeFile(join(root, 'identity', `${sha}.json`), 'corrupt');
      await assert.rejects(() => controller.unresolved(), (error: unknown) => (error as { status?: number }).status === 503);
    } finally {
      await pool.end();
      await admin.query(`DROP DATABASE ${name}`);
      await admin.end();
      if (oldRoot === undefined) delete process.env.LESINE_RESPONSE_DIR;
      else process.env.LESINE_RESPONSE_DIR = oldRoot;
      await rm(root, { recursive: true, force: true });
    }
  });
