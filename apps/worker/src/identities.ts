import { createHash, randomUUID } from 'node:crypto';
import { link as hardLink, lstat, mkdir, readFile, realpath, unlink, writeFile } from 'node:fs/promises';
import { isAbsolute, relative, resolve, sep } from 'node:path';
import type { Pool, PoolClient } from 'pg';
import { responseRoot } from './archive-files.js';

const MAX_BYTES = 1_048_576;
const datePattern = /^\d{4}-\d{2}-\d{2}$/;
const keyPattern = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,99}$/;
const sourceIdPattern = /^[a-f0-9]{64}$/;
type Evidence = { source: string; ref: string; observed_at: string };
export type IdentityLinkInput = {
  source_symbol_id: string;
  instrument_key: string;
  valid_from: string;
  valid_to_exclusive: string | null;
  evidence: Evidence;
};
type IdentityMap = { schema_version: 1; links: IdentityLinkInput[] };
export type ValidatedIdentities = { map: IdentityMap; bytes: Buffer; sha256: string };

function validDate(value: unknown): value is string {
  if (typeof value !== 'string' || !datePattern.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.valueOf()) && date.toISOString().slice(0, 10) === value;
}

function object(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function keys(value: Record<string, unknown>, expected: string[]): boolean {
  return Object.keys(value).sort().join(',') === expected.sort().join(',');
}

function rejectDuplicateKeys(json: string): void {
  let offset = 0;
  const space = (): void => { while (/\s/.test(json[offset] ?? '')) offset++; };
  const quoted = (): string => {
    const start = offset++;
    while (offset < json.length) {
      if (json[offset] === '\\') { offset += 2; continue; }
      if (json[offset++] === '"') break;
    }
    return JSON.parse(json.slice(start, offset)) as string;
  };
  const value = (): void => {
    space();
    if (json[offset] === '{') {
      offset++;
      space();
      const seen = new Set<string>();
      while (json[offset] !== '}') {
        const key = quoted();
        if (seen.has(key)) throw new Error('identity_duplicate_key');
        seen.add(key);
        space();
        offset++;
        value();
        space();
        if (json[offset] === ',') { offset++; space(); } else break;
      }
      offset++;
    } else if (json[offset] === '[') {
      offset++;
      space();
      while (json[offset] !== ']') {
        value();
        space();
        if (json[offset] === ',') { offset++; space(); } else break;
      }
      offset++;
    } else if (json[offset] === '"') {
      quoted();
    } else {
      while (offset < json.length && !/[\s,}\]]/.test(json[offset])) offset++;
    }
  };
  value();
}

function parseMap(value: unknown): IdentityMap {
  if (!object(value) || !keys(value, ['schema_version', 'links']) || value.schema_version !== 1 || !Array.isArray(value.links))
    throw new Error('identity_map_invalid');
  const links: IdentityLinkInput[] = [];
  for (const [index, raw] of value.links.entries()) {
    const bad = (): never => { throw new Error(`identity_row_${index + 1}_invalid`); };
    if (!object(raw) || !keys(raw, ['source_symbol_id', 'instrument_key', 'valid_from', 'valid_to_exclusive', 'evidence']) ||
      typeof raw.source_symbol_id !== 'string' || !sourceIdPattern.test(raw.source_symbol_id) ||
      typeof raw.instrument_key !== 'string' || !keyPattern.test(raw.instrument_key) ||
      !validDate(raw.valid_from) ||
      (raw.valid_to_exclusive !== null && !validDate(raw.valid_to_exclusive)) ||
      (raw.valid_to_exclusive !== null && raw.valid_from >= raw.valid_to_exclusive) ||
      !object(raw.evidence) || !keys(raw.evidence, ['source', 'ref', 'observed_at']) ||
      typeof raw.evidence.source !== 'string' || raw.evidence.source.trim().length === 0 || raw.evidence.source.length > 200 ||
      typeof raw.evidence.ref !== 'string' || raw.evidence.ref.trim().length === 0 || raw.evidence.ref.length > 1000 ||
      !validDate(raw.evidence.observed_at)) bad();
    links.push(raw as IdentityLinkInput);
  }
  const bySource = new Map<string, IdentityLinkInput[]>();
  for (const link of links) bySource.set(link.source_symbol_id, [...(bySource.get(link.source_symbol_id) ?? []), link]);
  for (const rows of bySource.values()) {
    rows.sort((a, b) => a.valid_from.localeCompare(b.valid_from));
    for (let i = 1; i < rows.length; i++) {
      if (rows[i - 1].valid_to_exclusive === null || rows[i - 1].valid_to_exclusive! > rows[i].valid_from)
        throw new Error('identity_period_overlap');
    }
  }
  return { schema_version: 1, links };
}

async function checkedInput(path: string): Promise<Buffer> {
  const configuredRoot = resolve(process.env.LESINE_IDENTITY_INPUT_DIR ?? '/data/identity-input');
  const root = await realpath(configuredRoot);
  const absolute = resolve(path);
  const inRoot = relative(configuredRoot, absolute);
  if (!isAbsolute(absolute) || inRoot === '..' || inRoot.startsWith(`..${sep}`) || isAbsolute(inRoot))
    throw new Error('identity_input_path_invalid');
  const stat = await lstat(absolute);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size > MAX_BYTES) throw new Error('identity_input_file_invalid');
  const canonical = await realpath(absolute);
  const canonicalRelative = relative(root, canonical);
  if (canonicalRelative === '..' || canonicalRelative.startsWith(`..${sep}`) || isAbsolute(canonicalRelative))
    throw new Error('identity_input_path_invalid');
  const bytes = await readFile(canonical);
  if (bytes.length > MAX_BYTES) throw new Error('identity_input_file_invalid');
  return bytes;
}

