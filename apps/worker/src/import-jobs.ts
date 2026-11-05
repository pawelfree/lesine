import { createHash, randomUUID } from 'node:crypto';
import { link, mkdir, readFile, unlink, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import type { Pool, PoolClient } from 'pg';
import { parseCorporateActions, type ActionClass, type ActionEvent } from './corporate-actions.js';
import { parseEodBars, type EodBar } from './eod-bars.js';

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
    if (Number.isFinite(time) && time > Date.now() && time <= 8_640_000_000_000_000) return new Date(time);
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

export async function commitChunk(pool: Pool, lease: Lease, chunkId: string, responseHash: string,
  relativePath: string, bars: EodBar[]): Promise<boolean> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    if (!await fenced(client, lease)) { await client.query('ROLLBACK'); return false; }
    const chunk = await client.query<{ resource_key: string; from_date: Date | string; market_scope: string }>(
      `SELECT c.resource_key, c.from_date, j.market_scope FROM import_chunks c
       JOIN import_jobs j ON j.id = c.job_id
       WHERE c.id = $1 AND c.job_id = $2 AND c.status <> 'done' FOR UPDATE OF c`, [chunkId, lease.id],
    );
    if (!chunk.rows[0]) { await client.query('ROLLBACK'); return false; }
    const { resource_key: resourceKey, from_date: fromDate, market_scope: marketScope } = chunk.rows[0];
    const manifestId = randomUUID();
    const dates = bars.map((bar) => bar.date).sort();
    await client.query(
      `INSERT INTO raw_file_manifests(id, chunk_id, relative_path, sha256, provider, data_class,
       market_scope, min_date, max_date, row_count)
       VALUES ($1, $2, $3, $4, 'eodhd', 'daily_bars', $5, $6, $7, $8)`,
      [manifestId, chunkId, relativePath, responseHash, marketScope,
        dates[0] ?? null, dates.at(-1) ?? null, bars.length],
    );
    for (const bar of bars) {
      const revisionId = randomUUID();
      const inserted = await client.query<{ id: string }>(
        `INSERT INTO daily_bar_revisions(id, provider, source_symbol_id, session_date, open, high, low, close,
         adjusted_close, volume, fingerprint, first_manifest_id)
         VALUES ($1, 'eodhd', $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
         ON CONFLICT (provider, source_symbol_id, session_date, fingerprint) DO NOTHING RETURNING id`,
        [revisionId, resourceKey, bar.date, bar.open, bar.high, bar.low, bar.close,
          bar.adjustedClose, bar.volume, bar.fingerprint, manifestId],
      );
      const linkedId = inserted.rows[0]?.id ?? (await client.query<{ id: string }>(
        `SELECT id FROM daily_bar_revisions WHERE provider = 'eodhd' AND source_symbol_id = $1
         AND session_date = $2 AND fingerprint = $3`, [resourceKey, bar.date, bar.fingerprint],
      )).rows[0]?.id;
      if (!linkedId) throw new Error('revision_link_missing');
      await client.query(`INSERT INTO raw_file_manifest_revisions(manifest_id, revision_id) VALUES ($1, $2)`,
        [manifestId, linkedId]);
    }
    await client.query(
      `UPDATE import_chunks SET status = 'done', response_hash = $2, file_id = $3,
       manifest_id = $4, error_code = NULL WHERE id = $1`,
      [chunkId, responseHash, relativePath, manifestId],
    );
    await client.query(
      `UPDATE import_jobs SET cursor = $2, updated_at = now() WHERE id = $1`,
      [lease.id, `${resourceKey}:${fromDate instanceof Date ? fromDate.toISOString().slice(0, 10) : fromDate}`],
    );
    await client.query('COMMIT');
    return true;
  } catch (error) { await client.query('ROLLBACK'); throw error; }
  finally { client.release(); }
}

