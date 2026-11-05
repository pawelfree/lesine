import { createHash, randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import type { Pool, PoolClient } from 'pg';
import { normalizeCatalog, recordProbe, reserveCall, retainResponse, type ListingState, type SourceSymbol } from './catalog.js';

type Status = 'queued' | 'running' | 'quota_wait' | 'failed' | 'done';
type Job = {
  id: string;
  active_sha256: string | null;
  active_fetched_at: Date | null;
  delisted_sha256: string | null;
  delisted_fetched_at: Date | null;
};
type Lease = { id: string; token: string };
const freshnessMs = 24 * 60 * 60 * 1000;
const hash = (raw: string): string => createHash('sha256').update(raw).digest('hex');

function nextUtcDay(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1));
}

function retryAfter(header: string | null): Date {
  if (header) {
    const seconds = Number(header);
    const parsed = Number.isFinite(seconds) && seconds >= 0 ? Date.now() + seconds * 1000 : Date.parse(header);
    if (Number.isFinite(parsed) && parsed > Date.now()) return new Date(parsed);
  }
  return nextUtcDay();
}

function dailyLimit(): number {
  const configured = Number(process.env.LESINE_EODHD_DAILY_BUDGET ?? '2');
  return Number.isSafeInteger(configured) && configured >= 1 ? configured : 2;
}

/** CLI uses the same job table and uniqueness guard as the UI. */
export async function queueCatalogRefresh(pool: Pool): Promise<string> {
  const id = randomUUID();
  try {
    await pool.query(`INSERT INTO catalog_refresh_jobs(id, provider, origin, status)
      VALUES ($1, 'eodhd', 'eodhd_war_pair', 'queued')`, [id]);
    return id;
  } catch (error) {
    if ((error as { code?: string }).code !== '23505') throw error;
    const active = await pool.query<{ id: string }>(`SELECT id FROM catalog_refresh_jobs
      WHERE provider = 'eodhd' AND origin = 'eodhd_war_pair'
        AND status IN ('queued', 'running', 'quota_wait') ORDER BY created_at DESC LIMIT 1`);
    if (!active.rows[0]) throw error;
    return active.rows[0].id;
  }
}

async function claim(pool: Pool): Promise<Lease | null> {
  const client = await pool.connect();
  const token = randomUUID();
  try {
    await client.query('BEGIN');
    const result = await client.query<{ id: string }>(`SELECT id FROM catalog_refresh_jobs
      WHERE status = 'queued' OR (status = 'quota_wait' AND retry_after_utc <= now())
        OR (status = 'running' AND lease_expires_at <= now())
      ORDER BY created_at FOR UPDATE SKIP LOCKED LIMIT 1`);
    const id = result.rows[0]?.id;
    if (!id) { await client.query('COMMIT'); return null; }
    await client.query(`UPDATE catalog_refresh_jobs SET status = 'running', lease_token = $2,
      lease_expires_at = now() + interval '120 seconds', retry_after_utc = NULL,
      error_code = NULL, updated_at = now() WHERE id = $1`, [id, token]);
    await client.query('COMMIT');
    return { id, token };
  } catch (error) { await client.query('ROLLBACK'); throw error; }
  finally { client.release(); }
}

async function fenced(client: PoolClient, lease: Lease): Promise<boolean> {
  const row = await client.query(`SELECT 1 FROM catalog_refresh_jobs
    WHERE id = $1 AND lease_token = $2 AND status = 'running' AND lease_expires_at > now()
    FOR UPDATE`, [lease.id, lease.token]);
  return row.rowCount === 1;
}

async function changeStatus(pool: Pool, lease: Lease, status: Status, code: string | null, retry: Date | null): Promise<void> {
  await pool.query(`UPDATE catalog_refresh_jobs SET status = $3, error_code = $4, retry_after_utc = $5,
    lease_token = NULL, lease_expires_at = NULL, updated_at = now()
    WHERE id = $1 AND lease_token = $2 AND status = 'running' AND lease_expires_at > now()`,
  [lease.id, lease.token, status, code, retry]);
}

