import { resolve } from 'node:path';
import { Pool } from 'pg';
import { exportBundle, restoreFiles, verifyArchive, verifyBundle } from './archive-files.js';

async function main(): Promise<void> {
  const [command, path] = process.argv.slice(2);
  if (command === 'check-bundle' && path) { await verifyBundle(resolve(path)); return; }
  if (command === 'restore-files' && path) { await restoreFiles(resolve(path)); return; }
  if (command !== 'export' && command !== 'verify') throw new Error('usage: archive-cli export <bundle> | verify | check-bundle <bundle> | restore-files <bundle>');
  const pool = new Pool();
  try {
    if (command === 'export' && path) await exportBundle(pool, resolve(path));
    else if (command === 'verify') {
      const result = await verifyArchive(pool);
      process.stdout.write(`Verified ${result.files} referenced files; ${result.legacyChunks} legacy chunks lack a manifest.\n`);
    } else throw new Error('bundle path required');
  } finally { await pool.end(); }
}

void main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : 'archive_operation_failed'}\n`);
  process.exitCode = 1;
});
