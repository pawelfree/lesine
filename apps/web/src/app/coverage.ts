import { Component, Input, OnDestroy, signal } from '@angular/core';

type Finding = { from_date: string | null; to_date: string | null; reason_code: string; evidence_ref: string | null; evidence_checked_at: string | null };
type Row = { source_symbol_id: string; provider_symbol: string; market_segment: string; listing: string;
  in_current_catalog: boolean; source: string; data_class: string; status: string;
  expected_from: string | null; expected_to: string | null; provider_from: string | null; provider_to: string | null;
  acquired_from: string | null; acquired_to: string | null; findings: Finding[] };
type Report = { report_id: string | null; created_at: string | null; archive_last_committed_at: string | null;
  refresh_status: 'none' | 'fresh' | 'stale'; refresh_error_code: string | null; catalog_id: string | null;
  expected_scope_status: string; summary: { expected: number | null; provider_available: number | null; acquired: number | null; gaps: number | null };
  rows: Row[]; scope: { market: string; listing: string; status: string; source: string; data_class: string } };
type ResponseBody = { data: Report; page: { next_cursor: string | null } };
type Cached = { version: 1; saved_at: string; response: ResponseBody };
const cacheKey = 'lesine-eod-coverage-v1';

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function textOrNull(value: unknown): value is string | null {
  return value === null || typeof value === 'string';
}

function countOrNull(value: unknown): value is number | null {
  return value === null || (typeof value === 'number' && Number.isSafeInteger(value) && value >= 0);
}

function validResponse(value: unknown): value is ResponseBody {
  if (!record(value) || !record(value['data']) || !record(value['page'])) return false;
  const data = value['data'];
  if (!textOrNull(data['report_id']) || !textOrNull(data['created_at']) ||
    !textOrNull(data['archive_last_committed_at']) || !textOrNull(data['catalog_id']) ||
    !['none', 'fresh', 'stale'].includes(String(data['refresh_status'])) ||
    !textOrNull(data['refresh_error_code']) || typeof data['expected_scope_status'] !== 'string' ||
    !record(data['scope']) || !record(data['summary']) || !Array.isArray(data['rows']) ||
    data['rows'].length > 200 || !textOrNull(value['page']['next_cursor'])) return false;
  const scope = data['scope'];
  if (!['all', 'main', 'newconnect', 'unclassified'].includes(String(scope['market'])) ||
    !['all', 'active', 'delisted', 'unknown'].includes(String(scope['listing'])) ||
    !['all', 'complete', 'partial', 'unavailable', 'unclassified', 'unknown'].includes(String(scope['status'])) ||
    scope['source'] !== 'eodhd' || scope['data_class'] !== 'daily_bars') return false;
  const summary = data['summary'];
  if (!['expected', 'provider_available', 'acquired', 'gaps'].every((key) => countOrNull(summary[key]))) return false;
  return data['rows'].every((entry: unknown) => {
    if (!record(entry) || !Array.isArray(entry['findings']) || entry['findings'].length > 100 ||
      typeof entry['source_symbol_id'] !== 'string' || typeof entry['provider_symbol'] !== 'string' ||
      typeof entry['market_segment'] !== 'string' || typeof entry['listing'] !== 'string' ||
      typeof entry['in_current_catalog'] !== 'boolean' || typeof entry['status'] !== 'string') return false;
    if (!['expected_from', 'expected_to', 'provider_from', 'provider_to', 'acquired_from', 'acquired_to']
      .every((key) => textOrNull(entry[key]))) return false;
    return entry['findings'].every((finding: unknown) => record(finding) &&
      textOrNull(finding['from_date']) && textOrNull(finding['to_date']) &&
      typeof finding['reason_code'] === 'string' && textOrNull(finding['evidence_ref']) &&
      textOrNull(finding['evidence_checked_at']));
  });
}

