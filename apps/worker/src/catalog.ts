import { createHash, randomUUID } from 'node:crypto';
import { link, mkdir, unlink, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import type { Pool, PoolClient } from 'pg';

export type ListingState = 'active' | 'delisted';
export type SourceSymbol = {
  id: string;
  providerSymbol: string;
  displayName: string | null;
  isin: string | null;
  instrumentType: string | null;
  listingState: ListingState;
  marketSegment: 'unclassified';
  evidenceRef: string;
};

const hash = (value: string): string => createHash('sha256').update(value).digest('hex');

export function normalizeCatalog(payload: unknown, listingState: ListingState, responseHash: string): SourceSymbol[] {
  if (!Array.isArray(payload) || payload.length > 5000) throw new Error('invalid_catalog_payload');
  const rows: SourceSymbol[] = [];
  for (const value of payload) {
    if (!value || typeof value !== 'object') throw new Error('invalid_catalog_row');
    const row = value as Record<string, unknown>;
    const code = typeof row.Code === 'string' ? row.Code.trim().toUpperCase() : '';
    if (!/^[A-Z0-9._-]{1,50}$/.test(code)) throw new Error('invalid_catalog_code');
    const name = typeof row.Name === 'string' ? row.Name.trim().slice(0, 300) : null;
    const isin = typeof row.Isin === 'string' && row.Isin.trim() ? row.Isin.trim().toUpperCase() : null;
    const instrumentType = typeof row.Type === 'string' ? row.Type.trim().toLowerCase().slice(0, 60) : null;
    // EODHD's WAR exchange code does not establish Main Market or NewConnect membership.
    // A changed ISIN/name/listing state gets another provisional source identity.
    const identity = JSON.stringify(['eodhd', code, isin, name, instrumentType, listingState]);
    rows.push({ id: hash(identity), providerSymbol: code, displayName: name, isin, instrumentType,
      listingState, marketSegment: 'unclassified', evidenceRef: `eodhd:WAR:${listingState}:${responseHash}` });
  }
  return rows;
}

export async function reserveCall(client: PoolClient, dailyLimit: number): Promise<boolean> {
  const day = new Date().toISOString().slice(0, 10);
  const result = await client.query(
    `INSERT INTO source_daily_budget(provider, utc_day, reserved_calls) VALUES ('eodhd', $1, 1)
     ON CONFLICT (provider, utc_day) DO UPDATE SET reserved_calls = source_daily_budget.reserved_calls + 1
     WHERE source_daily_budget.reserved_calls < $2 RETURNING reserved_calls`,
    [day, dailyLimit],
  );
  return result.rowCount === 1;
}

export async function recordProbe(pool: Pool, state: ListingState, status: 'available' | 'unavailable' | 'quota_wait', count: number | null, responseHash: string | null, code: string | null): Promise<void> {
  await pool.query(
    `INSERT INTO catalog_probes(provider, listing_state, status, item_count, response_sha256, error_code)
     VALUES ('eodhd', $1, $2, $3, $4, $5)`,
    [state, status, count, responseHash, code],
  );
}

async function probeDepth(pool: Pool, fetcher: typeof fetch, token: string, state: ListingState, symbol: string, dailyLimit: number): Promise<void> {
  const today = new Date();
  const sampleTo = today.toISOString().slice(0, 10);
  today.setUTCFullYear(today.getUTCFullYear() - 1);
  const sampleFrom = today.toISOString().slice(0, 10);
  for (const dataClass of ['eod', 'dividends', 'splits'] as const) {
    const alreadySampled = await pool.query(
      `SELECT 1 FROM source_depth_samples WHERE provider = 'eodhd' AND provider_symbol = $1
       AND listing_state = $2 AND data_class = $3 AND checked_at::date = CURRENT_DATE
       AND status IN ('available', 'empty') LIMIT 1`, [symbol, state, dataClass],
    );
    if (alreadySampled.rowCount) continue;
    const client = await pool.connect();
    let reserved = false;
    try { reserved = await reserveCall(client, dailyLimit); }
    finally { client.release(); }
    let status: 'available' | 'empty' | 'unavailable' | 'quota_wait' = 'quota_wait';
    let responseHash: string | null = null;
    let errorCode: string | null = reserved ? null : 'daily_budget_reached';
    let earliest: string | null = null;
    let latest: string | null = null;
    if (reserved) {
      const path = dataClass === 'dividends' ? 'div' : dataClass;
      const url = new URL(`https://eodhd.com/api/${path}/${encodeURIComponent(symbol)}.WAR`);
      url.searchParams.set('api_token', token);
      url.searchParams.set('fmt', 'json');
      url.searchParams.set('from', sampleFrom);
      url.searchParams.set('to', sampleTo);
      try {
        const response = await fetcher(url, { redirect: 'error', signal: AbortSignal.timeout(20_000) });
        if (!response.ok) throw new Error(response.status === 429 ? 'quota_wait' : 'source_unavailable');
        const raw = await response.text();
        if (raw.length > 5_000_000) throw new Error('invalid_depth_payload');
        const payload: unknown = JSON.parse(raw);
        if (!Array.isArray(payload)) throw new Error('invalid_depth_payload');
        const dates = payload.map((row: unknown) => row && typeof row === 'object' && 'date' in row ? (row as { date: unknown }).date : null);
        if (!dates.every((date) => typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date))) throw new Error('invalid_depth_payload');
        const ordered = (dates as string[]).sort();
        earliest = ordered[0] ?? null;
        latest = ordered.at(-1) ?? null;
        responseHash = hash(raw);
        await retainResponse(raw, responseHash);
        status = ordered.length ? 'available' : 'empty';
      } catch (error) {
        errorCode = error instanceof Error && error.message === 'quota_wait' ? 'quota_wait' : 'source_unavailable';
        status = errorCode === 'quota_wait' ? 'quota_wait' : 'unavailable';
      }
    }
    await pool.query(
      `INSERT INTO source_depth_samples(provider, provider_symbol, listing_state, data_class, sample_from, sample_to,
       earliest_observed, latest_observed, status, response_sha256, error_code)
       VALUES ('eodhd', $1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [symbol, state, dataClass, sampleFrom, sampleTo, earliest, latest, status, responseHash, errorCode],
    );
  }
}

export async function retainResponse(raw: string, responseHash: string): Promise<void> {
  const directory = resolve(process.env.LESINE_RESPONSE_DIR ?? '/data/provider-responses', 'catalog');
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const target = resolve(directory, `${responseHash}.json`);
  const temporary = resolve(directory, `.${randomUUID()}.tmp`);
  await writeFile(temporary, raw, { mode: 0o600, flag: 'wx' });
  try {
    await link(temporary, target);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
  } finally {
    await unlink(temporary);
  }
}

export async function probeCatalog(pool: Pool, fetcher: typeof fetch = fetch): Promise<void> {
  const lease = await pool.connect();
  let claimed = false;
  try {
    const lock = await lease.query('SELECT pg_try_advisory_lock(375092) AS claimed');
    claimed = lock.rows[0]?.claimed === true;
    if (!claimed) return;
    await probeCatalogUnlocked(pool, fetcher);
  } finally {
    try { if (claimed) await lease.query('SELECT pg_advisory_unlock(375092)'); }
    finally { lease.release(); }
  }
}

async function probeCatalogUnlocked(pool: Pool, fetcher: typeof fetch): Promise<void> {
  const token = process.env.EODHD_API_TOKEN;
  if (!token) {
    await Promise.all((['active', 'delisted'] as const).map((state) => recordProbe(pool, state, 'unavailable', null, null, 'missing_credential')));
    return;
  }
  const today = await pool.query<{ listing_state: ListingState }>(`SELECT DISTINCT listing_state
    FROM catalog_probes WHERE provider = 'eodhd' AND checked_at::date = CURRENT_DATE
      AND status = 'available'`);
  if (today.rows.length < 2) {
    const { queueCatalogRefresh, processCatalogRefresh } = await import('./catalog-refresh.js');
    await queueCatalogRefresh(pool);
    await processCatalogRefresh(pool, fetcher);
  }
  const current = await pool.query<{ listing_state: ListingState; provider_symbol: string }>(
    `SELECT DISTINCT ON (s.listing_state) s.listing_state, s.provider_symbol
     FROM catalog_head h JOIN catalog_refresh_jobs j ON j.id = h.job_id
     JOIN catalog_refresh_members m ON m.job_id = j.id
     JOIN source_symbols s ON s.id = m.source_symbol_id
     WHERE h.provider = 'eodhd' AND j.origin = 'eodhd_war_pair'
     ORDER BY s.listing_state, s.provider_symbol`,
  );
  const configured = Number(process.env.LESINE_EODHD_DAILY_BUDGET ?? '2');
  const dailyLimit = Number.isSafeInteger(configured) && configured >= 1 ? configured : 2;
  for (const row of current.rows) {
    await probeDepth(pool, fetcher, token, row.listing_state, row.provider_symbol, dailyLimit);
  }
}
