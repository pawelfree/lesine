import { Controller, Get, HttpException, Param, Query } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { lstat } from 'node:fs/promises';
import { resolve } from 'node:path';
import { Database } from './database.js';

type DataClass = 'dividends' | 'splits';
type ListQuery = { data_class?: unknown; source_symbol_id?: unknown; provider_symbol?: unknown; from_date?: unknown;
  to_date?: unknown; cursor?: unknown };
type ActionRow = { event_key: string; revision_id: string; source_symbol_id: string;
  provider_symbol: string; data_class: DataClass; ex_date: string; state: string;
  ambiguous: boolean; amount: string | null; adjusted_amount: string | null;
  currency: string | null; split_numerator: string | null; split_denominator: string | null;
  split_raw: string | null; first_seen_at: Date; availability_evidence: string;
  source_file_sha256: string; relative_path: string; has_older_revisions: boolean };
type RevisionRow = ActionRow & { declaration_date: string | null; record_date: string | null;
  payment_date: string | null };

const sourceId = /^[a-f0-9]{64}$/;
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
const iso = /^\d{4}-\d{2}-\d{2}$/;
const date = (value: unknown): value is string => typeof value === 'string' && iso.test(value) &&
  !Number.isNaN(Date.parse(`${value}T00:00:00Z`)) &&
  new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;
const bad = (code = 'invalid_request'): HttpException =>
  new HttpException({ error: { code, message: code, field_errors: [], retry_after_utc: null } }, 400);
const corrupt = (): HttpException =>
  new HttpException({ error: { code: 'archive_corrupt', message: 'archive_corrupt',
    field_errors: [], retry_after_utc: null } }, 503);

function encode(value: unknown): string { return Buffer.from(JSON.stringify(value)).toString('base64url'); }
function decode(value: unknown, scope: string, position: 'action' | 'revision'): string[] | null {
  if (value === undefined) return null;
  if (typeof value !== 'string' || value.length > 1024 || !/^[A-Za-z0-9_-]+$/.test(value)) throw bad('invalid_cursor');
  try {
    const parsed: unknown = JSON.parse(Buffer.from(value, 'base64url').toString('utf8'));
    if (!parsed || typeof parsed !== 'object') throw bad('invalid_cursor');
    const cursor = parsed as { scope?: unknown; last?: unknown };
    if (cursor.scope !== scope || !Array.isArray(cursor.last) ||
      cursor.last.length !== (position === 'action' ? 3 : 2)) throw bad('invalid_cursor');
    const parts = cursor.last;
    if (position === 'action' ?
      !date(parts[0]) || typeof parts[1] !== 'string' || !sourceId.test(parts[1]) ||
        typeof parts[2] !== 'string' || !uuid.test(parts[2]) :
      typeof parts[0] !== 'string' || !Number.isFinite(Date.parse(parts[0])) ||
        typeof parts[1] !== 'string' || !uuid.test(parts[1])) throw bad('invalid_cursor');
    return parts as string[];
  } catch { throw bad('invalid_cursor'); }
}

async function verifyFiles(rows: { relative_path: string; source_file_sha256: string }[]): Promise<void> {
  const root = resolve(process.env.LESINE_RESPONSE_DIR ?? '/data/provider-responses');
  for (const [path, hash] of new Map(rows.map((row) => [row.relative_path, row.source_file_sha256])).entries()) {
    if (!sourceId.test(hash) || path !== `import/${hash}.json`) throw corrupt();
    const file = resolve(root, path);
    try {
      if (!(await lstat(file)).isFile()) throw corrupt();
      const digest = createHash('sha256');
      for await (const chunk of createReadStream(file)) digest.update(chunk as Buffer);
      if (digest.digest('hex') !== hash) throw corrupt();
    } catch { throw corrupt(); }
  }
}

function withoutPrivatePath<T extends { relative_path: string }>(row: T): Omit<T, 'relative_path'> {
  const { relative_path: _path, ...publicRow } = row;
  void _path;
  return publicRow;
}

@Controller('corporate-actions')
export class CorporateActionsController {
  constructor(private readonly database: Database) {}

