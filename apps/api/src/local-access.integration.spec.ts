import assert from 'node:assert/strict';
import { test } from 'node:test';

test('running API rejects foreign hosts, origins and writes without CSRF',
  { skip: process.env.LESINE_RUN_DB_TESTS !== '1' }, async () => {
    if (process.env.LESINE_TEST_DATABASE !== '1') throw new Error('HTTP integration test requires isolated Compose setup');
    const base = 'http://api:3000';
    const port = process.env.LESINE_WEB_PORT ?? '8080';
    const foreignHost = await fetch(`${base}/api/health`, { headers: { Host: 'foreign.example' } });
    assert.equal(foreignHost.status, 403);
    const foreignOrigin = await fetch(`${base}/api/health`, { headers: { Host: `localhost:${port}`, Origin: 'https://foreign.example' } });
    assert.equal(foreignOrigin.status, 403);
    const missingCsrf = await fetch(`${base}/api/catalog`, { method: 'POST', headers: { Host: `localhost:${port}`, Origin: `http://localhost:${port}` } });
    assert.equal(missingCsrf.status, 403);
    const catalogMutation = await fetch(`${base}/api/catalog-refreshes`, { method: 'POST',
      headers: { Host: `localhost:${port}`, Origin: `http://localhost:${port}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ expected_catalog_id: null, replace_existing: false }) });
    assert.equal(catalogMutation.status, 403);
  });
