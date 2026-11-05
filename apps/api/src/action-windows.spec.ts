import assert from 'node:assert/strict';
import { test } from 'node:test';
import { missingActionWindows } from './import-jobs.controller.js';

test('action requests fetch only unarchived intervals, including after an empty response', () => {
  assert.deepEqual(missingActionWindows('2020-01-01', '2022-12-31', [
    { from_date: '2021-01-01', to_date: '2021-12-31' },
    { from_date: '2020-01-01', to_date: '2020-12-31' },
  ]), [{ from: '2022-01-01', to: '2022-12-31' }]);
  assert.deepEqual(missingActionWindows('2026-01-01', '2026-01-10', [
    { from_date: '2026-01-03', to_date: '2026-01-04' },
    { from_date: '2026-01-07', to_date: '2026-01-08' },
  ]), [
    { from: '2026-01-01', to: '2026-01-02' },
    { from: '2026-01-05', to: '2026-01-06' },
    { from: '2026-01-09', to: '2026-01-10' },
  ]);
});