  @Get()
  async list(@Query() query: ListQuery): Promise<{ data: { rows: Omit<ActionRow, 'relative_path'>[] };
    page: { next_cursor: string | null } }> {
    if (Object.keys(query).some((key) => !['data_class', 'source_symbol_id', 'provider_symbol', 'from_date', 'to_date', 'cursor'].includes(key)) ||
      (query.data_class !== undefined && query.data_class !== 'dividends' && query.data_class !== 'splits') ||
      (query.source_symbol_id !== undefined && (typeof query.source_symbol_id !== 'string' || !sourceId.test(query.source_symbol_id))) ||
      (query.provider_symbol !== undefined && (typeof query.provider_symbol !== 'string' || !/^[A-Z0-9.^-]{1,32}$/.test(query.provider_symbol))) ||
      (query.from_date !== undefined && !date(query.from_date)) ||
      (query.to_date !== undefined && !date(query.to_date)) ||
      (query.from_date && query.to_date && query.from_date > query.to_date)) throw bad();
    const kind = (query.data_class ?? 'dividends') as DataClass;
    const symbol = (query.source_symbol_id ?? null) as string | null;
    const providerSymbol = (query.provider_symbol ?? null) as string | null;
    const from = (query.from_date ?? null) as string | null;
    const to = (query.to_date ?? null) as string | null;
    const scope = JSON.stringify([kind, symbol, providerSymbol, from, to]);
    const last = decode(query.cursor, scope, 'action');
    const rows = await this.database.pool.query<ActionRow>(
      `WITH latest AS (
         SELECT DISTINCT ON (r.source_symbol_id, r.data_class, r.event_key) r.*
         FROM corporate_action_revisions r
         WHERE r.data_class = $1 AND ($2::text IS NULL OR r.source_symbol_id = $2)
           AND ($3::date IS NULL OR r.ex_date >= $3::date)
           AND ($4::date IS NULL OR r.ex_date <= $4::date)
         ORDER BY r.source_symbol_id, r.data_class, r.event_key, r.first_seen_at DESC, r.id DESC
       )
       SELECT l.event_key, l.id AS revision_id, l.source_symbol_id, s.provider_symbol,
         l.data_class, to_char(l.ex_date, 'YYYY-MM-DD') AS ex_date, l.state, l.ambiguous,
         l.amount, l.adjusted_amount, l.currency, l.split_numerator, l.split_denominator,
         l.split_raw, l.first_seen_at, l.availability_evidence,
         m.sha256 AS source_file_sha256, m.relative_path,
         EXISTS (SELECT 1 FROM corporate_action_revisions prior WHERE prior.source_symbol_id = l.source_symbol_id
           AND prior.data_class = l.data_class AND prior.event_key = l.event_key AND prior.id <> l.id) AS has_older_revisions
       FROM latest l JOIN source_symbols s ON s.id = l.source_symbol_id
         JOIN raw_file_manifests m ON m.id = l.first_manifest_id
       WHERE ($5::text IS NULL OR s.provider_symbol = $5)
         AND ($6::date IS NULL OR (l.ex_date, l.event_key, l.id) < ($6::date, $7::text, $8::uuid))
       ORDER BY l.ex_date DESC, l.event_key DESC, l.id DESC LIMIT 101`,
      [kind, symbol, from, to, providerSymbol, last?.[0] ?? null, last?.[1] ?? null, last?.[2] ?? null],
    );
    const page = rows.rows.slice(0, 100);
    await verifyFiles(page);
    const tail = rows.rows.length > 100 ? page[99] : null;
    return { data: { rows: page.map(withoutPrivatePath) },
      page: { next_cursor: tail ? encode({ scope, last: [tail.ex_date, tail.event_key, tail.revision_id] }) : null } };
  }

  @Get(':eventKey/revisions')
  async revisions(@Param('eventKey') eventKey: string, @Query() query: { source_symbol_id?: unknown; cursor?: unknown }):
    Promise<{ data: { rows: Omit<RevisionRow, 'relative_path'>[] }; page: { next_cursor: string | null } }> {
    if (!sourceId.test(eventKey) || typeof query.source_symbol_id !== 'string' ||
      !sourceId.test(query.source_symbol_id) ||
      Object.keys(query).some((key) => !['source_symbol_id', 'cursor'].includes(key))) throw bad();
    const symbol = query.source_symbol_id;
    const last = decode(query.cursor, `${symbol}:${eventKey}`, 'revision');
    const rows = await this.database.pool.query<RevisionRow>(
      `SELECT r.event_key, r.id AS revision_id, r.source_symbol_id, s.provider_symbol,
         r.data_class, to_char(r.ex_date, 'YYYY-MM-DD') AS ex_date, r.state, r.ambiguous,
         r.amount, r.adjusted_amount, r.currency, r.split_numerator, r.split_denominator,
         r.split_raw, to_char(r.declaration_date, 'YYYY-MM-DD') AS declaration_date,
         to_char(r.record_date, 'YYYY-MM-DD') AS record_date,
         to_char(r.payment_date, 'YYYY-MM-DD') AS payment_date,
         r.first_seen_at, r.availability_evidence,
         m.sha256 AS source_file_sha256, m.relative_path,
         EXISTS (SELECT 1 FROM corporate_action_revisions prior WHERE prior.source_symbol_id = r.source_symbol_id
           AND prior.data_class = r.data_class AND prior.event_key = r.event_key AND prior.id <> r.id) AS has_older_revisions
       FROM corporate_action_revisions r JOIN source_symbols s ON s.id = r.source_symbol_id
         JOIN raw_file_manifests m ON m.id = r.first_manifest_id
       WHERE r.event_key = $1 AND r.source_symbol_id = $2
         AND ($3::timestamptz IS NULL OR (r.first_seen_at, r.id) < ($3::timestamptz, $4::uuid))
       ORDER BY r.first_seen_at DESC, r.id DESC LIMIT 101`,
      [eventKey, symbol, last?.[0] ?? null, last?.[1] ?? null],
    );
    const page = rows.rows.slice(0, 100);
    await verifyFiles(page);
    const tail = rows.rows.length > 100 ? page[99] : null;
    return { data: { rows: page.map(withoutPrivatePath) },
      page: { next_cursor: tail ? encode({ scope: `${symbol}:${eventKey}`,
        last: [tail.first_seen_at.toISOString(), tail.revision_id] }) : null } };
  }
}