export async function commitActionChunk(pool: Pool, lease: Lease, chunkId: string, responseHash: string,
  relativePath: string, events: ActionEvent[]): Promise<boolean> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    if (!await fenced(client, lease)) { await client.query('ROLLBACK'); return false; }
    const chunk = await client.query<{ resource_key: string; from_date: string; to_date: string;
      market_scope: string; data_class: ActionClass }>(`SELECT c.resource_key,
      to_char(c.from_date, 'YYYY-MM-DD') AS from_date, to_char(c.to_date, 'YYYY-MM-DD') AS to_date,
      j.market_scope, c.data_class FROM import_chunks c JOIN import_jobs j ON j.id = c.job_id
      WHERE c.id = $1 AND c.job_id = $2 AND c.status <> 'done' FOR UPDATE OF c`, [chunkId, lease.id]);
    const item = chunk.rows[0];
    if (!item || !['dividends', 'splits'].includes(item.data_class) ||
      events.some((event) => event.dataClass !== item.data_class || event.exDate < item.from_date ||
        event.exDate > item.to_date)) { await client.query('ROLLBACK'); return false; }
    // Jobs with different market scopes may still cover the same source identity.
    await client.query(`SELECT pg_advisory_xact_lock(hashtext($1))`,
      [`eodhd:${item.resource_key}:${item.data_class}`]);
    const manifestId = randomUUID();
    const dates = events.map((event) => event.exDate).sort();
    await client.query(`INSERT INTO raw_file_manifests(id, chunk_id, relative_path, sha256, provider,
      data_class, market_scope, min_date, max_date, row_count)
      VALUES ($1, $2, $3, $4, 'eodhd', $5, $6, $7, $8, $9)`,
    [manifestId, chunkId, relativePath, responseHash, item.data_class, item.market_scope,
      dates[0] ?? null, dates.at(-1) ?? null, events.length]);
    const prior = await client.query<{ event_key: string; fingerprint: string; state: string;
      ex_date: string; ambiguous: boolean; id: string }>(`SELECT DISTINCT ON (event_key)
      event_key, fingerprint, state, to_char(ex_date, 'YYYY-MM-DD') AS ex_date, ambiguous, id
      FROM corporate_action_revisions WHERE provider = 'eodhd' AND source_symbol_id = $1
        AND data_class = $2 AND ex_date BETWEEN $3::date AND $4::date
      ORDER BY event_key, first_seen_at DESC, id DESC`,
    [item.resource_key, item.data_class, item.from_date, item.to_date]);
    const current = new Map(prior.rows.map((row) => [row.event_key, row]));
    const incoming = new Set(events.map((event) => event.eventKey));
    for (const event of events) {
      const previous = current.get(event.eventKey);
      let revisionId = previous?.state === 'active' && previous.fingerprint === event.fingerprint
        ? previous.id : undefined;
      if (!revisionId) {
        revisionId = randomUUID();
        await client.query(`INSERT INTO corporate_action_revisions(id, provider, source_symbol_id,
          data_class, ex_date, event_key, fingerprint, state, ambiguous, amount, adjusted_amount,
          currency, declaration_date, record_date, payment_date, split_numerator, split_denominator,
          split_raw, first_manifest_id, availability_evidence)
          VALUES ($1, 'eodhd', $2, $3, $4, $5, $6, 'active', $7, $8, $9, $10,
            $11, $12, $13, $14, $15, $16, $17, $18)`,
        [revisionId, item.resource_key, item.data_class, event.exDate, event.eventKey,
          event.fingerprint, event.ambiguous, event.amount, event.adjustedAmount, event.currency,
          event.declarationDate, event.recordDate, event.paymentDate, event.splitNumerator,
          event.splitDenominator, event.splitRaw, manifestId, event.availabilityEvidence]);
      }
      await client.query(`INSERT INTO action_manifest_revisions(manifest_id, revision_id)
        VALUES ($1, $2)`, [manifestId, revisionId]);
    }
    for (const previous of prior.rows) {
      if (previous.state !== 'active' || incoming.has(previous.event_key)) continue;
      const revisionId = randomUUID();
      await client.query(`INSERT INTO corporate_action_revisions(id, provider, source_symbol_id,
        data_class, ex_date, event_key, fingerprint, state, ambiguous, first_manifest_id,
        availability_evidence) VALUES ($1, 'eodhd', $2, $3, $4, $5, $6, 'withdrawn', $7, $8,
          'first_import')`, [revisionId, item.resource_key, item.data_class, previous.ex_date,
          previous.event_key, sha(JSON.stringify(['withdrawn', previous.event_key])), previous.ambiguous, manifestId]);
      await client.query(`INSERT INTO action_manifest_revisions(manifest_id, revision_id)
        VALUES ($1, $2)`, [manifestId, revisionId]);
    }
    await client.query(`UPDATE import_chunks SET status = 'done', response_hash = $2, file_id = $3,
      manifest_id = $4, error_code = NULL WHERE id = $1`,
    [chunkId, responseHash, relativePath, manifestId]);
    await client.query(`UPDATE import_jobs SET cursor = $2, updated_at = now() WHERE id = $1`,
      [lease.id, `${item.resource_key}:${item.data_class}:${item.from_date}`]);
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
  if (sha(await readFile(target, 'utf8')) !== hash) throw new Error('archive_file_corrupt');
  return `import/${hash}.json`;
}

