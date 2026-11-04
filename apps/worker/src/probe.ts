import 'reflect-metadata';
import { Pool } from 'pg';
import { probeCatalog } from './catalog.js';

const pool = new Pool();
try {
  await probeCatalog(pool);
  process.stdout.write('Catalog probe finished; inspect /data for source status.\n');
} finally {
  await pool.end();
}
