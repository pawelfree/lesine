import { createHash, randomUUID } from 'node:crypto';
import { link, mkdir, unlink, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import type { Pool, PoolClient } from 'pg';

const sha = (raw: string): string => createHash('sha256').update(raw).digest('hex');
export type JobStatus = 'queued' | 'running' | 'quota_wait' | 'paused' | 'failed' | 'done';
export type JobRequest = { marketScope: 'main' | 'newconnect' | 'all'; fromDate: string; toDate: string; mode: 'backfill' | 'incremental' };

function nextUtcDay(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1));
}

function retryAfter(header: string | null): Date {
  if (header) {
    const seconds = Number(header);
    const time = Number.isFinite(seconds) && seconds >= 0
      ? Date.now() + seconds * 1000 : Date.parse(header);
    if (Number.isFinite(time) && time > Date.now()) return new Date(Math.min(time, Date.now() + 86_400_000));
  }
  return nextUtcDay();
}

export type Lease = { id: string; token: string };

/** SKIP LOCKED makes competing workers claim distinct rows. Expiry reclaims abandoned work. */
export async function claimJob(pool: Pool): Promise<Lease | null> {
  const client = await pool.connect();
  const token = randomUUID();
  try {
    await client.query('BEGIN');
    const row = await client.query<{ id: string }>(
      `SELECT id FROM import_jobs WHERE status = 'queued'
          OR (status = 'quota_wait' AND retry_after_utc <= now())
          OR (status = 'running' AND lease_expires_at <= now())
       ORDER BY started_at FOR UPDATE SKIP LOCKED LIMIT 1`,
    );
    if (!row.rows[0]) { await client.query('COMMIT'); return null; }
    const id = row.rows[0].id;
    await client.query(
      `UPDATE import_jobs SET status = 'running', lease_token = $2, lease_expires_at = now() + interval '120 seconds',
       retry_after_utc = NULL, error_code = NULL, updated_at = now() WHERE id = $1`, [id, token],
    );
    await client.query('COMMIT');
    return { id, token };
  } catch (error) { await client.query('ROLLBACK'); throw error; }
  finally { client.release(); }
}

async function fenced(client: PoolClient, lease: Lease): Promise<boolean> {
  const row = await client.query(
    `SELECT 1 FROM import_jobs WHERE id = $1 AND lease_token = $2 AND status = 'running'
     AND lease_expires_at > now() FOR UPDATE`, [lease.id, lease.token],
  );
  return row.rowCount === 1;
}

export async function renewLease(pool: Pool, lease: Lease): Promise<boolean> {
  const result = await pool.query(
    `UPDATE import_jobs SET lease_expires_at = now() + interval '120 seconds', updated_at = now()
     WHERE id = $1 AND lease_token = $2 AND status = 'running' AND lease_expires_at > now()`, [lease.id, lease.token],
  );
  return result.rowCount === 1;
}

export async function commitChunk(pool: Pool, lease: Lease, chunkId: string, responseHash: string, fileId: string): Promise<boolean> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    if (!await fenced(client, lease)) { await client.query('ROLLBACK'); return false; }
    const chunk = await client.query<{ resource_key: string; from_date: Date | string }>(
      `UPDATE import_chunks SET status = 'done', response_hash = $3, file_id = $4, error_code = NULL
       WHERE id = $1 AND job_id = $2 AND status <> 'done'
       RETURNING resource_key, from_date`, [chunkId, lease.id, responseHash, fileId],
    );
    if (!chunk.rows[0]) { await client.query('ROLLBACK'); return false; }
    await client.query(
      `UPDATE import_jobs SET cursor = $2, updated_at = now() WHERE id = $1`,
      [lease.id, `${chunk.rows[0].resource_key}:${chunk.rows[0].from_date instanceof Date ? chunk.rows[0].from_date.toISOString().slice(0, 10) : chunk.rows[0].from_date}`],
    );
    await client.query('COMMIT');
    return true;
  } catch (error) { await client.query('ROLLBACK'); throw error; }
  finally { client.release(); }
}

async function changeStatus(pool: Pool, lease: Lease, status: JobStatus, errorCode: string | null, retry: Date | null): Promise<boolean> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    if (!await fenced(client, lease)) { await client.query('ROLLBACK'); return false; }
    await client.query(
      `UPDATE import_jobs SET status = $2, error_code = $3, retry_after_utc = $4,
       lease_token = NULL, lease_expires_at = NULL, updated_at = now() WHERE id = $1`,
      [lease.id, status, errorCode, retry],
    );
    await client.query('COMMIT'); return true;
  } catch (error) { await client.query('ROLLBACK'); throw error; }
  finally { client.release(); }
}

async function retain(raw: string, hash: string): Promise<string> {
  const directory = resolve(process.env.LESINE_RESPONSE_DIR ?? '/data/provider-responses', 'import');
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const target = resolve(directory, `${hash}.json`);
  const temp = resolve(directory, `.${randomUUID()}.tmp`);
  await writeFile(temp, raw, { flag: 'wx', mode: 0o600 });
  try { await link(temp, target); }
  catch (error) { if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error; }
  finally { await unlink(temp); }
  return `${hash}.json`;
}

