import { Injectable, OnApplicationBootstrap, OnModuleDestroy } from '@nestjs/common';
import { readFile, readdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { Pool } from 'pg';

@Injectable()
export class Database implements OnApplicationBootstrap, OnModuleDestroy {
  readonly pool = new Pool();

  async onApplicationBootstrap(): Promise<void> {
    const directory = resolve(process.cwd(), 'db/migrations');
    const migrations = (await readdir(directory)).filter((name) => /^\d{3}_[a-z0-9_]+\.sql$/.test(name)).sort();
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('SELECT pg_advisory_xact_lock(375091)');
      await client.query('CREATE TABLE IF NOT EXISTS schema_migrations (version text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())');
      for (const file of migrations) {
        const version = file.replace(/\.sql$/, '');
        const applied = await client.query('SELECT 1 FROM schema_migrations WHERE version = $1', [version]);
        if (applied.rowCount === 0) {
          await client.query(await readFile(resolve(directory, file), 'utf8'));
          await client.query('INSERT INTO schema_migrations(version) VALUES ($1)', [version]);
        }
      }
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.pool.end();
  }
}
