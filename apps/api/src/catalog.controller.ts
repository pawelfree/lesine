import { BadRequestException, Controller, Get, HttpException, Query, Res } from '@nestjs/common';
import type { ServerResponse } from 'node:http';
import { Database } from './database.js';
import { csrfToken } from './local-access.js';

@Controller()
export class CatalogController {
  constructor(private readonly database: Database) {}

  @Get('session')
  session(@Res({ passthrough: true }) response: ServerResponse): { data: { csrf_token: string } } {
    const token = csrfToken();
    response.setHeader('Set-Cookie', `lesine_csrf=${token}; Path=/api; HttpOnly; SameSite=Strict`);
    response.setHeader('Cache-Control', 'no-store');
    return { data: { csrf_token: token } };
  }

  @Get('catalog')
  async catalog(
    @Query('listing') listing?: string,
    @Query('market') market?: string,
    @Query('after') after?: string,
    @Query('catalog_id') catalogId?: string,
  ): Promise<{ data: { status: string; rights_status: 'unverified'; checked_at: string | null; current_catalog_id: string | null; catalog_origin: string | null; latest_refresh: unknown; rows: unknown[]; sample: unknown[]; depth_sample: unknown[]; count: number }; page: { next_cursor: string | null } }> {
    const validListings = new Set(['all', 'active', 'delisted', 'unknown']);
    const validMarkets = new Set(['all', 'main', 'newconnect', 'unclassified']);
    if ((listing && !validListings.has(listing)) || (market && !validMarkets.has(market)) ||
      (after && !/^[a-f0-9]{64}$/.test(after)) ||
      (after && !catalogId) ||
      (catalogId && !/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(catalogId))) {
      throw new BadRequestException('invalid_catalog_filter');
    }
    const head = await this.database.pool.query<{ job_id: string; origin: string; published_at: Date | null; active_count: number | null; delisted_count: number | null; active_sha256: string | null; delisted_sha256: string | null }>(
      `SELECT j.id AS job_id, j.origin, j.published_at, j.active_count, j.delisted_count,
        j.active_sha256, j.delisted_sha256 FROM catalog_head h
        JOIN catalog_refresh_jobs j ON j.id = h.job_id WHERE h.provider = 'eodhd'`);
    const current = head.rows[0];
    if (catalogId && catalogId !== current?.job_id) {
      throw new HttpException({ error: { code: 'catalog_changed', message: 'catalog_changed', field_errors: [], retry_after_utc: null } }, 409);
    }
    const conditions = ["s.provider = 'eodhd'", 'm.job_id = $1'];
    const values: string[] = [current?.job_id ?? '00000000-0000-0000-0000-000000000000'];
    if (listing && listing !== 'all') { values.push(listing); conditions.push(`s.listing_state = $${values.length}`); }
    if (market && market !== 'all') { values.push(market); conditions.push(`s.market_segment = $${values.length}`); }
    if (after) { values.push(after); conditions.push(`s.id > $${values.length}`); }
    const [items, count, depth, latest] = await Promise.all([
      this.database.pool.query(`SELECT s.id, s.provider_symbol, s.display_name, s.isin, s.instrument_type,
        s.listing_state, s.market_segment, s.identity_evidence_ref, s.first_seen_at, s.last_seen_at
        FROM catalog_refresh_members m JOIN source_symbols s ON s.id = m.source_symbol_id
        WHERE ${conditions.join(' AND ')} ORDER BY s.id LIMIT 101`, values),
      this.database.pool.query("SELECT count(*)::int AS count FROM catalog_refresh_members WHERE job_id = $1", [values[0]]),
      this.database.pool.query("SELECT DISTINCT ON (listing_state, data_class) listing_state, data_class, provider_symbol, to_char(sample_from, 'YYYY-MM-DD') AS sample_from, to_char(sample_to, 'YYYY-MM-DD') AS sample_to, to_char(earliest_observed, 'YYYY-MM-DD') AS earliest_observed, to_char(latest_observed, 'YYYY-MM-DD') AS latest_observed, checked_at, status, error_code FROM source_depth_samples WHERE provider = 'eodhd' ORDER BY listing_state, data_class, checked_at DESC"),
      this.database.pool.query(`SELECT id, status, error_code, retry_after_utc, updated_at FROM catalog_refresh_jobs
        WHERE provider = 'eodhd' AND origin = 'eodhd_war_pair' ORDER BY created_at DESC LIMIT 1`),
    ]);
    const status = !current ? 'empty' : current.origin === 'legacy' ? 'partial' : 'available';
    const sample = current?.origin === 'eodhd_war_pair' ? (['active', 'delisted'] as const).map((state) => ({
      listing_state: state, status: 'available', item_count: state === 'active' ? current.active_count : current.delisted_count,
      response_sha256: state === 'active' ? current.active_sha256 : current.delisted_sha256, error_code: null,
    })) : [];
    const rows = items.rows.slice(0, 100);
    return { data: { status, rights_status: 'unverified',
      checked_at: current?.published_at?.toISOString() ?? null, current_catalog_id: current?.job_id ?? null,
      catalog_origin: current?.origin ?? null, latest_refresh: latest.rows[0] ?? null,
      rows, sample, depth_sample: depth.rows, count: count.rows[0].count as number },
      page: { next_cursor: items.rows.length > 100 ? rows[99].id as string : null } };
  }
}
