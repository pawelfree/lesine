import assert from 'node:assert/strict';
import { test } from 'node:test';
import { normalizeCatalog } from './catalog.js';

test('a reused ticker with different identity evidence remains a separate source symbol', () => {
  const rows = normalizeCatalog([
    { Code: 'ABC', Name: 'Old Issuer', Isin: 'PL0000000001', Type: 'Common Stock' },
    { Code: 'ABC', Name: 'New Issuer', Isin: 'PL0000000002', Type: 'Common Stock' },
  ], 'active', 'a'.repeat(64));
  assert.equal(rows.length, 2);
  assert.notEqual(rows[0].id, rows[1].id);
  assert.equal(rows[0].marketSegment, 'unclassified');
  assert.equal(rows[1].marketSegment, 'unclassified');
});

test('active and delisted catalogs do not silently share one identity', () => {
  const payload = [{ Code: 'ABC', Name: 'Issuer' }];
  assert.notEqual(normalizeCatalog(payload, 'active', 'a'.repeat(64))[0].id,
    normalizeCatalog(payload, 'delisted', 'b'.repeat(64))[0].id);
});

test('malformed provider payload cannot enter the local catalog', () => {
  assert.throws(() => normalizeCatalog({ message: 'error' }, 'active', 'a'.repeat(64)), /invalid_catalog_payload/);
  assert.throws(() => normalizeCatalog([{ Code: '' }], 'active', 'a'.repeat(64)), /invalid_catalog_code/);
});
