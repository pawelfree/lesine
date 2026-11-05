import { createHash, randomUUID } from 'node:crypto';
import type { Pool, PoolClient } from 'pg';
import { assertArchivedFile } from './archive-files.js';

export type SnapshotClass = 'daily_bars' | 'dividends' | 'splits';
export type AvailabilityPolicy = 'strict_first_seen_v1' | 'research_assumed_v1';
export type SnapshotEvidence = 'verified' | 'assumed' | 'incomplete';
export type CreateSnapshotInput = {
  as_of_utc: string;
  source_symbol_ids: string[];
  data_classes: SnapshotClass[];
  from_date: string;
  to_date: string;
  availability_policy?: AvailabilityPolicy;
  allow_missing?: boolean;
};
export type ReadSnapshotInput = {
  snapshot_id: string;
  data_class: SnapshotClass;
  source_symbol_id?: string;
  from_date?: string;
  to_date?: string;
  instrument_id?: string;
};
type FileRef = { relative_path: string; sha256: string };
type Bar = FileRef & { id: string; source_symbol_id: string; session_date: string;
  available_at: Date; archive_generation: string };
type Action = FileRef & { id: string; source_symbol_id: string; data_class: 'dividends' | 'splits';
  ex_date: string; event_key: string; first_seen_at: Date; ambiguous: boolean; archive_generation: string };
type PickedBar = Bar & { availability_evidence: 'first_import' | 'research_assumption' };
type PickedAction = Action & { availability_evidence: 'research_assumption' };
type Missing = { source_symbol_id: string; data_class: SnapshotClass; reason: string; date?: string };
type CoveredRange = FileRef & { manifest_id: string; source_symbol_id: string; data_class: SnapshotClass;
  from_date: string; to_date: string; created_at: Date };
const idPattern = /^[a-f0-9]{64}$/;
const uuidPattern = /^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
const datePattern = /^\d{4}-\d{2}-\d{2}$/;
const MAX_ROWS = 50_000;

export class SnapshotError extends Error {
  constructor(readonly code: string, readonly details: unknown = null) { super(code); }
}

function date(value: unknown): value is string {
  if (typeof value !== 'string' || !datePattern.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.valueOf()) && parsed.toISOString().slice(0, 10) === value;
}

function cutoff(value: string): Date {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(value))
    throw new SnapshotError('invalid_cutoff');
  const parsed = new Date(value);
  if (Number.isNaN(parsed.valueOf()) || parsed.valueOf() > Date.now()) throw new SnapshotError('invalid_cutoff');
  return parsed;
}

function checkedInput(input: CreateSnapshotInput): {
  asOf: Date; ids: string[]; classes: SnapshotClass[]; policy: AvailabilityPolicy; allowMissing: boolean;
} {
  const asOf = cutoff(input.as_of_utc);
  if (!date(input.from_date) || !date(input.to_date) || input.from_date > input.to_date)
    throw new SnapshotError('invalid_date_range');
  if (!Array.isArray(input.source_symbol_ids) || !input.source_symbol_ids.length || input.source_symbol_ids.length > 500 ||
    input.source_symbol_ids.some((id) => !idPattern.test(id)) ||
    new Set(input.source_symbol_ids).size !== input.source_symbol_ids.length)
    throw new SnapshotError('invalid_source_scope');
  const valid = new Set<SnapshotClass>(['daily_bars', 'dividends', 'splits']);
  if (!Array.isArray(input.data_classes) || !input.data_classes.length ||
    input.data_classes.some((item) => !valid.has(item)) || new Set(input.data_classes).size !== input.data_classes.length)
    throw new SnapshotError('invalid_data_class');
  const days = (Date.parse(`${input.to_date}T00:00:00Z`) - Date.parse(`${input.from_date}T00:00:00Z`)) / 86_400_000;
  if (days > 366 || input.source_symbol_ids.length * (days + 1) > MAX_ROWS)
    throw new SnapshotError('snapshot_scope_too_large');
  const policy = input.availability_policy ?? 'strict_first_seen_v1';
  if (policy !== 'strict_first_seen_v1' && policy !== 'research_assumed_v1')
    throw new SnapshotError('invalid_availability_policy');
  if (input.allow_missing !== undefined && typeof input.allow_missing !== 'boolean')
    throw new SnapshotError('invalid_allow_missing');
  return { asOf, ids: [...input.source_symbol_ids].sort(), classes: [...input.data_classes].sort(),
    policy, allowMissing: input.allow_missing ?? false };
}

