import 'reflect-metadata';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { Pool } from 'pg';
import { Database } from './database.js';

test('forward-only migrations initialize an empty database and do not rerun after restart',
  { skip: process.env.LESINE_RUN_DB_TESTS !== '1' }, async () => {
    if (process.env.LESINE_TEST_DATABASE !== '1') throw new Error('Refusing to create a migration test database outside isolated tests');
    const name = `lesine_migration_${randomUUID().replaceAll('-', '')}`;
    const originalDatabase = process.env.PGDATABASE;
    const admin = new Pool();
    try {
      await admin.query(`CREATE DATABASE ${name}`);
      process.env.PGDATABASE = name;
      for (let attempt = 0; attempt < 2; attempt += 1) {
        const database = new Database();
        try {
          await database.onApplicationBootstrap();
          const versions = await database.pool.query('SELECT version FROM schema_migrations ORDER BY version');
          assert.deepEqual(versions.rows.map((row) => row.version), ['001_source_inventory', '002_source_depth_sample']);
          const tables = await database.pool.query("SELECT to_regclass('public.source_symbols') AS symbols, to_regclass('public.source_depth_samples') AS samples");
          assert.equal(tables.rows[0].symbols, 'source_symbols');
          assert.equal(tables.rows[0].samples, 'source_depth_samples');
        } finally { await database.onModuleDestroy(); }
      }
    } finally {
      if (originalDatabase === undefined) delete process.env.PGDATABASE; else process.env.PGDATABASE = originalDatabase;
      await admin.query(`DROP DATABASE IF EXISTS ${name}`);
      await admin.end();
    }
  });
