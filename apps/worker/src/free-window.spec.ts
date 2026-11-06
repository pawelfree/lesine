import assert from 'node:assert/strict';
import { test } from 'node:test';
import { freeWindowStart } from './import-jobs.js';

test('free window advances with the UTC day', () => {
  assert.equal(freeWindowStart(new Date('2026-11-05T23:59:59Z')), '2025-11-05');
  assert.equal(freeWindowStart(new Date('2026-11-06T00:00:00Z')), '2025-11-06');
});