async function exists(client: PoolClient, table: string): Promise<boolean> {
  const result = await client.query<{ present: boolean }>('SELECT to_regclass($1) IS NOT NULL AS present', [`public.${table}`]);
  return result.rows[0].present;
}

function nextWeekdayAfter(dateString: string): Date {
  const next = new Date(`${dateString}T18:00:00.000Z`);
  do { next.setUTCDate(next.getUTCDate() + 1); }
  while (next.getUTCDay() === 0 || next.getUTCDay() === 6);
  // 18:00 UTC is after the normal Warsaw close; holidays are not inferred.
  return next;
}

async function verifyFiles(rows: FileRef[]): Promise<void> {
  const unique = new Map(rows.map((row) => [row.relative_path, row]));
  try { for (const ref of unique.values()) await assertArchivedFile(ref); }
  catch { throw new SnapshotError('snapshot_corrupt'); }
}

async function barsForScope(client: PoolClient, ids: string[], from: string, to: string, generation: number): Promise<Bar[]> {
  const result = await client.query<Bar>(
    `SELECT r.id, r.source_symbol_id, to_char(r.session_date, 'YYYY-MM-DD') AS session_date,
      r.available_at, r.archive_generation::text, m.relative_path, m.sha256
     FROM daily_bar_revisions r JOIN raw_file_manifests m ON m.id = r.first_manifest_id
     JOIN import_chunks c ON c.id = m.chunk_id AND c.status = 'done'
     WHERE r.source_symbol_id = ANY($1::text[]) AND r.session_date BETWEEN $2 AND $3
       AND r.archive_generation <= $4
     ORDER BY r.source_symbol_id, r.session_date, r.available_at, r.archive_generation, r.id
     LIMIT $5`, [ids, from, to, generation, MAX_ROWS + 1]);
  if (result.rows.length > MAX_ROWS) throw new SnapshotError('snapshot_scope_too_large');
  return result.rows;
}

async function actionsForScope(client: PoolClient, ids: string[], classes: SnapshotClass[], from: string, to: string, generation: number): Promise<Action[]> {
  if (!classes.some((item) => item !== 'daily_bars')) return [];
  if (!await exists(client, 'corporate_action_revisions')) throw new SnapshotError('unsupported_data_class');
  const result = await client.query<Action>(
    `SELECT a.id, a.source_symbol_id, a.data_class, to_char(a.ex_date, 'YYYY-MM-DD') AS ex_date,
      a.event_key, a.first_seen_at, a.ambiguous, a.archive_generation::text,
      m.relative_path, m.sha256
     FROM corporate_action_revisions a JOIN raw_file_manifests m ON m.id = a.first_manifest_id
     JOIN import_chunks c ON c.id = m.chunk_id AND c.status = 'done'
     WHERE a.source_symbol_id = ANY($1::text[]) AND a.data_class = ANY($2::text[])
       AND a.ex_date BETWEEN $3 AND $4 AND a.archive_generation <= $5
     ORDER BY a.source_symbol_id, a.data_class, a.event_key, a.first_seen_at, a.id
     LIMIT $6`, [ids, classes.filter((item) => item !== 'daily_bars'), from, to, generation, MAX_ROWS + 1]);
  if (result.rows.length > MAX_ROWS) throw new SnapshotError('snapshot_scope_too_large');
  return result.rows;
}

async function coverageForScope(client: PoolClient, ids: string[], classes: SnapshotClass[], from: string,
  to: string, generation: number): Promise<CoveredRange[]> {
  const result = await client.query<CoveredRange>(
    `SELECT m.id AS manifest_id, m.relative_path, m.sha256,
      c.resource_key AS source_symbol_id, m.data_class,
      to_char(c.from_date, 'YYYY-MM-DD') AS from_date,
      to_char(c.to_date, 'YYYY-MM-DD') AS to_date, m.created_at
     FROM import_chunks c JOIN raw_file_manifests m ON m.id = c.manifest_id
     WHERE c.status = 'done' AND c.resource_key = ANY($1::text[])
       AND m.data_class = ANY($2::text[]) AND c.to_date >= $3 AND c.from_date <= $4
       AND m.archive_generation <= $5 LIMIT $6`,
    [ids, classes, from, to, generation, MAX_ROWS + 1]);
  if (result.rows.length > MAX_ROWS) throw new SnapshotError('snapshot_scope_too_large');
  return result.rows;
}

