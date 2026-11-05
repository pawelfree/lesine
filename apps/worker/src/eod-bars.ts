import { createHash } from 'node:crypto';

export type EodBar = {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  adjustedClose: number | null;
  volume: number;
  fingerprint: string;
};

const sha = (text: string): string => createHash('sha256').update(text).digest('hex');
const validPrice = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0;

export function parseEodBars(raw: string, fromDate: string, toDate: string): EodBar[] {
  if (raw.length > 5_000_000) throw new Error('invalid_depth_payload');
  let parsed: unknown;
  try { parsed = JSON.parse(raw) as unknown; }
  catch { throw new Error('invalid_depth_payload'); }
  if (!Array.isArray(parsed)) throw new Error('invalid_depth_payload');
  const seen = new Set<string>();
  return parsed.map((value: unknown) => {
    if (!value || typeof value !== 'object') throw new Error('invalid_depth_payload');
    const row = value as Record<string, unknown>;
    const date = row.date;
    if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
      date < fromDate || date > toDate || seen.has(date)) throw new Error('invalid_depth_payload');
    const timestamp = new Date(`${date}T00:00:00Z`);
    if (Number.isNaN(timestamp.getTime()) || timestamp.toISOString().slice(0, 10) !== date) {
      throw new Error('invalid_depth_payload');
    }
    seen.add(date);
    const { open, high, low, close, volume } = row;
    const adjusted = row.adjusted_close === undefined || row.adjusted_close === null ? null : row.adjusted_close;
    if (!validPrice(open) || !validPrice(high) || !validPrice(low) || !validPrice(close) ||
      !Number.isSafeInteger(volume) || (volume as number) < 0 ||
      (adjusted !== null && !validPrice(adjusted)) || low > high ||
      open < low || open > high || close < low || close > high) throw new Error('invalid_depth_payload');
    const bar = { date, open, high, low, close, adjustedClose: adjusted as number | null, volume: volume as number };
    return { ...bar, fingerprint: sha(JSON.stringify(Object.values(bar))) };
  });
}