@Component({
  selector: 'app-coverage',
  styles: [`
    .coverage { margin-top: 1.5rem; padding: 1.25rem; background: white; border: 1px solid #dce5e9; border-radius: 0.75rem; }
    .filters { display: flex; flex-wrap: wrap; gap: 0.75rem; margin: 1rem 0; }
    .filters label { display: grid; gap: 0.3rem; min-width: 9rem; }
    select, button { font: inherit; padding: 0.45rem; }
    .summary { display: grid; grid-template-columns: repeat(auto-fit, minmax(9rem, 1fr)); gap: 0.6rem; margin: 1rem 0; }
    .summary div { border: 1px solid #dce5e9; border-radius: 0.4rem; padding: 0.7rem; }
    .summary strong { display: block; margin-top: 0.25rem; }
    .table-wrap { overflow-x: auto; }
    table { border-collapse: collapse; width: 100%; min-width: 45rem; }
    th, td { padding: 0.5rem; text-align: left; vertical-align: top; border-bottom: 1px solid #dce5e9; }
    details { max-width: 24rem; }
    summary { cursor: pointer; }
    :is(select, button, summary):focus-visible { outline: 3px solid #156b91; outline-offset: 2px; }
    .notice { padding: 0.65rem; border-left: 4px solid #a56517; background: #fff8e9; }
    .actions { display: flex; gap: 0.5rem; margin-top: 0.7rem; }
  `],
  template: `
    <section class="coverage" aria-labelledby="coverage-title">
      <h2 id="coverage-title">Zakres notowań EOD</h2>
      <p>Raport dotyczy lokalnie zapisanych notowań. Nie potwierdza kompletności historii GPW.</p>
      <div class="filters">
        <label>Źródło<select aria-label="Źródło raportu"><option value="eodhd">EODHD</option></select></label>
        <label>Klasa danych<select aria-label="Klasa danych"><option value="daily_bars">Notowania EOD</option></select></label>
        <label>Rynek<select [value]="market()" (change)="changeFilter('market', $event)">
          <option value="all">Wszystkie</option><option value="main">Rynek główny</option>
          <option value="newconnect">NewConnect</option><option value="unclassified">Niesklasyfikowane</option>
        </select></label>
        <label>Notowanie<select [value]="listing()" (change)="changeFilter('listing', $event)">
          <option value="all">Wszystkie</option><option value="active">Aktywne</option>
          <option value="delisted">Wycofane</option><option value="unknown">Nieznane</option>
        </select></label>
        <label>Stan<select [value]="status()" (change)="changeFilter('status', $event)">
          <option value="all">Wszystkie</option><option value="unknown">Nieznany</option>
          <option value="unclassified">Niesklasyfikowany</option><option value="partial">Częściowy</option>
          <option value="unavailable">Niedostępny</option><option value="complete">Kompletny</option>
        </select></label>
      </div>
      <div class="actions"><button type="button" (click)="refresh()">Odśwież raport</button></div>
      @if (loading()) { <p role="status">Wczytywanie zakresu EOD…</p> }
      @if (accessDenied()) { <p role="alert">Brak dostępu do raportu.</p> }
      @else if (error()) { <p role="alert">Nie można pobrać bieżącego raportu. @if (cached()) { Pokazano zapisany wcześniej widok. }</p> }
      @if (cached()) { <p class="notice" role="status">Widok z pamięci przeglądarki, zapisany {{ cachedAt() }}. Dane mogą być nieaktualne; filtry dotyczą zapisanego widoku. @if (cachedFiltersDiffer()) { Wybrane teraz filtry nie zostały zastosowane. }</p> }
      @if (result(); as current) {
        @if (current.data.report_id) {
          <p>Raport obliczony: <strong>{{ current.data.created_at }}</strong>. Ostatnie zapisane EOD: <strong>{{ current.data.archive_last_committed_at || 'brak' }}</strong>.</p>
          @if (current.data.refresh_status === 'stale') { <p class="notice" role="alert">Nie udało się odświeżyć raportu. Pokazano poprzednią wersję z podaną datą.</p> }
          @if (jobStatus === 'failed' || jobStatus === 'quota_wait' || jobStatus === 'paused') {
            <p class="notice">Import: {{ jobLabel(jobStatus) }}. Ostatnia zmiana: {{ jobUpdatedAt || 'nieznana' }}. Raport nie potwierdza aktualności danych źródła.</p>
          }
          @if (current.data.expected_scope_status !== 'verified') { <p class="notice">Oczekiwany zakres rynku jest nieznany lub częściowy. Brak potwierdzenia pełnej historii GPW.</p> }
          <p>Generacja katalogu: {{ current.data.catalog_id || 'brak' }}. Zakres: EOD, EODHD.</p>
          <div class="summary" aria-label="Podsumowanie zakresu">
            <div>Oczekiwane<strong>{{ count(current.data.summary.expected) }}</strong></div>
            <div>Dostępne u dostawcy<strong>{{ count(current.data.summary.provider_available) }}</strong></div>
            <div>Zapisane obserwacje<strong>{{ count(current.data.summary.acquired) }}</strong></div>
            <div>Potwierdzone luki<strong>{{ count(current.data.summary.gaps) }}</strong></div>
          </div>
          @if (!current.data.rows.length) { <p>Brak rekordów dla wybranych filtrów.</p> }
          @if (current.data.rows.length) {
            <div class="table-wrap"><table><thead><tr><th scope="col">Symbol</th><th scope="col">Rynek / notowanie</th><th scope="col">Oczekiwane</th><th scope="col">Dostawca</th><th scope="col">Zapisane</th><th scope="col">Stan i dowody</th></tr></thead>
              <tbody>@for (row of current.data.rows; track row.source_symbol_id) {
                <tr><td>{{ row.provider_symbol }} @if (!row.in_current_catalog) { <span>(poza bieżącym katalogiem)</span> }</td>
                  <td>{{ marketLabel(row.market_segment) }} / {{ listingLabel(row.listing) }}</td>
                  <td>{{ range(row.expected_from, row.expected_to) }}</td>
                  <td>{{ range(row.provider_from, row.provider_to) }}</td>
                  <td>{{ range(row.acquired_from, row.acquired_to) }}</td>
                  <td>{{ statusLabel(row.status) }}<details><summary>Powody i dowody</summary>
                    <ul>@for (finding of row.findings; track $index) {
                      <li>{{ reasonLabel(finding.reason_code) }} @if (finding.from_date || finding.to_date) { ({{ range(finding.from_date, finding.to_date) }}) }
                        @if (finding.evidence_ref) { — identyfikator dowodu: {{ finding.evidence_ref }} }
                        @if (finding.evidence_checked_at) { ({{ finding.evidence_checked_at }}) }
                      </li>
                    }</ul></details></td></tr>
              }</tbody></table></div>
            @if (current.page.next_cursor && !cached()) { <button type="button" (click)="next()">Następna strona raportu</button> }
          }
        } @else { <p role="status">Brak raportu EOD. Oczekiwany zakres i liczby są nieznane.</p> }
      }
    </section>
  `,
})
export class CoverageSection implements OnDestroy {
  @Input() jobStatus: string | null = null;
  @Input() jobUpdatedAt: string | null = null;
  readonly result = signal<ResponseBody | null>(null);
  readonly loading = signal(true);
  readonly error = signal(false);
  readonly accessDenied = signal(false);
  readonly cached = signal(false);
  readonly cachedAt = signal<string | null>(null);
  readonly market = signal('all');
  readonly listing = signal('all');
  readonly status = signal('all');
  private cursor: string | null = null;
  private sequence = 0;

