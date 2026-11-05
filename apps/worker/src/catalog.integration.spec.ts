import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createHash, randomUUID } from 'node:crypto';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { Pool } from 'pg';
import { probeCatalog } from './catalog.js';

test('catalog probe persists two source identities and stops at the configured daily budget',
  { skip: process.env.LESINE_RUN_DB_TESTS !== '1' }, async () => {
    if (process.env.LESINE_TEST_DATABASE !== '1') throw new Error('Refusing to reset budget outside an isolated test database');
    const name = `lesine_catalog_probe_${randomUUID().replaceAll('-', '')}`;
    const admin = new Pool();
    const directory = await mkdtemp(join(tmpdir(), 'lesine-catalog-probe-'));
    const originalDatabase = process.env.PGDATABASE;
    const originalDirectory = process.env.LESINE_RESPONSE_DIR;
    await admin.query(`CREATE DATABASE ${name}`);
    process.env.PGDATABASE = name;
    process.env.LESINE_RESPONSE_DIR = directory;
    const pool = new Pool();
    const originalToken = process.env.EODHD_API_TOKEN;
    const originalLimit = process.env.LESINE_EODHD_DAILY_BUDGET;
    process.env.EODHD_API_TOKEN = 'fixture-token';
    process.env.LESINE_EODHD_DAILY_BUDGET = '8';
    let requested = 0;
    const fakeFetch: typeof fetch = async (input) => {
      requested += 1;
      const url = new URL(String(input));
      const delisted = url.searchParams.get('delisted') === '1';
      const payload = url.pathname.includes('exchange-symbol-list')
        ? [{ Code: delisted ? 'FORMER' : 'FIXTURE', Name: delisted ? 'Former Issuer' : 'Current Issuer', Isin: delisted ? 'PL0000000002' : 'PL0000000001', Type: 'Common Stock' }]
        : [{ date: new Date(Date.now() - 2 * 86_400_000).toISOString().slice(0, 10) }];
      return new Response(JSON.stringify(payload), { status: 200 });
    };
    try {
      for (const file of (await readdir(resolve('db/migrations'))).filter((item) => /^\d{3}_.*\.sql$/.test(item)).sort())
        await pool.query(await readFile(resolve('db/migrations', file), 'utf8'));
      await pool.query("DELETE FROM source_daily_budget WHERE provider = 'eodhd' AND utc_day = CURRENT_DATE");
      await pool.query("DELETE FROM catalog_probes WHERE provider = 'eodhd'");
      await pool.query("DELETE FROM source_depth_samples WHERE provider = 'eodhd' AND provider_symbol IN ('FIXTURE', 'FORMER')");
      await Promise.all([probeCatalog(pool, fakeFetch), probeCatalog(pool, fakeFetch)]);
      await probeCatalog(pool, fakeFetch);
      assert.equal(requested, 8);
      const symbols = await pool.query("SELECT id, listing_state, market_segment FROM source_symbols WHERE provider_symbol IN ('FIXTURE', 'FORMER')");
      assert.equal(symbols.rowCount, 2);
      assert.notEqual(symbols.rows[0].id, symbols.rows[1].id);
      assert.ok(symbols.rows.every((row) => row.market_segment === 'unclassified'));
      const probes = await pool.query("SELECT status FROM catalog_probes WHERE provider = 'eodhd' ORDER BY id DESC LIMIT 4");
      assert.deepEqual(probes.rows.slice(0, 2).map((row) => row.status), ['available', 'available']);
      const depth = await pool.query("SELECT status, earliest_observed FROM source_depth_samples WHERE provider_symbol IN ('FIXTURE', 'FORMER') ORDER BY id DESC LIMIT 6");
      assert.equal(depth.rowCount, 6);
      assert.ok(depth.rows.every((row) => row.status === 'available' && row.earliest_observed));
      const stored = await pool.query("SELECT response_sha256 FROM catalog_probes WHERE provider = 'eodhd' AND status = 'available' ORDER BY id DESC LIMIT 1");
      const sha = stored.rows[0].response_sha256 as string;
      const raw = await readFile(join(directory, 'catalog', `${sha}.json`));
      assert.equal(createHash('sha256').update(raw).digest('hex'), sha);

      await pool.query("DELETE FROM source_daily_budget WHERE provider = 'eodhd' AND utc_day = CURRENT_DATE");
      await pool.query("DELETE FROM catalog_probes WHERE provider = 'eodhd'");
      await pool.query("DELETE FROM source_depth_samples WHERE provider = 'eodhd' AND provider_symbol IN ('FIXTURE', 'FORMER')");
      process.env.LESINE_EODHD_DAILY_BUDGET = '2';
      requested = 0;
      await probeCatalog(pool, fakeFetch);
      assert.equal(requested, 2, 'both catalog lists must take priority over depth probes');
      const limitedProbes = await pool.query("SELECT listing_state, status FROM catalog_probes WHERE provider = 'eodhd' ORDER BY id DESC LIMIT 2");
      assert.deepEqual(limitedProbes.rows.map((row) => row.status), ['available', 'available']);
    } finally {
      if (originalToken === undefined) delete process.env.EODHD_API_TOKEN; else process.env.EODHD_API_TOKEN = originalToken;
      if (originalLimit === undefined) delete process.env.LESINE_EODHD_DAILY_BUDGET; else process.env.LESINE_EODHD_DAILY_BUDGET = originalLimit;
      await pool.end();
      if (originalDatabase === undefined) delete process.env.PGDATABASE; else process.env.PGDATABASE = originalDatabase;
      if (originalDirectory === undefined) delete process.env.LESINE_RESPONSE_DIR; else process.env.LESINE_RESPONSE_DIR = originalDirectory;
      await admin.query(`DROP DATABASE ${name}`);
      await admin.end();
      await rm(directory, { recursive: true, force: true });
    }
  });
