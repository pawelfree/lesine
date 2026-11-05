import { Pool } from 'pg';
import { importIdentities, validateIdentities } from './identities.js';

async function main(): Promise<void> {
  const [domain, command, path] = process.argv.slice(2);
  if (domain !== 'identities' || !['validate', 'import'].includes(command ?? '') || !path)
    throw new Error('usage: identities validate|import <path>');
  const pool = new Pool();
  try {
    if (command === 'validate') {
      const result = await validateIdentities(pool, path);
      process.stdout.write(`${JSON.stringify({ sha256: result.sha256, link_count: result.map.links.length })}\n`);
    } else {
      process.stdout.write(`${JSON.stringify(await importIdentities(pool, path))}\n`);
    }
  } finally { await pool.end(); }
}

void main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : 'identity_operation_failed'}\n`);
  process.exitCode = 1;
});
