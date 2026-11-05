import { randomUUID } from 'node:crypto';
import { Body, Controller, Get, HttpCode, HttpException, Param, Post } from '@nestjs/common';
import { Database } from './database.js';

const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
const error = (code: string, status: number, extra: Record<string, unknown> = {}): HttpException =>
  new HttpException({ error: { code, message: code, field_errors: [], retry_after_utc: null, ...extra } }, status);
const fields = `id, status, (active_sha256 IS NOT NULL) AS active_saved,
  (delisted_sha256 IS NOT NULL) AS delisted_saved, error_code, retry_after_utc,
  created_at, updated_at, published_at`;

@Controller('catalog-refreshes')
export class CatalogRefreshesController {
  constructor(private readonly database: Database) {}

  @Get('latest')
  async latest(): Promise<{ data: Record<string, unknown> | null }> {
    const result = await this.database.pool.query(`SELECT ${fields} FROM catalog_refresh_jobs
      WHERE provider = 'eodhd' AND origin = 'eodhd_war_pair' ORDER BY created_at DESC LIMIT 1`);
    return { data: result.rows[0] ?? null };
  }

  @Get(':id')
  async get(@Param('id') id: string): Promise<{ data: Record<string, unknown> }> {
    if (!uuid.test(id)) throw error('not_found', 404);
    const result = await this.database.pool.query(`SELECT ${fields} FROM catalog_refresh_jobs
      WHERE provider = 'eodhd' AND origin = 'eodhd_war_pair' AND id = $1`, [id]);
    if (!result.rows[0]) throw error('not_found', 404);
    return { data: result.rows[0] };
  }

  @Post()
  @HttpCode(202)
  async create(@Body() body: unknown): Promise<{ data: { id: string; status: 'queued'; created_at: Date } }> {
    if (!body || typeof body !== 'object' || Array.isArray(body) ||
      Object.keys(body).length !== 2 ||
      !Object.keys(body).every((key) => ['expected_catalog_id', 'replace_existing'].includes(key)))
      throw error('invalid_request', 400);
    const request = body as { expected_catalog_id?: unknown; replace_existing?: unknown };
    if (!(request.expected_catalog_id === null ||
      (typeof request.expected_catalog_id === 'string' && uuid.test(request.expected_catalog_id))) ||
      typeof request.replace_existing !== 'boolean') throw error('invalid_request', 400);
    const client = await this.database.pool.connect();
    try {
      await client.query('BEGIN');
      // Serialize confirmation with the worker's current-pointer publication.
      await client.query('SELECT pg_advisory_xact_lock(375093)');
      const head = await client.query<{ job_id: string; count: number }>(`SELECT h.job_id,
        (SELECT count(*)::int FROM catalog_refresh_members WHERE job_id = h.job_id) AS count
        FROM catalog_head h WHERE h.provider = 'eodhd'`);
      const current = head.rows[0];
      if ((current?.job_id ?? null) !== request.expected_catalog_id) throw error('catalog_changed', 409);
      if ((current?.count ?? 0) > 0 && !request.replace_existing) throw error('confirmation_required', 409);
      const active = await client.query<{ id: string }>(`SELECT id FROM catalog_refresh_jobs
        WHERE provider = 'eodhd' AND origin = 'eodhd_war_pair'
        AND status IN ('queued', 'running', 'quota_wait') LIMIT 1`);
      if (active.rows[0]) throw error('refresh_active', 409, { current_job_id: active.rows[0].id });
      const id = randomUUID();
      const inserted = await client.query<{ created_at: Date }>(`INSERT INTO catalog_refresh_jobs(id, provider, origin, status)
        VALUES ($1, 'eodhd', 'eodhd_war_pair', 'queued') RETURNING created_at`, [id]);
      await client.query('COMMIT');
      return { data: { id, status: 'queued', created_at: inserted.rows[0].created_at } };
    } catch (cause) {
      await client.query('ROLLBACK');
      if ((cause as { code?: string }).code === '23505') throw error('refresh_active', 409);
      throw cause;
    } finally { client.release(); }
  }

  @Post(':id/resume')
  @HttpCode(202)
  async resume(@Param('id') id: string, @Body() body: unknown): Promise<{ data: { id: string; status: 'queued' } }> {
    if (!uuid.test(id)) throw error('not_found', 404);
    if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).length)
      throw error('invalid_request', 400);
    try {
      const resumed = await this.database.pool.query(`UPDATE catalog_refresh_jobs SET status = 'queued',
        error_code = NULL, retry_after_utc = NULL, lease_token = NULL, lease_expires_at = NULL,
        updated_at = now() WHERE id = $1 AND origin = 'eodhd_war_pair' AND
        (status = 'failed' OR (status = 'quota_wait' AND retry_after_utc <= now())) RETURNING id`, [id]);
      if (!resumed.rowCount) {
        const exists = await this.database.pool.query(`SELECT 1 FROM catalog_refresh_jobs
          WHERE id = $1 AND origin = 'eodhd_war_pair'`, [id]);
        throw error(exists.rowCount ? 'conflict' : 'not_found', exists.rowCount ? 409 : 404);
      }
      return { data: { id, status: 'queued' } };
    } catch (cause) {
      if ((cause as { code?: string }).code === '23505') throw error('refresh_active', 409);
      throw cause;
    }
  }
}