async function checkpoint(pool: Pool, lease: Lease, state: ListingState, sha: string, count: number, fetchedAt: Date): Promise<boolean> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    if (!await fenced(client, lease)) { await client.query('ROLLBACK'); return false; }
    const prefix = state === 'active' ? 'active' : 'delisted';
    await client.query(`UPDATE catalog_refresh_jobs SET ${prefix}_sha256 = $2,
      ${prefix}_count = $3, ${prefix}_fetched_at = $4, updated_at = now() WHERE id = $1`,
    [lease.id, sha, count, fetchedAt]);
    await client.query('COMMIT');
    return true;
  } catch (error) { await client.query('ROLLBACK'); throw error; }
  finally { client.release(); }
}

async function stagedRows(sha: string, state: ListingState): Promise<SourceSymbol[]> {
  if (!/^[a-f0-9]{64}$/.test(sha)) throw new Error('invalid_catalog_payload');
  const path = resolve(process.env.LESINE_RESPONSE_DIR ?? '/data/provider-responses', 'catalog', `${sha}.json`);
  const raw = await readFile(path, 'utf8');
  if (hash(raw) !== sha) throw new Error('invalid_catalog_payload');
  return normalizeCatalog(JSON.parse(raw) as unknown, state, sha);
}

async function fetchPart(pool: Pool, lease: Lease, fetcher: typeof fetch, token: string, state: ListingState, limit: number): Promise<SourceSymbol[] | null> {
  const budgetClient = await pool.connect();
  let reserved = false;
  try { reserved = await reserveCall(budgetClient, limit); }
  finally { budgetClient.release(); }
  if (!reserved) {
    await changeStatus(pool, lease, 'quota_wait', 'daily_budget_reached', nextUtcDay());
    await recordProbe(pool, state, 'quota_wait', null, null, 'daily_budget_reached');
    return null;
  }
  const url = new URL('https://eodhd.com/api/exchange-symbol-list/WAR');
  url.searchParams.set('api_token', token);
  url.searchParams.set('fmt', 'json');
  if (state === 'delisted') url.searchParams.set('delisted', '1');
  try {
    const response = await fetcher(url, { redirect: 'error', signal: AbortSignal.timeout(20_000) });
    if (!response.ok) {
      if (response.status === 429) {
        await changeStatus(pool, lease, 'quota_wait', 'provider_rate_limit', retryAfter(response.headers.get('Retry-After')));
        await recordProbe(pool, state, 'quota_wait', null, null, 'provider_rate_limit');
        return null;
      }
      if (response.status === 402) {
        await changeStatus(pool, lease, 'quota_wait', 'provider_rate_limit', nextUtcDay());
        await recordProbe(pool, state, 'quota_wait', null, null, 'provider_rate_limit');
        return null;
      }
      throw new Error('source_unavailable');
    }
    const raw = await response.text();
    if (raw.length > 20_000_000) throw new Error('invalid_catalog_payload');
    let payload: unknown;
    try { payload = JSON.parse(raw) as unknown; }
    catch { throw new Error('invalid_catalog_payload'); }
    const sha = hash(raw);
    const rows = normalizeCatalog(payload, state, sha);
    await retainResponse(raw, sha);
    if (!await checkpoint(pool, lease, state, sha, rows.length, new Date())) return null;
    await recordProbe(pool, state, 'available', rows.length, sha, null);
    return rows;
  } catch (error) {
    const code = error instanceof Error && ['invalid_catalog_payload', 'invalid_catalog_row', 'invalid_catalog_code'].includes(error.message)
      ? 'invalid_catalog_payload' : 'source_unavailable';
    await changeStatus(pool, lease, 'failed', code, null);
    await recordProbe(pool, state, 'unavailable', null, null, code);
    return null;
  }
}

