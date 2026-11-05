import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseCorporateActions } from './corporate-actions.js';

test('dividend parser keeps historical and currently adjusted amounts distinct', () => {
  const events = parseCorporateActions(JSON.stringify([{ date: '2026-05-01', declarationDate: '2026-04-01',
    value: 0.5, unadjustedValue: 2, currency: 'PLN' }]), 'dividends', '2026-01-01', '2026-12-31');
  assert.equal(events[0].amount, 2);
  assert.equal(events[0].adjustedAmount, 0.5);
  assert.equal(events[0].availabilityEvidence, 'declaration_date_only');
  assert.equal(events[0].ambiguous, false);
});

test('split parser accepts reverse and fractional ratios without assuming whole factors', () => {
  const events = parseCorporateActions(JSON.stringify([{ date: '2026-05-01', split: '1.000000/8.000000' },
    { date: '2026-06-01', split: '71371.000000/2745.000000' }]), 'splits', '2026-01-01', '2026-12-31');
  assert.equal(events[0].splitNumerator, 1);
  assert.equal(events[0].splitDenominator, 8);
  assert.equal(events[1].splitNumerator, 71371);
});

test('two same-day dividends remain separate and ambiguous, while malformed inputs fail', () => {
  const events = parseCorporateActions(JSON.stringify([{ date: '2026-05-01', value: 1, currency: 'PLN' },
    { date: '2026-05-01', value: 2, currency: 'PLN' }]), 'dividends', '2026-01-01', '2026-12-31');
  assert.equal(events.length, 2);
  assert.ok(events.every((event) => event.ambiguous));
  assert.notEqual(events[0].eventKey, events[1].eventKey);
  assert.throws(() => parseCorporateActions('[{"date":"2026-05-01","split":"1/0"}]',
    'splits', '2026-01-01', '2026-12-31'), /invalid_action_payload/);
  assert.throws(() => parseCorporateActions('[{"date":"2026-02-30","value":1,"currency":"PLN"}]',
    'dividends', '2026-01-01', '2026-12-31'), /invalid_action_payload/);
});