/** One bounded request per invocation; caller may poll again after the claim is released. */
export async function processImport(pool: Pool, fetcher: typeof fetch = fetch): Promise<boolean> {
  const lease = await claimJob(pool);
  if (!lease) return false;
  const chunk = await pool.query<{ id: string; resource_key: string; provider_symbol: string;
    from_date: string; to_date: string; data_class: 'daily_bars' | ActionClass }>(
    `SELECT c.id, c.resource_key, c.data_class, s.provider_symbol,
       to_char(c.from_date, 'YYYY-MM-DD') AS from_date,
       to_char(c.to_date, 'YYYY-MM-DD') AS to_date
     FROM import_chunks c JOIN source_symbols s ON s.id = c.resource_key
     WHERE c.job_id = $1 AND c.status <> 'done' ORDER BY c.resource_key, c.from_date LIMIT 1`, [lease.id],
  );
  const item = chunk.rows[0];
  if (!item) { await changeStatus(pool, lease, 'done', null, null); return true; }
  const token = process.env.EODHD_API_TOKEN;
  if (!token) { await changeStatus(pool, lease, 'paused', 'missing_credential', null); return true; }
  const configured = Number(process.env.LESINE_EODHD_DAILY_BUDGET ?? '2');
  const budget = Number.isSafeInteger(configured) && configured >= 1 ? configured : 2;
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
  const endpoint = item.data_class === 'daily_bars' ? 'eod'
    : item.data_class === 'dividends' ? 'div' : 'splits';
  const url = new URL(`https://eodhd.com/api/${endpoint}/${encodeURIComponent(item.provider_symbol)}.WAR`);
  url.searchParams.set('api_token', token);
  url.searchParams.set('fmt', 'json');
  url.searchParams.set('from', item.from_date);
  url.searchParams.set('to', item.to_date);
  let raw: string;
  let bars: EodBar[] = [];
  let events: ActionEvent[] = [];
  try {
    const response = await fetcher(url, { redirect: 'error', signal: AbortSignal.timeout(20_000) });
    if (response.status === 429) {
      await changeStatus(pool, lease, 'quota_wait', 'provider_rate_limit', retryAfter(response.headers.get('retry-after')));
      return true;
    }
    if (response.status === 401 || response.status === 403 || response.status === 404) {
      await changeStatus(pool, lease, 'failed', 'source_unavailable', null);
      return true;
    }
    if (!response.ok) throw new Error('source_unavailable');
    raw = await response.text();
    if (item.data_class === 'daily_bars') bars = parseEodBars(raw, item.from_date, item.to_date);
    else events = parseCorporateActions(raw, item.data_class, item.from_date, item.to_date);
  } catch (cause) {
    if (cause instanceof Error && ['invalid_depth_payload', 'invalid_action_payload'].includes(cause.message)) {
      await changeStatus(pool, lease, 'failed', cause.message, null);
      return true;
    }
    await changeStatus(pool, lease, 'quota_wait', 'source_unavailable', new Date(Date.now() + 15 * 60_000));
    return true;
  }
  const hash = sha(raw);
  const relativePath = await retain(raw, hash);
  const committed = item.data_class === 'daily_bars'
    ? await commitChunk(pool, lease, item.id, hash, relativePath, bars)
    : await commitActionChunk(pool, lease, item.id, hash, relativePath, events);
  if (!committed) return true;
  const pending = await pool.query(`SELECT 1 FROM import_chunks WHERE job_id = $1 AND status <> 'done' LIMIT 1`, [lease.id]);
  await changeStatus(pool, lease, pending.rowCount ? 'queued' : 'done', null, null);
  return true;
}