/** One bounded request per invocation; caller may poll again after the claim is released. */
export async function processImport(pool: Pool, fetcher: typeof fetch = fetch): Promise<boolean> {
  const lease = await claimJob(pool);
  if (!lease) return false;
  const token = process.env.EODHD_API_TOKEN;
  if (!token) { await changeStatus(pool, lease, 'paused', 'missing_credential', null); return true; }
  const configured = Number(process.env.LESINE_EODHD_DAILY_BUDGET ?? '2');
  const budget = Number.isSafeInteger(configured) && configured >= 1 ? configured : 2;
  const chunk = await pool.query<{ id: string; resource_key: string; provider_symbol: string; from_date: string; to_date: string }>(
    `SELECT c.id, c.resource_key, s.provider_symbol,
       to_char(c.from_date, 'YYYY-MM-DD') AS from_date,
       to_char(c.to_date, 'YYYY-MM-DD') AS to_date
     FROM import_chunks c JOIN source_symbols s ON s.id = c.resource_key
     WHERE c.job_id = $1 AND c.status <> 'done' ORDER BY c.resource_key, c.from_date LIMIT 1`, [lease.id],
  );
  const item = chunk.rows[0];
  if (!item) { await changeStatus(pool, lease, 'done', null, null); return true; }
  if (!await renewLease(pool, lease)) return true;
  // Reservation and attempt increment share a transaction. Catalog probes use the same budget table.
  const client = await pool.connect();
  let reserved = false;
  try {
    await client.query('BEGIN');
    if (await fenced(client, lease)) {
      const day = new Date().toISOString().slice(0, 10);
      const result = await client.query(
        `INSERT INTO source_daily_budget(provider, utc_day, reserved_calls) VALUES ('eodhd', $1, 1)
         ON CONFLICT (provider, utc_day) DO UPDATE SET reserved_calls = source_daily_budget.reserved_calls + 1
         WHERE source_daily_budget.reserved_calls < $2 RETURNING reserved_calls`, [day, budget],
      );
      reserved = result.rowCount === 1;
      if (reserved) await client.query('UPDATE import_chunks SET status = $2, attempts = attempts + 1 WHERE id = $1', [item.id, 'running']);
    }
    await client.query('COMMIT');
  } catch (error) { await client.query('ROLLBACK'); throw error; }
  finally { client.release(); }
  if (!reserved) { await changeStatus(pool, lease, 'quota_wait', 'daily_budget_reached', nextUtcDay()); return true; }
  const url = new URL(`https://eodhd.com/api/eod/${encodeURIComponent(item.provider_symbol)}.WAR`);
  url.searchParams.set('api_token', token);
  url.searchParams.set('fmt', 'json');
  url.searchParams.set('from', item.from_date);
  url.searchParams.set('to', item.to_date);
  let raw: string;
  try {
    const response = await fetcher(url, { redirect: 'error', signal: AbortSignal.timeout(20_000) });
    if (response.status === 429) {
      await changeStatus(pool, lease, 'quota_wait', 'provider_rate_limit', retryAfter(response.headers.get('retry-after')));
      return true;
    }
    if (response.status === 401 || response.status === 403) {
      await changeStatus(pool, lease, 'failed', 'source_unavailable', null);
      return true;
    }
    if (!response.ok) throw new Error('source_unavailable');
    raw = await response.text();
    if (raw.length > 5_000_000) throw new Error('invalid_depth_payload');
    let data: unknown;
    try { data = JSON.parse(raw) as unknown; }
    catch { throw new Error('invalid_depth_payload'); }
    if (!Array.isArray(data) || !data.every((row) => row && typeof row === 'object' && typeof (row as { date?: unknown }).date === 'string'
      && /^\d{4}-\d{2}-\d{2}$/.test((row as { date: string }).date)
      && !Number.isNaN(Date.parse(`${(row as { date: string }).date}T00:00:00Z`))
      && new Date(`${(row as { date: string }).date}T00:00:00Z`).toISOString().slice(0, 10) === (row as { date: string }).date
      && (row as { date: string }).date >= item.from_date && (row as { date: string }).date <= item.to_date)) throw new Error('invalid_depth_payload');
  } catch (cause) {
    if (cause instanceof Error && cause.message === 'invalid_depth_payload') {
      await changeStatus(pool, lease, 'failed', 'invalid_depth_payload', null);
      return true;
    }
    await changeStatus(pool, lease, 'quota_wait', 'source_unavailable', new Date(Date.now() + 15 * 60_000));
    return true;
  }
  const hash = sha(raw);
  const fileId = await retain(raw, hash);
  if (!await commitChunk(pool, lease, item.id, hash, fileId)) return true;
  const pending = await pool.query(`SELECT 1 FROM import_chunks WHERE job_id = $1 AND status <> 'done' LIMIT 1`, [lease.id]);
  await changeStatus(pool, lease, pending.rowCount ? 'queued' : 'done', null, null);
  return true;
}
