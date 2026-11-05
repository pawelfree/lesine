import { BadRequestException, Controller, Get, HttpException, NotFoundException, Param, Query } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { Database } from './database.js';

const uuidPattern = /^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
const sourcePattern = /^[a-f0-9]{64}$/;

@Controller()
export class IdentitiesController {
  constructor(private readonly database: Database) {}

  private async head(): Promise<{ id: string; sha256: string; relative_path: string } | null> {
    const result = await this.database.pool.query<{ id: string; sha256: string; relative_path: string }>(
      'SELECT b.id, b.sha256, b.relative_path FROM identity_head h JOIN identity_batches b ON b.id = h.batch_id',
    );
    const batch = result.rows[0];
    if (!batch) return null;
    if (batch.relative_path !== `identity/${batch.sha256}.json` || !sourcePattern.test(batch.sha256))
      throw new HttpException({ error: { code: 'archive_corrupt' } }, 503);
    const path = resolve(process.env.LESINE_RESPONSE_DIR ?? '/data/provider-responses', batch.relative_path);
    const bytes = await readFile(path).catch(() => { throw new HttpException({ error: { code: 'archive_corrupt' } }, 503); });
    if (createHash('sha256').update(bytes).digest('hex') !== batch.sha256)
      throw new HttpException({ error: { code: 'archive_corrupt' } }, 503);
    return batch;
  }

  @Get('instruments/:id/identities')
  async instrument(@Param('id') id: string): Promise<{ data: { batch_id: string | null; instrument: unknown; links: unknown[] } }> {
    if (!uuidPattern.test(id)) throw new NotFoundException('instrument_not_found');
    const instrument = await this.database.pool.query('SELECT id, stable_key FROM instruments WHERE id = $1', [id]);
    if (!instrument.rows[0]) throw new NotFoundException('instrument_not_found');
    const batch = await this.head();
    const links = batch ? await this.database.pool.query(
      `SELECT l.source_symbol_id, s.provider, s.provider_symbol,
        to_char(l.valid_from, 'YYYY-MM-DD') AS valid_from,
        to_char(l.valid_to_exclusive, 'YYYY-MM-DD') AS valid_to_exclusive,
        l.evidence_source, l.evidence_ref,
        to_char(l.evidence_observed_at, 'YYYY-MM-DD') AS evidence_observed_at,
        'owner_attested' AS evidence_class
       FROM identity_links l JOIN source_symbols s ON s.id = l.source_symbol_id
       WHERE l.batch_id = $1 AND l.instrument_id = $2 ORDER BY l.valid_from, l.source_symbol_id`,
      [batch.id, id]) : null;
    return { data: { batch_id: batch?.id ?? null, instrument: instrument.rows[0], links: links?.rows ?? [] } };
  }

  @Get('identities/unresolved')
  async unresolved(@Query('after') after?: string): Promise<{ data: { batch_id: string | null; rows: unknown[] }; page: { next_cursor: string | null } }> {
    if (after && !sourcePattern.test(after)) throw new BadRequestException('invalid_cursor');
    const batch = await this.head();
    const rows = await this.database.pool.query(
      `SELECT s.id, s.provider, s.provider_symbol, s.display_name, s.listing_state
       FROM source_symbols s WHERE s.id > $1 AND NOT EXISTS (
         SELECT 1 FROM identity_links l WHERE l.batch_id = $2 AND l.source_symbol_id = s.id
           AND l.valid_from <= CURRENT_DATE AND (l.valid_to_exclusive IS NULL OR l.valid_to_exclusive > CURRENT_DATE))
       ORDER BY s.id LIMIT 101`, [after ?? '', batch?.id ?? '00000000-0000-0000-0000-000000000000']);
    const page = rows.rows.slice(0, 100);
    return { data: { batch_id: batch?.id ?? null, rows: page },
      page: { next_cursor: rows.rows.length > 100 ? page[99].id as string : null } };
  }
}