export async function validateIdentities(pool: Pool, path: string): Promise<ValidatedIdentities> {
  const bytes = await checkedInput(path);
  const decoder = new TextDecoder('utf-8', { fatal: true });
  const content = decoder.decode(bytes);
  const parsed = JSON.parse(content) as unknown;
  rejectDuplicateKeys(content);
  const map = parseMap(parsed);
  const ids = [...new Set(map.links.map((link) => link.source_symbol_id))];
  if (ids.length) {
    const found = await pool.query<{ id: string; provider: string; provider_symbol: string }>(
      'SELECT id, provider, provider_symbol FROM source_symbols WHERE id = ANY($1::text[])', [ids]);
    const known = new Set(found.rows.map((row) => row.id));
    for (const [index, link] of map.links.entries())
      if (!known.has(link.source_symbol_id)) throw new Error(`identity_row_${index + 1}_unknown_source`);
    const source = new Map(found.rows.map((row) => [row.id, `${row.provider}:${row.provider_symbol}`]));
    const byProviderSymbol = new Map<string, IdentityLinkInput[]>();
    for (const item of map.links) {
      const key = source.get(item.source_symbol_id)!;
      byProviderSymbol.set(key, [...(byProviderSymbol.get(key) ?? []), item]);
    }
    for (const rows of byProviderSymbol.values()) {
      for (let i = 0; i < rows.length; i++) for (let j = i + 1; j < rows.length; j++) {
        const left = rows[i];
        const right = rows[j];
        if (left.source_symbol_id !== right.source_symbol_id && left.instrument_key !== right.instrument_key &&
          left.valid_from < (right.valid_to_exclusive ?? '9999-12-31') &&
          right.valid_from < (left.valid_to_exclusive ?? '9999-12-31'))
          throw new Error('identity_provider_symbol_ambiguous');
      }
    }
  }
  return { map, bytes, sha256: createHash('sha256').update(bytes).digest('hex') };
}

async function retainEvidence(bytes: Buffer, sha256: string): Promise<void> {
  const directory = resolve(responseRoot(), 'identity');
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const target = resolve(directory, `${sha256}.json`);
  const temp = resolve(directory, `.${randomUUID()}.tmp`);
  try {
    await writeFile(temp, bytes, { flag: 'wx', mode: 0o600 });
    try { await hardLink(temp, target); } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
    }
    const stored = await readFile(target);
    if (createHash('sha256').update(stored).digest('hex') !== sha256) throw new Error('identity_evidence_corrupt');
  } finally { await unlink(temp).catch(() => undefined); }
}

async function countUnresolved(client: PoolClient, batchId: string): Promise<number> {
  const result = await client.query<{ count: string }>(
    `SELECT count(*)::text AS count FROM source_symbols s WHERE NOT EXISTS
      (SELECT 1 FROM identity_links l WHERE l.batch_id = $1 AND l.source_symbol_id = s.id)`, [batchId]);
  return Number(result.rows[0].count);
}

export async function importIdentities(pool: Pool, path: string): Promise<{
  batch_id: string; sha256: string; link_count: number; unresolved_count: number;
}> {
  const validated = await validateIdentities(pool, path);
  await retainEvidence(validated.bytes, validated.sha256);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('SELECT pg_advisory_xact_lock(375092)');
    const head = await client.query<{ batch_id: string; sha256: string }>(
      'SELECT h.batch_id, b.sha256 FROM identity_head h JOIN identity_batches b ON b.id = h.batch_id');
    if (head.rows[0]?.sha256 === validated.sha256) {
      const batchId = head.rows[0].batch_id;
      const count = await client.query<{ count: string }>('SELECT count(*)::text AS count FROM identity_links WHERE batch_id = $1', [batchId]);
      const unresolved = await countUnresolved(client, batchId);
      await client.query('COMMIT');
      return { batch_id: batchId, sha256: validated.sha256,
        link_count: Number(count.rows[0].count), unresolved_count: unresolved };
    }
    const batchId = randomUUID();
    await client.query(`INSERT INTO identity_batches(id, schema_version, sha256, relative_path, predecessor_id)
      VALUES ($1, 1, $2, $3, $4)`, [batchId, validated.sha256,
      `identity/${validated.sha256}.json`, head.rows[0]?.batch_id ?? null]);
    const instrumentIds = new Map<string, string>();
    for (const link of validated.map.links) {
      let instrumentId = instrumentIds.get(link.instrument_key);
      if (!instrumentId) {
        instrumentId = randomUUID();
        await client.query('INSERT INTO instruments(id, stable_key) VALUES ($1, $2) ON CONFLICT (stable_key) DO NOTHING',
          [instrumentId, link.instrument_key]);
        const result = await client.query<{ id: string }>('SELECT id FROM instruments WHERE stable_key = $1', [link.instrument_key]);
        instrumentId = result.rows[0].id;
        instrumentIds.set(link.instrument_key, instrumentId);
      }
      await client.query(`INSERT INTO identity_links(id, batch_id, source_symbol_id, instrument_id,
        valid_from, valid_to_exclusive, evidence_source, evidence_ref, evidence_observed_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [randomUUID(), batchId, link.source_symbol_id, instrumentId, link.valid_from,
        link.valid_to_exclusive, link.evidence.source, link.evidence.ref, link.evidence.observed_at]);
    }
    await client.query(`INSERT INTO identity_head(singleton, batch_id) VALUES (true, $1)
      ON CONFLICT (singleton) DO UPDATE SET batch_id = EXCLUDED.batch_id`, [batchId]);
    const unresolved = await countUnresolved(client, batchId);
    await client.query('COMMIT');
    return { batch_id: batchId, sha256: validated.sha256,
      link_count: validated.map.links.length, unresolved_count: unresolved };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally { client.release(); }
}