async function publish(pool: Pool, lease: Lease, rows: SourceSymbol[]): Promise<boolean> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('SELECT pg_advisory_xact_lock(375093)');
    if (!await fenced(client, lease)) { await client.query('ROLLBACK'); return false; }
    const payload = JSON.stringify(rows);
    await client.query(`INSERT INTO source_symbols(id, provider, provider_symbol, display_name,
      isin, instrument_type, listing_state, market_segment, identity_evidence_ref, first_seen_at, last_seen_at)
      SELECT x.id, 'eodhd', x."providerSymbol", x."displayName", x.isin,
        x."instrumentType", x."listingState", 'unclassified', x."evidenceRef", now(), now()
      FROM jsonb_to_recordset($1::jsonb) AS x(id text, "providerSymbol" text, "displayName" text,
        isin text, "instrumentType" text, "listingState" text, "evidenceRef" text)
      ON CONFLICT (id) DO UPDATE SET last_seen_at = now(),
        identity_evidence_ref = EXCLUDED.identity_evidence_ref`, [payload]);
    await client.query(`INSERT INTO catalog_refresh_members(job_id, source_symbol_id)
      SELECT $1, x.id FROM jsonb_to_recordset($2::jsonb) AS x(id text)
      ON CONFLICT DO NOTHING`, [lease.id, payload]);
    await client.query(`INSERT INTO catalog_head(provider, job_id) VALUES ('eodhd', $1)
      ON CONFLICT (provider) DO UPDATE SET job_id = EXCLUDED.job_id`, [lease.id]);
    await client.query(`UPDATE catalog_refresh_jobs SET status = 'done', published_at = now(),
      error_code = NULL, retry_after_utc = NULL, lease_token = NULL, lease_expires_at = NULL,
      updated_at = now() WHERE id = $1`, [lease.id]);
    await client.query('COMMIT');
    return true;
  } catch (error) { await client.query('ROLLBACK'); throw error; }
  finally { client.release(); }
}

/** Processes one durable, user-initiated catalog job. No provider call occurs without a job. */
export async function processCatalogRefresh(pool: Pool, fetcher: typeof fetch = fetch): Promise<boolean> {
  const lease = await claim(pool);
  if (!lease) return false;
  const token = process.env.EODHD_API_TOKEN;
  if (!token) { await changeStatus(pool, lease, 'failed', 'missing_credential', null); return true; }
  const limit = dailyLimit();
  if (limit < 2) { await changeStatus(pool, lease, 'failed', 'budget_below_catalog_minimum', null); return true; }
  const job = (await pool.query<Job>(`SELECT id, active_sha256, active_fetched_at,
    delisted_sha256, delisted_fetched_at FROM catalog_refresh_jobs WHERE id = $1`, [lease.id])).rows[0];
  if (!job) return true;
  const now = Date.now();
  const fresh = (sha: string | null, at: Date | null): boolean =>
    Boolean(sha && at && now - at.getTime() >= 0 && now - at.getTime() <= freshnessMs);
  const needs = Number(!fresh(job.active_sha256, job.active_fetched_at)) +
    Number(!fresh(job.delisted_sha256, job.delisted_fetched_at));
  if (needs) {
    const reserved = (await pool.query<{ reserved_calls: number }>(`SELECT reserved_calls FROM source_daily_budget
      WHERE provider = 'eodhd' AND utc_day = (now() AT TIME ZONE 'UTC')::date`)).rows[0]?.reserved_calls ?? 0;
    if (limit - reserved < needs) { await changeStatus(pool, lease, 'quota_wait', 'daily_budget_reached', nextUtcDay()); return true; }
  }
  const result: SourceSymbol[] = [];
  for (const state of ['active', 'delisted'] as const) {
    const sha = state === 'active' ? job.active_sha256 : job.delisted_sha256;
    const at = state === 'active' ? job.active_fetched_at : job.delisted_fetched_at;
    let rows: SourceSymbol[];
    if (fresh(sha, at)) {
      try { rows = await stagedRows(sha!, state); }
      catch {
        await changeStatus(pool, lease, 'failed', 'invalid_catalog_payload', null);
        return true;
      }
    } else {
      const downloaded = await fetchPart(pool, lease, fetcher, token, state, limit);
      if (!downloaded) return true;
      rows = downloaded;
    }
    result.push(...rows);
  }
  const codes = new Set(result.map((row) => row.providerSymbol));
  if (!result.length || codes.size !== result.length) {
    await changeStatus(pool, lease, 'failed', 'invalid_catalog_payload', null);
    return true;
  }
  const times = (await pool.query<{ active_fetched_at: Date; delisted_fetched_at: Date }>(
    `SELECT active_fetched_at, delisted_fetched_at FROM catalog_refresh_jobs WHERE id = $1`, [lease.id])).rows[0];
  if (!times?.active_fetched_at || !times.delisted_fetched_at ||
      Math.abs(times.active_fetched_at.getTime() - times.delisted_fetched_at.getTime()) > freshnessMs ||
      Date.now() - Math.min(times.active_fetched_at.getTime(), times.delisted_fetched_at.getTime()) > freshnessMs) {
    await changeStatus(pool, lease, 'failed', 'stale_catalog_part', null);
    return true;
  }
  await publish(pool, lease, result);
  return true;
}