  constructor() { this.restoreCache(); void this.load(); }
  ngOnDestroy(): void { ++this.sequence; }

  count(value: number | null): string { return value === null ? 'nieznane' : String(value); }
  range(from: string | null, to: string | null): string { return from || to ? `${from || 'nieznane'} – ${to || 'nieznane'}` : 'nieznany'; }
  marketLabel(value: string): string { return ({ main: 'Rynek główny', newconnect: 'NewConnect', unclassified: 'Niesklasyfikowany' } as Record<string, string>)[value] ?? 'Nieznany'; }
  listingLabel(value: string): string { return ({ active: 'aktywne', delisted: 'wycofane', unknown: 'nieznane' } as Record<string, string>)[value] ?? 'nieznane'; }
  statusLabel(value: string): string { return ({ unknown: 'nieznany', unclassified: 'niesklasyfikowany', partial: 'częściowy', unavailable: 'niedostępny', complete: 'kompletny' } as Record<string, string>)[value] ?? 'nieznany'; }
  jobLabel(value: string): string { return ({ failed: 'nieudany', quota_wait: 'oczekiwanie na limit', paused: 'wstrzymany' } as Record<string, string>)[value] ?? 'nieznany'; }
  reasonLabel(value: string): string { return ({ expected_scope_unknown: 'Oczekiwany zakres nie został potwierdzony', import_request_unfinished: 'Żądanie importu nie zostało ukończone', archive_evidence_missing: 'Brak zapisanego dowodu odpowiedzi', archived_empty_response: 'Zapisano pustą odpowiedź; sesje w tym przedziale nie są potwierdzone', unverified_date_interval: 'Przedział między obserwacjami nie został zweryfikowany' } as Record<string, string>)[value] ?? 'Nieznany powód'; }

