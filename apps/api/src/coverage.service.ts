import { randomUUID } from 'node:crypto';
import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import type { PoolClient } from 'pg';
import { Database } from './database.js';

export type CoverageReport = {
  id: string;
  created_at: Date;
  archive_last_committed_at: Date | null;
  catalog_id: string | null;
  input_revision: string;
  expected_scope_status: 'unknown';
};

@Injectable()
export class CoverageService {
  constructor(private readonly database: Database) {}

  private async latest(client: PoolClient): Promise<CoverageReport | null> {
    const result = await client.query<CoverageReport>(
      'SELECT id, created_at, archive_last_committed_at, catalog_id, input_revision, expected_scope_status FROM eod_coverage_reports ORDER BY input_revision DESC LIMIT 1',
    );
    return result.rows[0] ?? null;
  }

  async report(): Promise<{ report: CoverageReport | null; refreshStatus: 'none' | 'fresh' | 'stale'; errorCode: string | null }> {
    const client = await this.database.pool.connect();
    try {
      await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ');
      await client.query('SELECT pg_advisory_xact_lock(375092)');
      const input = await client.query<{ revision: string; source_count: number; catalog_id: string | null; manifest_count: number }>(
        `SELECT st.revision, (SELECT count(*)::int FROM source_symbols) AS source_count,
          (SELECT job_id FROM catalog_head WHERE provider = 'eodhd') AS catalog_id,
          (SELECT count(*)::int FROM raw_file_manifests) AS manifest_count
         FROM eod_coverage_input_state st WHERE st.id = 1`,
      );
      const state = input.rows[0];
      if (!state) throw new Error('coverage_state_missing');
      if (state.source_count === 0 && !state.catalog_id && state.manifest_count === 0) {
        await client.query('COMMIT');
        return { report: null, refreshStatus: 'none', errorCode: null };
      }
      const current = await this.latest(client);
      if (current && current.input_revision === state.revision) {
        await client.query('COMMIT');
        return { report: current, refreshStatus: 'fresh', errorCode: null };
      }
      const id = randomUUID();
      await client.query(
        `INSERT INTO eod_coverage_reports(id, catalog_id, input_revision, source_symbol_count, archive_last_committed_at)
         SELECT $1, $2, $3, $4,
           (SELECT max(created_at) FROM raw_file_manifests WHERE data_class = 'daily_bars' AND row_count > 0)`,
        [id, state.catalog_id, state.revision, state.source_count],
      );
      await client.query(
        `INSERT INTO eod_coverage_rows(report_id, source_symbol_id, provider, provider_symbol,
          market_segment, listing, in_current_catalog, acquired_from, acquired_to,
          acquired_count, status, findings)
         SELECT $1, s.id, s.provider, s.provider_symbol, s.market_segment, s.listing_state,
           EXISTS (SELECT 1 FROM catalog_refresh_members m WHERE m.job_id = $2 AND m.source_symbol_id = s.id),
           bars.first_date, bars.last_date, bars.day_count,
           CASE WHEN s.market_segment = 'unclassified' THEN 'unclassified' ELSE 'unknown' END,
           jsonb_build_array(jsonb_build_object('from_date', NULL, 'to_date', NULL,
             'reason_code', 'expected_scope_unknown', 'evidence_ref', NULL,
             'evidence_checked_at', NULL)) || COALESCE(requests.findings, '[]'::jsonb)
         FROM source_symbols s
         CROSS JOIN LATERAL (
           SELECT min(r.session_date) AS first_date, max(r.session_date) AS last_date,
             count(DISTINCT r.session_date)::int AS day_count
           FROM daily_bar_revisions r
           WHERE r.source_symbol_id = s.id
         ) bars
         CROSS JOIN LATERAL (
           SELECT jsonb_agg(jsonb_build_object(
             'from_date', to_char(c.from_date, 'YYYY-MM-DD'),
             'to_date', to_char(c.to_date, 'YYYY-MM-DD'),
             'reason_code', CASE WHEN c.status = 'done' THEN 'archive_evidence_missing'
               ELSE 'import_request_unfinished' END,
             'evidence_ref', c.id::text, 'evidence_checked_at', j.updated_at
           ) ORDER BY c.from_date, c.id) AS findings
           FROM (SELECT c.id, c.from_date, c.to_date, c.status, c.job_id
             FROM import_chunks c WHERE c.resource_key = s.id
               AND (c.status <> 'done' OR c.manifest_id IS NULL)
             ORDER BY c.from_date, c.id LIMIT 20) c
           JOIN import_jobs j ON j.id = c.job_id
         ) requests`,
        [id, state.catalog_id],
      );
      const report = await this.latest(client);
      await client.query('COMMIT');
      return { report, refreshStatus: 'fresh', errorCode: null };
    } catch {
      try { await client.query('ROLLBACK'); } catch { /* connection may have failed */ }
      try {
        const last = await this.latest(client);
        if (last) return { report: last, refreshStatus: 'stale', errorCode: 'coverage_refresh_failed' };
      } catch { /* no readable report */ }
      throw new ServiceUnavailableException({ error: { code: 'coverage_unavailable', message: 'Raport jest niedostępny.', field_errors: [], retry_after_utc: null } });
    } finally {
      client.release();
    }
  }
}