function coverageEvidence(rows: CoveredRange[], id: string, dataClass: SnapshotClass,
  from: string, to: string, asOf: Date, policy: AvailabilityPolicy): {
    complete: boolean; assumed: boolean; used: CoveredRange[];
  } {
  const relevant = rows.filter((row) => row.source_symbol_id === id && row.data_class === dataClass &&
    (policy === 'research_assumed_v1' || row.created_at <= asOf))
    .sort((a, b) => a.from_date.localeCompare(b.from_date));
  let cursor = Date.parse(`${from}T00:00:00Z`);
  const end = Date.parse(`${to}T00:00:00Z`);
  let assumed = false;
  const used: CoveredRange[] = [];
  for (const range of relevant) {
    const start = Date.parse(`${range.from_date}T00:00:00Z`);
    const last = Date.parse(`${range.to_date}T00:00:00Z`);
    if (start > cursor) break;
    if (last >= cursor) {
      cursor = last + 86_400_000;
      if (range.created_at > asOf) assumed = true;
      used.push(range);
    }
    if (cursor > end) return { complete: true, assumed, used };
  }
  return { complete: false, assumed, used };
}

function selectBars(rows: Bar[], asOf: Date, policy: AvailabilityPolicy): { selected: PickedBar[]; missing: Missing[] } {
  const groups = new Map<string, Bar[]>();
  for (const row of rows) {
    const key = `${row.source_symbol_id}:${row.session_date}`;
    const group = groups.get(key);
    if (group) group.push(row); else groups.set(key, [row]);
  }
  const selected: PickedBar[] = [];
  const missing: Missing[] = [];
  for (const revisions of groups.values()) {
    const eligible = revisions.filter((row) => row.available_at <= asOf);
    const chosen = eligible.at(-1);
    if (chosen) selected.push({ ...chosen, availability_evidence: 'first_import' });
    else if (policy === 'research_assumed_v1' && nextWeekdayAfter(revisions[0].session_date) <= asOf)
      selected.push({ ...revisions[0], availability_evidence: 'research_assumption' });
    else missing.push({ source_symbol_id: revisions[0].source_symbol_id, data_class: 'daily_bars',
      date: revisions[0].session_date, reason: 'first_seen_after_cutoff' });
  }
  return { selected, missing };
}

function selectActions(rows: Action[], asOf: Date, policy: AvailabilityPolicy): { selected: PickedAction[]; missing: Missing[] } {
  const groups = new Map<string, Action[]>();
  for (const row of rows) {
    const key = `${row.source_symbol_id}:${row.data_class}:${row.event_key}`;
    const group = groups.get(key);
    if (group) group.push(row); else groups.set(key, [row]);
  }
  const selected: PickedAction[] = [];
  const missing: Missing[] = [];
  for (const revisions of groups.values()) {
    const first = revisions[0];
    // Date-only event fields cannot certify an exact publication time.
    const eligible = policy === 'research_assumed_v1' ? revisions.filter((row) => row.first_seen_at <= asOf) : [];
    const chosen = eligible.at(-1);
    if (chosen && !chosen.ambiguous) selected.push({ ...chosen, availability_evidence: 'research_assumption' });
    else missing.push({ source_symbol_id: first.source_symbol_id, data_class: first.data_class,
      date: first.ex_date, reason: chosen?.ambiguous ? 'ambiguous_action_identity' : 'unknown_action_publication_time' });
  }
  return { selected, missing };
}

async function identityBatch(client: PoolClient, asOf: Date, policy: AvailabilityPolicy): Promise<string | null> {
  if (!await exists(client, 'identity_head')) return null;
  const result = policy === 'strict_first_seen_v1'
    ? await client.query<{ batch_id: string; imported_at: Date } & FileRef>(
      `SELECT b.id AS batch_id, b.relative_path, b.sha256, b.imported_at FROM identity_batches b
       WHERE b.imported_at <= $1 ORDER BY b.imported_at DESC, b.id DESC LIMIT 1`, [asOf])
    : await client.query<{ batch_id: string; imported_at: Date } & FileRef>(
      `SELECT h.batch_id, b.relative_path, b.sha256, b.imported_at FROM identity_head h
       JOIN identity_batches b ON b.id = h.batch_id WHERE h.singleton = true`);
  const batch = result.rows[0];
  if (!batch) return null;
  await verifyFiles([batch]);
  return batch.batch_id;
}

