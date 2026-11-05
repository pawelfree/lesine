import { createHash, randomUUID } from 'node:crypto';
import { Body, Controller, Get, HttpCode, HttpException, Param, Post } from '@nestjs/common';
import type { PoolClient } from 'pg';
import { Database } from './database.js';

type Request = { provider?: unknown; market_scope?: unknown; data_classes?: unknown; mode?: unknown; from_date?: unknown; to_date?: unknown };
const datePattern = /^\d{4}-\d{2}-\d{2}$/;
const idPattern = /^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
const requestFields = new Set(['provider', 'market_scope', 'data_classes', 'mode', 'from_date', 'to_date']);
const error = (code: string, message: string, status: number): HttpException =>
  new HttpException({ error: { code, message, field_errors: [], retry_after_utc: null } }, status);
const day = 86_400_000;
type DataClass = 'daily_bars' | 'dividends' | 'splits';
const actionClass = (value: DataClass): boolean => value === 'dividends' || value === 'splits';

export function missingActionWindows(fromDate: string, toDate: string,
  covered: { from_date: string; to_date: string }[]): { from: string; to: string }[] {
  const start = Date.parse(`${fromDate}T00:00:00Z`);
  const end = Date.parse(`${toDate}T00:00:00Z`);
  let cursor = start;
  const windows: { from: string; to: string }[] = [];
  const iso = (value: number): string => new Date(value).toISOString().slice(0, 10);
  for (const interval of covered.sort((a, b) => a.from_date.localeCompare(b.from_date))) {
    const left = Math.max(start, Date.parse(`${interval.from_date}T00:00:00Z`));
    const right = Math.min(end, Date.parse(`${interval.to_date}T00:00:00Z`));
    if (right < cursor || left > end) continue;
    if (left > cursor) windows.push({ from: iso(cursor), to: iso(left - day) });
    cursor = Math.max(cursor, right + day);
    if (cursor > end) break;
  }
  if (cursor <= end) windows.push({ from: iso(cursor), to: iso(end) });
  return windows;
}

async function planActionChunks(client: PoolClient, jobId: string, marketScope: string,
  dataClass: DataClass, fromDate: string, toDate: string, mode: string): Promise<void> {
  const symbols = await client.query<{ id: string }>(`SELECT s.id FROM source_symbols s
    WHERE s.provider = 'eodhd' AND ($1 = 'all' OR s.market_segment = $1)
      AND (NOT EXISTS (SELECT 1 FROM catalog_head WHERE provider = 'eodhd') OR EXISTS (
        SELECT 1 FROM catalog_head h JOIN catalog_refresh_members m ON m.job_id = h.job_id
        WHERE h.provider = 'eodhd' AND m.source_symbol_id = s.id)) ORDER BY s.id`, [marketScope]);
  const prior = mode === 'incremental' ? await client.query<{
    resource_key: string; from_date: string; to_date: string;
  }>(`SELECT c.resource_key, to_char(c.from_date, 'YYYY-MM-DD') AS from_date,
      to_char(c.to_date, 'YYYY-MM-DD') AS to_date FROM import_chunks c
      JOIN import_jobs j ON j.id = c.job_id JOIN source_symbols s ON s.id = c.resource_key
      WHERE j.provider = 'eodhd' AND c.data_class = $1 AND c.status = 'done'
        AND c.manifest_id IS NOT NULL AND c.to_date >= $2::date AND c.from_date <= $3::date
        AND ($4 = 'all' OR s.market_segment = $4)
      ORDER BY c.resource_key, c.from_date`, [dataClass, fromDate, toDate, marketScope]) : { rows: [] };
  const bySymbol = new Map<string, { from_date: string; to_date: string }[]>();
  for (const interval of prior.rows) {
    const rows = bySymbol.get(interval.resource_key) ?? [];
    rows.push(interval);
    bySymbol.set(interval.resource_key, rows);
  }
  const keys: string[] = []; const froms: string[] = []; const tos: string[] = [];
  for (const symbol of symbols.rows) {
    const windows = mode === 'backfill' ? [{ from: fromDate, to: toDate }]
      : missingActionWindows(fromDate, toDate, bySymbol.get(symbol.id) ?? []);
    for (const window of windows) { keys.push(symbol.id); froms.push(window.from); tos.push(window.to); }
  }
  if (!keys.length) return;
  await client.query(`INSERT INTO import_chunks(id, job_id, resource_key, data_class, from_date, to_date)
    SELECT gen_random_uuid(), $1, x.resource_key, $2, x.from_date, x.to_date
    FROM unnest($3::text[], $4::date[], $5::date[]) AS x(resource_key, from_date, to_date)`,
  [jobId, dataClass, keys, froms, tos]);
}

