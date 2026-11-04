import { BadRequestException, Controller, Get, Query, Res } from '@nestjs/common';
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
  ): Promise<{ data: { status: string; expected_scope_status: 'unknown'; rights_status: 'unverified'; checked_at: string | null; rows: unknown[]; sample: unknown[]; depth_sample: unknown[]; count: number }; page: { next_cursor: string | null } }> {
    const validListings = new Set(['all', 'active', 'delisted', 'unknown']);
    const validMarkets = new Set(['all', 'main', 'newconnect', 'unclassified']);
    if ((listing && !validListings.has(listing)) || (market && !validMarkets.has(market)) || (after && !/^[a-f0-9]{64}$/.test(after))) {
      throw new BadRequestException('invalid_catalog_filter');
    }
    const conditions = ["provider = 'eodhd'"];
    const values: string[] = [];
    if (listing && listing !== 'all') { values.push(listing); conditions.push(`listing_state = $${values.length}`); }
    if (market && market !== 'all') { values.push(market); conditions.push(`market_segment = $${values.length}`); }
    if (after) { values.push(after); conditions.push(`id > $${values.length}`); }
    const [items, probes, count, depth] = await Promise.all([
      this.database.pool.query(`SELECT id, provider_symbol, display_name, isin, instrument_type, listing_state, market_segment, identity_evidence_ref, first_seen_at, last_seen_at FROM source_symbols WHERE ${conditions.join(' AND ')} ORDER BY id LIMIT 101`, values),
      this.database.pool.query("SELECT DISTINCT ON (listing_state) listing_state, checked_at, status, item_count, error_code FROM catalog_probes WHERE provider = 'eodhd' ORDER BY listing_state, checked_at DESC"),
      this.database.pool.query("SELECT count(*)::int AS count FROM source_symbols WHERE provider = 'eodhd'"),
      this.database.pool.query("SELECT DISTINCT ON (listing_state, data_class) listing_state, data_class, provider_symbol, to_char(sample_from, 'YYYY-MM-DD') AS sample_from, to_char(sample_to, 'YYYY-MM-DD') AS sample_to, to_char(earliest_observed, 'YYYY-MM-DD') AS earliest_observed, to_char(latest_observed, 'YYYY-MM-DD') AS latest_observed, checked_at, status, error_code FROM source_depth_samples WHERE provider = 'eodhd' ORDER BY listing_state, data_class, checked_at DESC"),
    ]);
    const statuses = probes.rows.map((row) => row.status as string);
    const status = !probes.rows.length ? 'empty' : statuses.every((value) => value === 'available') && statuses.length === 2 ? 'available' : statuses.every((value) => value === 'unavailable') ? 'unavailable' : 'partial';
    const checkedAt = probes.rows.map((row) => row.checked_at as Date).sort((a, b) => b.getTime() - a.getTime())[0];
    const rows = items.rows.slice(0, 100);
    return { data: { status, expected_scope_status: 'unknown', rights_status: 'unverified', checked_at: checkedAt?.toISOString() ?? null, rows, sample: probes.rows, depth_sample: depth.rows, count: count.rows[0].count as number }, page: { next_cursor: items.rows.length > 100 ? rows[99].id as string : null } };
  }
}
