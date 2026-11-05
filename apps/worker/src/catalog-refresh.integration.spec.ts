import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { test } from 'node:test';
import { Pool } from 'pg';
import { processCatalogRefresh, queueCatalogRefresh } from './catalog-refresh.js';

const symbol = (code: string) => ({ Code: code, Name: code, Isin: `PL${code.padEnd(10, '0')}`, Type: 'Common Stock' });

test('catalog jobs publish complete versions, preserve older identities and resume staged parts',
  { skip: process.env.LESINE_RUN_DB_TESTS !== '1' }, async () => {
    if (process.env.LESINE_TEST_DATABASE !== '1') throw new Error('Refusing catalog integration outside an isolated database');
    const name = `lesine_catalog_refresh_${randomUUID().replaceAll('-', '')}`;
    const originalDatabase = process.env.PGDATABASE;
    const originalDirectory = process.env.LESINE_RESPONSE_DIR;
    const originalToken = process.env.EODHD_API_TOKEN;
    const originalLimit = process.env.LESINE_EODHD_DAILY_BUDGET;
    const directory = await mkdtemp(join(tmpdir(), 'lesine-catalog-refresh-'));
    const admin = new Pool();
    try {
      await admin.query(`CREATE DATABASE ${name}`);
      process.env.PGDATABASE = name;
      process.env.LESINE_RESPONSE_DIR = directory;
      process.env.EODHD_API_TOKEN = 'fixture-token';
      process.env.LESINE_EODHD_DAILY_BUDGET = '20';
      const pool = new Pool();
      try {
        for (const file of (await readdir(resolve('db/migrations'))).filter((item) => /^\d{3}_.*\.sql$/.test(item)).sort()) {
          await pool.query(await readFile(resolve('db/migrations', file), 'utf8'));
        }
        const fetchPair = (active: string, delisted: string, calls: string[]): typeof fetch => async (input) => {
          const state = new URL(String(input)).searchParams.has('delisted') ? 'delisted' : 'active';
          calls.push(state);
          return new Response(JSON.stringify([symbol(state === 'active' ? active : delisted)]));
        };
        const firstCalls: string[] = [];
        await queueCatalogRefresh(pool);
        await Promise.all([processCatalogRefresh(pool, fetchPair('OLD', 'DEAD', firstCalls)),
          processCatalogRefresh(pool, fetchPair('OLD', 'DEAD', firstCalls))]);
        assert.deepEqual(firstCalls, ['active', 'delisted']);
        const first = await pool.query<{ id: string }>("SELECT job_id AS id FROM catalog_head WHERE provider = 'eodhd'");
        assert.ok(first.rows[0]?.id);
        const firstMembers = await pool.query(`SELECT s.provider_symbol FROM catalog_head h
          JOIN catalog_refresh_members m ON m.job_id = h.job_id
          JOIN source_symbols s ON s.id = m.source_symbol_id ORDER BY s.provider_symbol`);
        assert.deepEqual(firstMembers.rows.map((row) => row.provider_symbol), ['DEAD', 'OLD']);

        const secondCalls: string[] = [];
        await queueCatalogRefresh(pool);
        await processCatalogRefresh(pool, fetchPair('NEW', 'DEAD', secondCalls));
        assert.deepEqual(secondCalls, ['active', 'delisted']);
        const current = await pool.query(`SELECT s.provider_symbol FROM catalog_head h
          JOIN catalog_refresh_members m ON m.job_id = h.job_id
          JOIN source_symbols s ON s.id = m.source_symbol_id ORDER BY s.provider_symbol`);
        assert.deepEqual(current.rows.map((row) => row.provider_symbol), ['DEAD', 'NEW']);
        assert.equal((await pool.query("SELECT count(*)::int AS n FROM source_symbols WHERE provider_symbol = 'OLD'")).rows[0].n, 1);

        const retryCalls: string[] = [];
        const retryId = await queueCatalogRefresh(pool);
        await processCatalogRefresh(pool, async (input) => {
          const state = new URL(String(input)).searchParams.has('delisted') ? 'delisted' : 'active';
          retryCalls.push(state);
          return state === 'active' ? new Response(JSON.stringify([symbol('LATEST')]))
            : new Response('limited', { status: 429, headers: { 'Retry-After': '60' } });
        });
        assert.deepEqual(retryCalls, ['active', 'delisted']);
        const waiting = await pool.query("SELECT status, active_sha256 FROM catalog_refresh_jobs WHERE id = $1", [retryId]);
        assert.equal(waiting.rows[0].status, 'quota_wait');
        assert.ok(waiting.rows[0].active_sha256);
        assert.equal((await pool.query("SELECT job_id FROM catalog_head WHERE provider = 'eodhd'")).rows[0].job_id,
          (await pool.query("SELECT id FROM catalog_refresh_jobs WHERE status = 'done' AND origin = 'eodhd_war_pair' ORDER BY published_at DESC LIMIT 1")).rows[0].id);
        await pool.query("UPDATE catalog_refresh_jobs SET status = 'queued', retry_after_utc = NULL WHERE id = $1", [retryId]);
        const resumeCalls: string[] = [];
        await processCatalogRefresh(pool, fetchPair('SHOULD_NOT_FETCH', 'RETIRED', resumeCalls));
        assert.deepEqual(resumeCalls, ['delisted']);
        const resumed = await pool.query("SELECT status FROM catalog_refresh_jobs WHERE id = $1", [retryId]);
        assert.equal(resumed.rows[0].status, 'done');
        const latest = await pool.query(`SELECT s.provider_symbol FROM catalog_head h
          JOIN catalog_refresh_members m ON m.job_id = h.job_id
          JOIN source_symbols s ON s.id = m.source_symbol_id ORDER BY s.provider_symbol`);
        assert.deepEqual(latest.rows.map((row) => row.provider_symbol), ['LATEST', 'RETIRED']);

        const staleId = await queueCatalogRefresh(pool);
        await pool.query(`UPDATE catalog_refresh_jobs SET active_sha256 = $2,
          active_count = 1, active_fetched_at = now() - interval '25 hours' WHERE id = $1`,
        [staleId, waiting.rows[0].active_sha256]);
        const staleCalls: string[] = [];
        await processCatalogRefresh(pool, fetchPair('FRESH', 'OLD_DELISTED', staleCalls));
        assert.deepEqual(staleCalls, ['active', 'delisted']);
        assert.equal((await pool.query('SELECT status FROM catalog_refresh_jobs WHERE id = $1', [staleId])).rows[0].status, 'done');
        const preservedHead = (await pool.query("SELECT job_id FROM catalog_head WHERE provider = 'eodhd'")).rows[0].job_id;
        const malformedId = await queueCatalogRefresh(pool);
        await processCatalogRefresh(pool, fetchPair('DUPLICATE', 'DUPLICATE', []));
        assert.deepEqual((await pool.query('SELECT status, error_code FROM catalog_refresh_jobs WHERE id = $1',
          [malformedId])).rows[0], { status: 'failed', error_code: 'invalid_catalog_payload' });
        assert.equal((await pool.query("SELECT job_id FROM catalog_head WHERE provider = 'eodhd'")).rows[0].job_id,
          preservedHead, 'an invalid pair cannot change the published catalog');
      } finally { await pool.end(); }
    } finally {
      if (originalDatabase === undefined) delete process.env.PGDATABASE; else process.env.PGDATABASE = originalDatabase;
      if (originalDirectory === undefined) delete process.env.LESINE_RESPONSE_DIR; else process.env.LESINE_RESPONSE_DIR = originalDirectory;
      if (originalToken === undefined) delete process.env.EODHD_API_TOKEN; else process.env.EODHD_API_TOKEN = originalToken;
      if (originalLimit === undefined) delete process.env.LESINE_EODHD_DAILY_BUDGET; else process.env.LESINE_EODHD_DAILY_BUDGET = originalLimit;
      await admin.query(`DROP DATABASE IF EXISTS ${name}`);
      await admin.end();
      await rm(directory, { recursive: true, force: true });
    }
  });

