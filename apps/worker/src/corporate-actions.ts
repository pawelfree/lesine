import { createHash } from 'node:crypto';

export type ActionClass = 'dividends' | 'splits';
export type ActionEvent = {
  dataClass: ActionClass;
  exDate: string;
  eventKey: string;
  fingerprint: string;
  ambiguous: boolean;
  amount: number | null;
  adjustedAmount: number | null;
  currency: string | null;
  declarationDate: string | null;
  recordDate: string | null;
  paymentDate: string | null;
  splitNumerator: number | null;
  splitDenominator: number | null;
  splitRaw: string | null;
  availabilityEvidence: 'declaration_date_only' | 'ex_date_only';
};

const sha = (value: unknown): string => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const bad = (): never => { throw new Error('invalid_action_payload'); };

function date(value: unknown, optional = false): string | null {
  if (optional && (value === null || value === undefined || value === '')) return null;
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return bad();
  const parsed = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) return bad();
  return value;
}

function nonnegative(value: unknown, optional = false): number | null {
  if (optional && (value === null || value === undefined)) return null;
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) return bad();
  return value;
}

export function parseCorporateActions(raw: string, dataClass: ActionClass, fromDate: string, toDate: string): ActionEvent[] {
  if (raw.length > 5_000_000) return bad();
  let rows: unknown;
  try { rows = JSON.parse(raw) as unknown; } catch { return bad(); }
  if (!Array.isArray(rows)) return bad();
  const events = rows.map((item: unknown): ActionEvent => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return bad();
    const row = item as Record<string, unknown>;
    const exDate = date(row.date);
    if (!exDate || exDate < fromDate || exDate > toDate) return bad();
    if (dataClass === 'dividends') {
      const adjustedAmount = nonnegative(row.value);
      const amount = nonnegative(row.unadjustedValue, true);
      const currency = row.currency;
      if (typeof currency !== 'string' || !/^[A-Z]{3}$/.test(currency)) return bad();
      const declarationDate = date(row.declarationDate, true);
      const recordDate = date(row.recordDate, true);
      const paymentDate = date(row.paymentDate, true);
      const values = { exDate, amount, adjustedAmount, currency, declarationDate, recordDate, paymentDate };
      return { dataClass, ...values, eventKey: '', fingerprint: sha(values), ambiguous: false,
        splitNumerator: null, splitDenominator: null, splitRaw: null,
        availabilityEvidence: declarationDate ? 'declaration_date_only' : 'ex_date_only' };
    }
    const splitRaw = row.split;
    if (typeof splitRaw !== 'string' || !/^\d+(?:\.\d+)?\/\d+(?:\.\d+)?$/.test(splitRaw)) return bad();
    const [numerator, denominator] = splitRaw.split('/').map(Number);
    if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || numerator <= 0 || denominator <= 0) return bad();
    const values = { exDate, splitRaw, splitNumerator: numerator, splitDenominator: denominator };
    return { dataClass, ...values, eventKey: '', fingerprint: sha(values), ambiguous: false,
      amount: null, adjustedAmount: null, currency: null, declarationDate: null, recordDate: null,
      paymentDate: null, availabilityEvidence: 'ex_date_only' };
  });
  const counts = new Map<string, number>();
  for (const event of events) counts.set(event.exDate, (counts.get(event.exDate) ?? 0) + 1);
  const seen = new Set<string>();
  return events.map((event) => {
    const ambiguous = (counts.get(event.exDate) ?? 0) > 1;
    const eventKey = sha(ambiguous ? [dataClass, event.exDate, event.fingerprint] : [dataClass, event.exDate]);
    if (seen.has(eventKey)) return bad();
    seen.add(eventKey);
    return { ...event, eventKey, ambiguous };
  });
}
