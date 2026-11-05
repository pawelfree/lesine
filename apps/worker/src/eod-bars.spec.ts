import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseEodBars } from './eod-bars.js';

const row = { date: '2025-02-03', open: 1, high: 3, low: 1, close: 2, adjusted_close: 2, volume: 123 };

test('normalizes EOD bars and ignores JSON field order in revision fingerprints', () => {
  const first = parseEodBars(JSON.stringify([row]), '2025-02-01', '2025-02-28');
  const reordered = parseEodBars(JSON.stringify([{ volume: 123, close: 2, low: 1, high: 3,
    open: 1, date: '2025-02-03', adjusted_close: 2 }]), '2025-02-01', '2025-02-28');
  assert.deepEqual(first, reordered);
});

test('rejects malformed or duplicate observations without a partial result', () => {
  for (const payload of [
    [{ ...row, date: '2025-02-30' }], [{ ...row, volume: 1.5 }], [{ ...row, close: 4 }],
    [row, row], [{ ...row, date: '2025-03-01' }], [{ ...row, high: null }],
  ]) assert.throws(() => parseEodBars(JSON.stringify(payload), '2025-02-01', '2025-02-28'),
    /invalid_depth_payload/);
});