test('catalog job refuses a daily budget below the two-list minimum without provider calls',
  { skip: process.env.LESINE_RUN_DB_TESTS !== '1' }, async () => {
    if (process.env.LESINE_TEST_DATABASE !== '1') throw new Error('Refusing catalog integration outside an isolated database');
    const name = `lesine_catalog_budget_${randomUUID().replaceAll('-', '')}`;
    const originalDatabase = process.env.PGDATABASE;
    const originalToken = process.env.EODHD_API_TOKEN;
    const originalLimit = process.env.LESINE_EODHD_DAILY_BUDGET;
    const admin = new Pool();
    try {
      await admin.query(`CREATE DATABASE ${name}`);
      process.env.PGDATABASE = name;
      process.env.EODHD_API_TOKEN = 'fixture-token';
      process.env.LESINE_EODHD_DAILY_BUDGET = '1';
      const pool = new Pool();
      try {
        for (const file of (await readdir(resolve('db/migrations'))).filter((item) => /^\d{3}_.*\.sql$/.test(item)).sort()) {
          await pool.query(await readFile(resolve('db/migrations', file), 'utf8'));
        }
        const id = await queueCatalogRefresh(pool);
        let calls = 0;
        await processCatalogRefresh(pool, async () => { calls += 1; return new Response('[]'); });
        assert.equal(calls, 0);
        const result = await pool.query('SELECT status, error_code FROM catalog_refresh_jobs WHERE id = $1', [id]);
        assert.deepEqual(result.rows[0], { status: 'failed', error_code: 'budget_below_catalog_minimum' });
      } finally { await pool.end(); }
    } finally {
      if (originalDatabase === undefined) delete process.env.PGDATABASE; else process.env.PGDATABASE = originalDatabase;
      if (originalToken === undefined) delete process.env.EODHD_API_TOKEN; else process.env.EODHD_API_TOKEN = originalToken;
      if (originalLimit === undefined) delete process.env.LESINE_EODHD_DAILY_BUDGET; else process.env.LESINE_EODHD_DAILY_BUDGET = originalLimit;
      await admin.query(`DROP DATABASE IF EXISTS ${name}`);
      await admin.end();
    }
  });
