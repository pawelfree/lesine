import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { test } from 'node:test';
import { Pool } from 'pg';
import { exportBundle, referencedFiles, restoreFiles, verifyArchive, verifyBundle } from './archive-files.js';
import { importIdentities, validateIdentities } from './identities.js';

test('identity batches validate without writing, publish atomically and preserve older maps',
  { skip: process.env.LESINE_RUN_DB_TESTS !== '1' }, async () => {
    if (process.env.LESINE_TEST_DATABASE !== '1') throw new Error('Requires isolated test database');
    const name = `lesine_identities_${randomUUID().replaceAll('-', '')}`;
    const admin = new Pool();
    const root = await mkdtemp(join(tmpdir(), 'lesine-identities-'));
    const input = join(root, 'input');
    const responses = join(root, 'responses');
    await mkdir(input);
    await mkdir(responses);
    const oldInput = process.env.LESINE_IDENTITY_INPUT_DIR;
    const oldResponse = process.env.LESINE_RESPONSE_DIR;
    process.env.LESINE_IDENTITY_INPUT_DIR = input;
    process.env.LESINE_RESPONSE_DIR = responses;
    await admin.query(`CREATE DATABASE ${name}`);
    const pool = new Pool({ database: name });
    const symbol = 'a'.repeat(64);
    const evidence = { source: 'owner-document', ref: 'archive/page-1', observed_at: '2025-01-01' };
    const makeMap = (instrument_key: string) => ({ schema_version: 1, links: [{ source_symbol_id: symbol,
      instrument_key, valid_from: '2024-01-01', valid_to_exclusive: null, evidence }] });
    try {
      for (const file of (await readdir(resolve('db/migrations'))).filter((item) => /^\d{3}_.*\.sql$/.test(item)).sort())
        await pool.query(await readFile(resolve('db/migrations', file), 'utf8'));
      await pool.query(`INSERT INTO source_symbols(id, provider, provider_symbol, listing_state,
        market_segment, identity_evidence_ref, first_seen_at, last_seen_at)
        VALUES ($1, 'eodhd', 'TEST', 'active', 'unclassified', 'fixture', now(), now())`, [symbol]);
      const file = join(input, 'map.json');
      await writeFile(file, JSON.stringify(makeMap('issuer-a')));
      const checked = await validateIdentities(pool, file);
      assert.equal(checked.map.links.length, 1);
      assert.equal((await pool.query('SELECT count(*)::int AS n FROM identity_batches')).rows[0].n, 0);
      const first = await importIdentities(pool, file);
      assert.equal(first.link_count, 1);
      assert.equal(first.unresolved_count, 0);
      assert.deepEqual(await importIdentities(pool, file), first);
      const evidenceFile = join(responses, 'identity', `${first.sha256}.json`);
      assert.equal(createHash('sha256').update(await readFile(evidenceFile)).digest('hex'), first.sha256);
      assert.deepEqual((await referencedFiles(pool)).filter((ref) => ref.relative_path.startsWith('identity/')),
        [{ relative_path: `identity/${first.sha256}.json`, sha256: first.sha256 }]);
      await verifyArchive(pool);
      await writeFile(file, JSON.stringify({ schema_version: 1, links: [makeMap('issuer-b').links[0],
        { ...makeMap('issuer-a').links[0], valid_from: '2024-06-01' }] }));
      await assert.rejects(() => importIdentities(pool, file), /identity_period_overlap/);
      assert.equal((await pool.query('SELECT batch_id FROM identity_head')).rows[0].batch_id, first.batch_id);
      await writeFile(file, JSON.stringify(makeMap('issuer-b')));
      const second = await importIdentities(pool, file);
      assert.notEqual(second.batch_id, first.batch_id);
      assert.equal((await pool.query('SELECT batch_id FROM identity_head')).rows[0].batch_id, second.batch_id);
      assert.equal((await pool.query('SELECT count(*)::int AS n FROM identity_links WHERE batch_id = $1', [first.batch_id])).rows[0].n, 1);
      assert.equal((await pool.query('SELECT count(*)::int AS n FROM identity_batches')).rows[0].n, 2);
      await writeFile(file, JSON.stringify(makeMap('issuer-a')));
      const restored = await importIdentities(pool, file);
      assert.notEqual(restored.batch_id, first.batch_id);
      assert.equal(restored.sha256, first.sha256);
      const bundle = join(root, 'bundle');
      await mkdir(bundle);
      await writeFile(join(bundle, 'database.dump'), 'fixture-database-dump');
      await exportBundle(pool, bundle);
      assert.equal((await verifyBundle(bundle)).files.filter((ref) => ref.relative_path.startsWith('identity/')).length, 2);
      const recovered = join(root, 'recovered');
      await mkdir(recovered);
      process.env.LESINE_RESPONSE_DIR = recovered;
      await restoreFiles(bundle);
      assert.equal((await verifyArchive(pool)).files, 2);
      process.env.LESINE_RESPONSE_DIR = responses;
      const reusedSymbol = 'b'.repeat(64);
      await pool.query(`INSERT INTO source_symbols(id, provider, provider_symbol, listing_state,
        market_segment, identity_evidence_ref, first_seen_at, last_seen_at)
        VALUES ($1, 'eodhd', 'TEST', 'active', 'unclassified', 'fixture', now(), now())`, [reusedSymbol]);
      await writeFile(file, JSON.stringify({ schema_version: 1, links: [makeMap('issuer-a').links[0],
        { ...makeMap('issuer-b').links[0], source_symbol_id: reusedSymbol }] }));
      await assert.rejects(() => validateIdentities(pool, file), /identity_provider_symbol_ambiguous/);
      await writeFile(file, JSON.stringify(makeMap('issuer-a')));
      await writeFile(evidenceFile, 'corrupt');
      await assert.rejects(() => verifyArchive(pool), /archive_file_corrupt/);
      await assert.rejects(() => importIdentities(pool, file), /identity_evidence_corrupt/);
    } finally {
      await pool.end();
      await admin.query(`DROP DATABASE ${name}`);
      await admin.end();
      if (oldInput === undefined) delete process.env.LESINE_IDENTITY_INPUT_DIR;
      else process.env.LESINE_IDENTITY_INPUT_DIR = oldInput;
      if (oldResponse === undefined) delete process.env.LESINE_RESPONSE_DIR;
      else process.env.LESINE_RESPONSE_DIR = oldResponse;
      await rm(root, { recursive: true, force: true });
    }
  });

test('identity input rejects traversal and external symlinks before database access', async () => {
  const root = await mkdtemp(join(tmpdir(), 'lesine-identities-path-'));
  const old = process.env.LESINE_IDENTITY_INPUT_DIR;
  process.env.LESINE_IDENTITY_INPUT_DIR = root;
  try {
    await assert.rejects(() => validateIdentities({} as Pool, join(root, '..', 'outside.json')),
      /identity_input_path_invalid/);
    const duplicate = join(root, 'duplicate.json');
    await writeFile(duplicate, '{"schema_version":1,"schema_version":1,"links":[]}');
    await assert.rejects(() => validateIdentities({} as Pool, duplicate), /identity_duplicate_key/);
  } finally {
    if (old === undefined) delete process.env.LESINE_IDENTITY_INPUT_DIR;
    else process.env.LESINE_IDENTITY_INPUT_DIR = old;
    await rm(root, { recursive: true, force: true });
  }
});
