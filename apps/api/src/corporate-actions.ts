import type { Pool } from 'pg';

export type StoredAction = {
  id: string;
  source_symbol_id: string;
  data_class: 'dividends' | 'splits';
  ex_date: string;
  state: 'active' | 'withdrawn';
  ambiguous: boolean;
  amount: string | null;
  adjusted_amount: string | null;
  currency: string | null;
  split_numerator: string | null;
  split_denominator: string | null;
  split_raw: string | null;
  first_seen_at: Date;
  availability_evidence: string;
  source_file_sha256: string;
};

/** Returns the newest retained revision known to this local archive by the given cutoff. */
export async function readActionRevisions(pool: Pool, sourceSymbolId: string,
  dataClass: 'dividends' | 'splits', fromDate: string, toDate: string,
  firstSeenBefore: Date): Promise<StoredAction[]> {
  const result = await pool.query<StoredAction>(`SELECT r.id, r.source_symbol_id, r.data_class,
    to_char(r.ex_date, 'YYYY-MM-DD') AS ex_date, r.state, r.ambiguous,
    r.amount, r.adjusted_amount, r.currency, r.split_numerator, r.split_denominator,
    r.split_raw, r.first_seen_at, r.availability_evidence,
    m.sha256 AS source_file_sha256
    FROM (SELECT DISTINCT ON (event_key) * FROM corporate_action_revisions
      WHERE source_symbol_id = $1 AND data_class = $2
        AND ex_date BETWEEN $3::date AND $4::date AND first_seen_at <= $5
      ORDER BY event_key, first_seen_at DESC, id DESC) r
    JOIN raw_file_manifests m ON m.id = r.first_manifest_id
    ORDER BY r.ex_date, r.event_key`,
  [sourceSymbolId, dataClass, fromDate, toDate, firstSeenBefore]);
  return result.rows;
}