export async function createSnapshot(pool: Pool, input: CreateSnapshotInput): Promise<{
  snapshot_id: string; archive_generation: number; identity_batch_id: string | null;
  evidence: SnapshotEvidence; evidence_scope: 'local_first_seen'; fingerprint: string; missing: Missing[];
}> {
  const checked = checkedInput(input);
  const client = await pool.connect();
  try {
    await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ');
    const sources = await client.query<{ id: string }>('SELECT id FROM source_symbols WHERE id = ANY($1::text[])', [checked.ids]);
    if (sources.rows.length !== checked.ids.length) throw new SnapshotError('unknown_source_symbol');
    const generationResult = await client.query<{ generation: string }>(
      'SELECT generation::text FROM archive_generation_state WHERE singleton = true');
    const generation = Number(generationResult.rows[0].generation);
    const bars = checked.classes.includes('daily_bars')
      ? await barsForScope(client, checked.ids, input.from_date, input.to_date, generation) : [];
    const actions = await actionsForScope(client, checked.ids, checked.classes,
      input.from_date, input.to_date, generation);
    const coverage = await coverageForScope(client, checked.ids, checked.classes,
      input.from_date, input.to_date, generation);
    const batchId = await identityBatch(client, checked.asOf, checked.policy);
    const pickedBars = selectBars(bars, checked.asOf, checked.policy);
    const pickedActions = selectActions(actions, checked.asOf, checked.policy);
    const missing = [...pickedBars.missing, ...pickedActions.missing];
    let coverageAssumed = false;
    const usedManifests = new Map<string, CoveredRange>();
    for (const id of checked.ids) for (const dataClass of checked.classes) {
      const proof = coverageEvidence(coverage, id, dataClass, input.from_date, input.to_date,
        checked.asOf, checked.policy);
      if (!proof.complete) missing.push({ source_symbol_id: id, data_class: dataClass, reason: 'unarchived_request_range' });
      if (proof.assumed) coverageAssumed = true;
      for (const manifest of proof.used) usedManifests.set(manifest.manifest_id, manifest);
    }
    if (missing.length && !checked.allowMissing) throw new SnapshotError('unknown_availability', missing);
    const selected = [...pickedBars.selected, ...pickedActions.selected];
    if (selected.length > MAX_ROWS) throw new SnapshotError('snapshot_scope_too_large');
    await verifyFiles([...selected, ...usedManifests.values()]);
    const evidence: SnapshotEvidence = missing.length ? 'incomplete'
      : checked.policy === 'research_assumed_v1' || coverageAssumed ||
        selected.some((row) => row.availability_evidence === 'research_assumption') ? 'assumed' : 'verified';
    const fingerprint = createHash('sha256').update(JSON.stringify({
      as_of_utc: checked.asOf.toISOString(), from_date: input.from_date, to_date: input.to_date,
      source_symbol_ids: checked.ids, data_classes: checked.classes, availability_policy: checked.policy,
      identity_batch_id: batchId, bar_ids: pickedBars.selected.map((row) => row.id).sort(),
      action_ids: pickedActions.selected.map((row) => row.id).sort(),
      manifest_ids: [...usedManifests.keys()].sort(), missing,
    })).digest('hex');
    const id = randomUUID();
    await client.query(`INSERT INTO data_snapshots(id, as_of_utc, source_symbol_ids, data_classes,
      from_date, to_date, availability_policy, archive_generation, identity_batch_id, evidence,
      allow_missing, missing, fingerprint)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12::jsonb, $13)`,
    [id, checked.asOf, checked.ids, checked.classes, input.from_date, input.to_date, checked.policy,
      generation, batchId, evidence, checked.allowMissing, JSON.stringify(missing), fingerprint]);
    for (const row of pickedBars.selected) await client.query(
      `INSERT INTO snapshot_bar_revisions(snapshot_id, source_symbol_id, session_date, revision_id, availability_evidence)
       VALUES ($1, $2, $3, $4, $5)`, [id, row.source_symbol_id, row.session_date, row.id, row.availability_evidence]);
    for (const row of pickedActions.selected) await client.query(
      `INSERT INTO snapshot_action_revisions(snapshot_id, source_symbol_id, data_class, ex_date,
        event_key, action_revision_id, availability_evidence) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [id, row.source_symbol_id, row.data_class, row.ex_date, row.event_key, row.id, row.availability_evidence]);
    for (const manifestId of usedManifests.keys()) await client.query(
      'INSERT INTO snapshot_scope_manifests(snapshot_id, manifest_id) VALUES ($1, $2)', [id, manifestId]);
    await client.query('COMMIT');
    return { snapshot_id: id, archive_generation: generation, identity_batch_id: batchId,
      evidence, evidence_scope: 'local_first_seen', fingerprint, missing };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally { client.release(); }
}

export async function readSnapshot(pool: Pool, input: ReadSnapshotInput): Promise<{
  snapshot_id: string; availability_policy: AvailabilityPolicy; evidence: SnapshotEvidence;
  evidence_scope: 'local_first_seen'; archive_generation: number; identity_batch_id: string | null;
  rows: unknown[]; missing: Missing[];
}> {
  if (!uuidPattern.test(input.snapshot_id) || !['daily_bars', 'dividends', 'splits'].includes(input.data_class) ||
    (input.source_symbol_id !== undefined && !idPattern.test(input.source_symbol_id)) ||
    (input.instrument_id !== undefined && !uuidPattern.test(input.instrument_id)) ||
    (input.from_date !== undefined && !date(input.from_date)) ||
    (input.to_date !== undefined && !date(input.to_date))) throw new SnapshotError('invalid_snapshot_filter');
  const client = await pool.connect();
  try {
    await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
    const meta = await client.query<{ id: string; availability_policy: AvailabilityPolicy;
      evidence: SnapshotEvidence; archive_generation: string; identity_batch_id: string | null;
      data_classes: SnapshotClass[]; source_symbol_ids: string[]; from_date: string; to_date: string;
      as_of_utc: Date; missing: Missing[] }>(
      `SELECT id, availability_policy, evidence, archive_generation::text, identity_batch_id, as_of_utc,
        data_classes, source_symbol_ids, to_char(from_date, 'YYYY-MM-DD') AS from_date,
        to_char(to_date, 'YYYY-MM-DD') AS to_date, missing
       FROM data_snapshots WHERE id = $1`, [input.snapshot_id]);
    const snapshot = meta.rows[0];
    if (!snapshot) throw new SnapshotError('snapshot_not_found');
    if (snapshot.identity_batch_id) {
      if (!await exists(client, 'identity_batches')) throw new SnapshotError('snapshot_corrupt');
      const batch = await client.query<FileRef>('SELECT relative_path, sha256 FROM identity_batches WHERE id = $1',
        [snapshot.identity_batch_id]);
      if (batch.rows.length !== 1) throw new SnapshotError('snapshot_corrupt');
      await verifyFiles(batch.rows);
    }
    if (!snapshot.data_classes.includes(input.data_class) ||
      (input.source_symbol_id && !snapshot.source_symbol_ids.includes(input.source_symbol_id)) ||
      (input.from_date && input.from_date < snapshot.from_date) ||
      (input.to_date && input.to_date > snapshot.to_date) ||
      (input.from_date && input.to_date && input.from_date > input.to_date))
      throw new SnapshotError('invalid_snapshot_filter');
    const from = input.from_date ?? snapshot.from_date;
    const to = input.to_date ?? snapshot.to_date;
    const params = [input.snapshot_id, input.source_symbol_id ?? null, from, to];
    let rows: Array<Record<string, unknown> & FileRef>;
    if (input.data_class === 'daily_bars') {
      rows = (await client.query<Record<string, unknown> & FileRef>(
        `SELECT b.source_symbol_id, to_char(b.session_date, 'YYYY-MM-DD') AS session_date,
          b.revision_id, b.availability_evidence, r.open, r.high, r.low, r.close, r.volume,
          m.relative_path, m.sha256
         FROM snapshot_bar_revisions b JOIN daily_bar_revisions r ON r.id = b.revision_id
         JOIN raw_file_manifests m ON m.id = r.first_manifest_id
         WHERE b.snapshot_id = $1 AND ($2::text IS NULL OR b.source_symbol_id = $2)
           AND b.session_date BETWEEN $3 AND $4
         ORDER BY b.source_symbol_id, b.session_date`, params)).rows;
    } else {
      if (!await exists(client, 'corporate_action_revisions')) throw new SnapshotError('snapshot_corrupt');
      rows = (await client.query<Record<string, unknown> & FileRef>(
        `SELECT a.source_symbol_id, a.data_class, to_char(a.ex_date, 'YYYY-MM-DD') AS ex_date,
          a.event_key, a.action_revision_id AS revision_id, a.availability_evidence,
          r.state, r.amount, r.adjusted_amount, r.currency,
          r.split_numerator, r.split_denominator, m.relative_path, m.sha256
         FROM snapshot_action_revisions a LEFT JOIN corporate_action_revisions r ON r.id = a.action_revision_id
         LEFT JOIN raw_file_manifests m ON m.id = r.first_manifest_id
         WHERE a.snapshot_id = $1 AND ($2::text IS NULL OR a.source_symbol_id = $2)
           AND a.ex_date BETWEEN $3 AND $4 AND a.data_class = $5
         ORDER BY a.source_symbol_id, a.ex_date, a.event_key`, [...params, input.data_class])).rows;
    }
    if (rows.length > MAX_ROWS) throw new SnapshotError('snapshot_scope_too_large');
    if (input.instrument_id) {
      if (!snapshot.identity_batch_id || !await exists(client, 'identity_links')) throw new SnapshotError('identity_unresolved');
      const links = await client.query<{ source_symbol_id: string; instrument_id: string;
        valid_from: string; valid_to_exclusive: string | null; evidence_observed_at: string }>(
        `SELECT source_symbol_id, instrument_id, to_char(valid_from, 'YYYY-MM-DD') AS valid_from,
           to_char(valid_to_exclusive, 'YYYY-MM-DD') AS valid_to_exclusive,
           to_char(evidence_observed_at, 'YYYY-MM-DD') AS evidence_observed_at
         FROM identity_links WHERE batch_id = $1 AND source_symbol_id = ANY($2::text[])
           AND valid_from <= $4 AND (valid_to_exclusive IS NULL OR valid_to_exclusive > $3)`,
        [snapshot.identity_batch_id, snapshot.source_symbol_ids, from, to]);
      const bySource = new Map<string, typeof links.rows>();
      for (const link of links.rows) {
        const sourceLinks = bySource.get(link.source_symbol_id);
        if (sourceLinks) sourceLinks.push(link); else bySource.set(link.source_symbol_id, [link]);
      }
      const matching: typeof rows = [];
      for (const row of rows) {
        const onDate = input.data_class === 'daily_bars' ? row.session_date : row.ex_date;
        const matches = (bySource.get(row.source_symbol_id as string) ?? []).filter((link) =>
          link.valid_from <= (onDate as string) &&
          (link.valid_to_exclusive === null || link.valid_to_exclusive > (onDate as string)));
        if (matches.length !== 1) throw new SnapshotError('identity_unresolved', { source_symbol_id: row.source_symbol_id, date: onDate });
        if (snapshot.availability_policy === 'strict_first_seen_v1' &&
          matches[0].evidence_observed_at >= snapshot.as_of_utc.toISOString().slice(0, 10))
          throw new SnapshotError('identity_unresolved', { source_symbol_id: row.source_symbol_id, date: onDate });
        if (matches[0].instrument_id === input.instrument_id) matching.push(row);
      }
      rows = matching;
    }
    const manifests = await client.query<FileRef>(
      `SELECT m.relative_path, m.sha256 FROM snapshot_scope_manifests s
       JOIN raw_file_manifests m ON m.id = s.manifest_id WHERE s.snapshot_id = $1`, [input.snapshot_id]);
    await verifyFiles([...rows, ...manifests.rows]);
    await client.query('COMMIT');
    return { snapshot_id: snapshot.id, availability_policy: snapshot.availability_policy,
      evidence: snapshot.evidence, evidence_scope: 'local_first_seen',
      archive_generation: Number(snapshot.archive_generation), identity_batch_id: snapshot.identity_batch_id,
      rows, missing: snapshot.missing };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally { client.release(); }
}