function validDate(value: unknown): value is string {
  if (typeof value !== 'string' || !datePattern.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

@Controller('import-jobs')
export class ImportJobsController {
  constructor(private readonly database: Database) {}

  @Post()
  @HttpCode(202)
  async create(@Body() body: Request): Promise<{ data: { id: string; status: string; scope_hash: string; created_at: string } }> {
    if (!body || typeof body !== 'object' || Object.keys(body).some((field) => !requestFields.has(field)) ||
      body.provider !== 'eodhd' || typeof body.market_scope !== 'string' ||
      !['main', 'newconnect', 'all'].includes(body.market_scope) ||
      !Array.isArray(body.data_classes) || body.data_classes.length !== 1 ||
      !['daily_bars', 'dividends', 'splits'].includes(body.data_classes[0] as string) ||
      typeof body.mode !== 'string' || !['backfill', 'incremental'].includes(body.mode) ||
      !validDate(body.from_date) || !validDate(body.to_date) ||
      body.from_date > body.to_date ||
      (body.data_classes[0] === 'daily_bars' &&
        (Date.parse(`${body.to_date}T00:00:00Z`) - Date.parse(`${body.from_date}T00:00:00Z`)) > 366 * day)) {
      throw error('invalid_request', 'Nieprawidłowy zakres importu.', 400);
    }
    const id = randomUUID();
    const dataClass = body.data_classes[0] as DataClass;
    const scopeHash = createHash('sha256').update(JSON.stringify(['eodhd', body.market_scope, [dataClass]])).digest('hex');
    const client = await this.database.pool.connect();
    try {
      await client.query('BEGIN');
      const source = await client.query(`SELECT 1 FROM source_symbols s WHERE s.provider = 'eodhd'
        AND (NOT EXISTS (SELECT 1 FROM catalog_head WHERE provider = 'eodhd') OR EXISTS (
          SELECT 1 FROM catalog_head h JOIN catalog_refresh_members m ON m.job_id = h.job_id
          WHERE h.provider = 'eodhd' AND m.source_symbol_id = s.id)) LIMIT 1`);
      if (!source.rowCount) { await client.query('ROLLBACK'); throw error('source_unavailable', 'Najpierw pobierz katalog źródła.', 503); }
      const job = await client.query<{ started_at: Date }>(
        `INSERT INTO import_jobs(id, provider, market_scope, data_classes, from_date, to_date, scope_hash, mode)
         VALUES ($1, 'eodhd', $2, ARRAY[$7::text], $3, $4, $5, $6) RETURNING started_at`,
        [id, body.market_scope, body.from_date, body.to_date, scopeHash, body.mode, dataClass],
      );
      if (actionClass(dataClass)) {
        await planActionChunks(client, id, body.market_scope, dataClass, body.from_date, body.to_date, body.mode);
      } else {
        // Subtract archived ranges day by day, then coalesce adjacent missing dates across months.
        // Each batch covers at most 367 inclusive dates (366 elapsed days), the request API limit.
        await client.query(
        `WITH missing AS (
           SELECT s.id AS resource_key, d.day::date AS session_date
           FROM source_symbols s
           CROSS JOIN generate_series($3::date, $4::date, interval '1 day') AS d(day)
           WHERE s.provider = 'eodhd' AND ($2 = 'all' OR s.market_segment = $2)
             AND (NOT EXISTS (SELECT 1 FROM catalog_head WHERE provider = 'eodhd') OR EXISTS (
               SELECT 1 FROM catalog_head h JOIN catalog_refresh_members m ON m.job_id = h.job_id
               WHERE h.provider = 'eodhd' AND m.source_symbol_id = s.id))
             AND ($5 = 'backfill' OR NOT EXISTS (
               SELECT 1 FROM import_chunks prior JOIN import_jobs j ON j.id = prior.job_id
               WHERE j.provider = 'eodhd' AND prior.resource_key = s.id AND prior.status = 'done'
                 AND prior.manifest_id IS NOT NULL
                 AND d.day::date BETWEEN prior.from_date AND prior.to_date))
         ), runs AS (
           SELECT resource_key, session_date,
             session_date - row_number() OVER (
               PARTITION BY resource_key ORDER BY session_date)::int AS gap_key
           FROM missing
         ), batched AS (
           SELECT resource_key, session_date, gap_key,
             (row_number() OVER (PARTITION BY resource_key, gap_key ORDER BY session_date) - 1) / 367 AS batch_key
           FROM runs
         )
         INSERT INTO import_chunks(id, job_id, resource_key, from_date, to_date)
         SELECT gen_random_uuid(), $1, resource_key, min(session_date), max(session_date)
         FROM batched GROUP BY resource_key, gap_key, batch_key`,
        [id, body.market_scope, body.from_date, body.to_date, body.mode],
        );
      }
      await client.query('COMMIT');
      return { data: { id, status: 'queued', scope_hash: scopeHash, created_at: job.rows[0].started_at.toISOString() } };
    } catch (cause) {
      try { await client.query('ROLLBACK'); } catch { /* already rolled back */ }
      if ((cause as { code?: string }).code === '23505') throw error('conflict', 'Import tego zakresu jest już aktywny.', 409);
      throw cause;
    } finally { client.release(); }
  }

  @Get()
  async latest(): Promise<{ data: Record<string, unknown> | null }> {
    const result = await this.database.pool.query(
      `SELECT id, status, cursor, error_code, retry_after_utc, updated_at,
       (SELECT count(*)::int FROM import_chunks WHERE job_id = j.id) AS total_chunks,
       (SELECT count(*)::int FROM import_chunks WHERE job_id = j.id AND status = 'done') AS completed_chunks
       FROM import_jobs j WHERE j.data_classes = ARRAY['daily_bars']::text[]
       ORDER BY started_at DESC LIMIT 1`,
    );
    return { data: result.rows[0] as Record<string, unknown> ?? null };
  }

  @Get(':id')
  async get(@Param('id') id: string): Promise<{ data: Record<string, unknown> }> {
    if (!idPattern.test(id)) throw error('not_found', 'Nie znaleziono importu.', 404);
    const configured = Number(process.env.LESINE_EODHD_DAILY_BUDGET ?? '2');
    const budget = Number.isSafeInteger(configured) && configured >= 1 ? configured : 2;
    const result = await this.database.pool.query(
      `SELECT j.id, j.provider, j.market_scope, j.data_classes, j.mode, j.status, j.cursor,
       j.retry_after_utc, j.updated_at, j.error_code,
       count(c.id)::int AS total_chunks,
       count(c.id) FILTER (WHERE c.status = 'done')::int AS completed_chunks,
       count(c.id) FILTER (WHERE c.status = 'failed')::int AS failed_chunks,
       GREATEST(0, $2::int - COALESCE((SELECT reserved_calls FROM source_daily_budget
         WHERE provider = j.provider AND utc_day = (now() AT TIME ZONE 'UTC')::date), 0))::int AS quota_remaining
       FROM import_jobs j LEFT JOIN import_chunks c ON c.job_id = j.id
       WHERE j.id = $1 GROUP BY j.id`,
      [id, budget],
    );
    if (!result.rows[0]) throw error('not_found', 'Nie znaleziono importu.', 404);
    return { data: result.rows[0] as Record<string, unknown> };
  }

  @Post(':id/resume')
  @HttpCode(202)
  async resume(@Param('id') id: string, @Body() body: unknown): Promise<{ data: { id: string; status: string; cursor: string | null } }> {
    if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).length > 0)
      throw error('invalid_request', 'Wznowienie nie przyjmuje danych.', 400);
    if (!idPattern.test(id)) throw error('not_found', 'Nie znaleziono importu.', 404);
    let result;
    try {
      result = await this.database.pool.query<{ cursor: string | null }>(
        `UPDATE import_jobs SET status = 'queued', error_code = NULL, retry_after_utc = NULL,
         lease_token = NULL, lease_expires_at = NULL, updated_at = now()
         WHERE id = $1 AND (status IN ('paused', 'failed') OR
           (status = 'quota_wait' AND retry_after_utc <= now())) RETURNING cursor`, [id],
      );
    } catch (cause) {
      if ((cause as { code?: string }).code === '23505') throw error('conflict', 'Import tego zakresu jest już aktywny.', 409);
      throw cause;
    }
    if (!result.rows[0]) {
      const exists = await this.database.pool.query('SELECT 1 FROM import_jobs WHERE id = $1', [id]);
      if (!exists.rowCount) throw error('not_found', 'Nie znaleziono importu.', 404);
      throw error('conflict', 'Importu nie można teraz wznowić.', 409);
    }
    return { data: { id, status: 'queued', cursor: result.rows[0].cursor } };
  }
}