  cachedFiltersDiffer(): boolean {
    const scope = this.result()?.data.scope;
    return !!scope && (scope.market !== this.market() || scope.listing !== this.listing() || scope.status !== this.status());
  }

  changeFilter(kind: 'market' | 'listing' | 'status', event: Event): void {
    const value = (event.target as HTMLSelectElement).value;
    if (kind === 'market') this.market.set(value);
    if (kind === 'listing') this.listing.set(value);
    if (kind === 'status') this.status.set(value);
    this.cursor = null;
    void this.load();
  }
  refresh(): void { this.cursor = null; void this.load(); }
  next(): void { this.cursor = this.result()?.page.next_cursor ?? null; if (this.cursor) void this.load(); }

  private readCache(): Cached | null {
    try {
      const raw = localStorage.getItem(cacheKey);
      if (!raw) return null;
      const cached: unknown = raw.length <= 65_536 ? JSON.parse(raw) : null;
      const savedAt = record(cached) ? cached['saved_at'] : null;
      const timestamp = typeof savedAt === 'string' ? Date.parse(savedAt) : NaN;
      if (!record(cached) || cached['version'] !== 1 || !validResponse(cached['response']) ||
        cached['response'].page.next_cursor !== null || !Number.isFinite(timestamp) ||
        timestamp > Date.now() || Date.now() - timestamp > 7 * 86_400_000) {
        localStorage.removeItem(cacheKey);
        return null;
      }
      return cached as Cached;
    } catch {
      try { localStorage.removeItem(cacheKey); } catch { /* storage unavailable */ }
      return null;
    }
  }

  private showCached(cached: Cached, alignFilters: boolean): void {
    this.result.set(cached.response);
    this.cachedAt.set(cached.saved_at);
    this.cached.set(true);
    this.cursor = null;
    if (alignFilters) {
      this.market.set(cached.response.data.scope.market);
      this.listing.set(cached.response.data.scope.listing);
      this.status.set(cached.response.data.scope.status);
    }
  }

  private restoreCache(): void {
    const cached = this.readCache();
    if (cached) this.showCached(cached, true);
  }

  private saveCache(response: ResponseBody): void {
    try {
      const encoded = JSON.stringify({ version: 1, saved_at: new Date().toISOString(),
        response: { data: response.data, page: { next_cursor: null } } } satisfies Cached);
      if (encoded.length <= 65_536) localStorage.setItem(cacheKey, encoded);
    } catch { /* cache is optional */ }
  }

  private async load(): Promise<void> {
    const sequence = ++this.sequence;
    const cursor = this.cursor;
    this.loading.set(true);
    this.error.set(false);
    this.accessDenied.set(false);
    try {
      const params = new URLSearchParams({ market: this.market(), listing: this.listing(), status: this.status(), source: 'eodhd', data_class: 'daily_bars' });
      if (cursor) params.set('cursor', cursor);
      const response = await fetch(`/api/coverage?${params}`);
      if (sequence !== this.sequence) return;
      if (response.status === 400 && cursor) { this.cursor = null; void this.load(); return; }
      if (response.status === 403) {
        try { localStorage.removeItem(cacheKey); } catch { /* storage unavailable */ }
        this.result.set(null); this.cached.set(false); this.cachedAt.set(null); this.cursor = null;
        this.accessDenied.set(true);
        throw new Error('access_denied');
      }
      if (!response.ok) throw new Error('coverage_unavailable');
      const body: unknown = await response.json();
      if (sequence !== this.sequence) return;
      if (!validResponse(body)) throw new Error('invalid_coverage_response');
      this.result.set(body);
      this.cached.set(false);
      this.cachedAt.set(null);
      if (!cursor) this.saveCache(body);
    } catch {
      if (sequence === this.sequence && !this.accessDenied()) {
        this.error.set(true);
        const cached = this.readCache();
        if (cached) this.showCached(cached, false);
        else { this.result.set(null); this.cached.set(false); this.cachedAt.set(null); this.cursor = null; }
      }
    }
    finally { if (sequence === this.sequence) this.loading.set(false); }
  }
}
