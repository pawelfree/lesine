import { createHash, randomUUID } from 'node:crypto';
import { Body, Controller, Get, HttpCode, HttpException, Param, Post } from '@nestjs/common';
import { Database } from './database.js';

type Request = { provider?: unknown; market_scope?: unknown; data_classes?: unknown; mode?: unknown; from_date?: unknown; to_date?: unknown };
const datePattern = /^\d{4}-\d{2}-\d{2}$/;
const idPattern = /^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
const requestFields = new Set(['provider', 'market_scope', 'data_classes', 'mode', 'from_date', 'to_date']);
const error = (code: string, message: string, status: number): HttpException =>
  new HttpException({ error: { code, message, field_errors: [], retry_after_utc: null } }, status);

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
      !Array.isArray(body.data_classes) || body.data_classes.length !== 1 || body.data_classes[0] !== 'daily_bars' ||
      typeof body.mode !== 'string' || !['backfill', 'incremental'].includes(body.mode) ||
      !validDate(body.from_date) || !validDate(body.to_date) ||
      body.from_date > body.to_date ||
      (Date.parse(`${body.to_date}T00:00:00Z`) - Date.parse(`${body.from_date}T00:00:00Z`)) > 366 * 86_400_000) {
      throw error('invalid_request', 'Nieprawidłowy zakres importu.', 400);
    }
    const id = randomUUID();
    const scopeHash = createHash('sha256').update(JSON.stringify(['eodhd', body.market_scope, ['daily_bars']])).digest('hex');
    const client = await this.database.pool.connect();
    try {
      await client.query('BEGIN');
      const source = await client.query("SELECT 1 FROM source_symbols WHERE provider = 'eodhd' LIMIT 1");
      if (!source.rowCount) { await client.query('ROLLBACK'); throw error('source_unavailable', 'Najpierw pobierz katalog źródła.', 503); }
      const job = await client.query<{ started_at: Date }>(
        `INSERT INTO import_jobs(id, provider, market_scope, data_classes, from_date, to_date, scope_hash, mode)
         VALUES ($1, 'eodhd', $2, ARRAY['daily_bars'], $3, $4, $5, $6) RETURNING started_at`,
        [id, body.market_scope, body.from_date, body.to_date, scopeHash, body.mode],
      );
      // Subtract completed ranges day by day, then coalesce adjacent missing days within each month.
      // This avoids re-requesting an overlapping period when an earlier job used different boundaries.
      await client.query(
        `WITH missing AS (
           SELECT s.id AS resource_key, d.day::date AS session_date
           FROM source_symbols s
           CROSS JOIN generate_series($3::date, $4::date, interval '1 day') AS d(day)
           WHERE s.provider = 'eodhd' AND ($2 = 'all' OR s.market_segment = $2)
             AND ($5 = 'backfill' OR NOT EXISTS (
               SELECT 1 FROM import_chunks prior JOIN import_jobs j ON j.id = prior.job_id
               WHERE j.provider = 'eodhd' AND prior.resource_key = s.id AND prior.status = 'done'
                 AND prior.manifest_id IS NOT NULL
                 AND d.day::date BETWEEN prior.from_date AND prior.to_date))
         ), grouped AS (
           SELECT resource_key, session_date, date_trunc('month', session_date) AS month_start,
             session_date - row_number() OVER (
               PARTITION BY resource_key, date_trunc('month', session_date) ORDER BY session_date)::int AS gap_key
           FROM missing
         )
         INSERT INTO import_chunks(id, job_id, resource_key, from_date, to_date)
         SELECT gen_random_uuid(), $1, resource_key, min(session_date), max(session_date)
         FROM grouped GROUP BY resource_key, month_start, gap_key`,
        [id, body.market_scope, body.from_date, body.to_date, body.mode],
      );
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
       FROM import_jobs j ORDER BY started_at DESC LIMIT 1`,
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
