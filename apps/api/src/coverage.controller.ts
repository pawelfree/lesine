import { BadRequestException, Controller, Get, Query } from '@nestjs/common';
import { Database } from './database.js';
import { CoverageService } from './coverage.service.js';

type Filters = { market: string; listing: string; data_class: 'daily_bars'; source: 'eodhd'; status: string };
type Position = [string, string, string, string];
type QueryValues = { market?: string; listing?: string; data_class?: string; source?: string; status?: string; limit?: string; cursor?: string };

function invalid(): BadRequestException {
  return new BadRequestException({ error: { code: 'invalid_request', message: 'Nieprawidłowy filtr raportu.', field_errors: [], retry_after_utc: null } });
}

function parseFilters(query: QueryValues): { filters: Filters; limit: number } {
  const filters: Filters = {
    market: query.market ?? 'all', listing: query.listing ?? 'all',
    data_class: 'daily_bars', source: 'eodhd', status: query.status ?? 'all',
  };
  if (!['all', 'main', 'newconnect', 'unclassified'].includes(filters.market) ||
      !['all', 'active', 'delisted', 'unknown'].includes(filters.listing) ||
      !['all', 'complete', 'partial', 'unavailable', 'unclassified', 'unknown'].includes(filters.status) ||
      (query.data_class && query.data_class !== 'daily_bars') ||
      (query.source && query.source !== 'eodhd') ||
      (query.limit && !/^(?:[1-9]|[1-9][0-9]|1[0-9][0-9]|200)$/.test(query.limit))) throw invalid();
  return { filters, limit: query.limit ? Number(query.limit) : 50 };
}

function decodeCursor(cursor: string | undefined, reportId: string, filters: Filters): Position | null {
  if (!cursor) return null;
  if (cursor.length > 1024 || !/^[A-Za-z0-9_-]+$/.test(cursor)) throw invalid();
  try {
    const decoded: unknown = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'));
    if (!decoded || typeof decoded !== 'object') throw invalid();
    const value = decoded as { report?: unknown; filters?: unknown; last?: unknown };
    if (value.report !== reportId || JSON.stringify(value.filters) !== JSON.stringify(filters) ||
      !Array.isArray(value.last) || value.last.length !== 4 ||
      value.last.some((part) => typeof part !== 'string' || part.length > 200)) throw invalid();
    return value.last as Position;
  } catch { throw invalid(); }
}

@Controller('coverage')
export class CoverageController {
  constructor(private readonly database: Database, private readonly coverage: CoverageService) {}

  @Get()
  async get(@Query() query: QueryValues): Promise<Record<string, unknown>> {
    if (Object.keys(query).some((key) => !['market', 'listing', 'data_class', 'source', 'status', 'limit', 'cursor'].includes(key))) throw invalid();
    const { filters, limit } = parseFilters(query);
    const { report, refreshStatus, errorCode } = await this.coverage.report();
    if (!report) {
      if (query.cursor) throw invalid();
      return { data: { report_id: null, created_at: null, archive_last_committed_at: null,
        refresh_status: 'none', refresh_error_code: null, catalog_id: null, archive_watermark: null,
        expected_scope_status: 'unknown', scope: filters,
        summary: { expected: null, provider_available: null, acquired: null, gaps: null }, rows: [] },
      page: { next_cursor: null } };
    }
    const last = decodeCursor(query.cursor, report.id, filters);
    const where = ['report_id = $1', "data_class = 'daily_bars'", 'provider = $2'];
    const values: (string | number)[] = [report.id, filters.source];
    if (filters.market !== 'all') { values.push(filters.market); where.push(`market_segment = $${values.length}`); }
    if (filters.listing !== 'all') { values.push(filters.listing); where.push(`listing = $${values.length}`); }
    if (filters.status !== 'all') { values.push(filters.status); where.push(`status = $${values.length}`); }
    const summary = await this.database.pool.query<{ acquired: number }>(
      `SELECT COALESCE(sum(acquired_count), 0)::int AS acquired FROM eod_coverage_rows WHERE ${where.join(' AND ')}`, values,
    );
    if (last) {
      for (const part of last) values.push(part);
      const start = values.length - 3;
      where.push(`(market_segment, listing, provider_symbol, source_symbol_id) > ($${start}, $${start + 1}, $${start + 2}, $${start + 3})`);
    }
    values.push(limit + 1);
    const rows = await this.database.pool.query<Record<string, unknown>>(
      `SELECT source_symbol_id, provider_symbol, market_segment, listing, in_current_catalog,
        data_class, provider AS source, to_char(acquired_from, 'YYYY-MM-DD') AS acquired_from,
        to_char(acquired_to, 'YYYY-MM-DD') AS acquired_to, status, findings
       FROM eod_coverage_rows WHERE ${where.join(' AND ')}
       ORDER BY market_segment, listing, provider_symbol, source_symbol_id LIMIT $${values.length}`, values,
    );
    const visible = rows.rows.slice(0, limit).map((row) => ({ ...row,
      expected_from: null, expected_to: null, provider_from: null, provider_to: null }));
    const tail = rows.rows.length > limit ? rows.rows[limit - 1] : null;
    const next = tail ? Buffer.from(JSON.stringify({ report: report.id, filters,
      last: [tail.market_segment, tail.listing, tail.provider_symbol, tail.source_symbol_id] })).toString('base64url') : null;
    return { data: { report_id: report.id, created_at: report.created_at.toISOString(),
      archive_last_committed_at: report.archive_last_committed_at?.toISOString() ?? null,
      refresh_status: refreshStatus, refresh_error_code: errorCode, catalog_id: report.catalog_id,
      archive_watermark: report.input_revision, expected_scope_status: report.expected_scope_status,
      scope: filters, summary: { expected: null, provider_available: null, acquired: summary.rows[0].acquired, gaps: null },
      rows: visible }, page: { next_cursor: next } };
  }
}
