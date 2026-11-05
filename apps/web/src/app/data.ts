import { Component, ElementRef, OnDestroy, ViewChild, signal } from '@angular/core';

type CatalogRow = {
  id: string;
  provider_symbol: string;
  display_name: string | null;
  listing_state: string;
  market_segment: string;
  identity_evidence_ref: string;
};
type CatalogResponse = {
  data: { status: string; expected_scope_status: string; rights_status: string; checked_at: string | null; current_catalog_id: string | null; catalog_origin: string | null; count: number; rows: CatalogRow[]; sample: { listing_state: string; status: string; error_code: string | null }[]; depth_sample: { listing_state: string; data_class: string; provider_symbol: string; sample_from: string; sample_to: string; earliest_observed: string | null; latest_observed: string | null; status: string }[] };
  page: { next_cursor: string | null };
};
type ImportJob = { id: string; status: string; completed_chunks: number; total_chunks: number; cursor: string | null;
  error_code: string | null; retry_after_utc: string | null; updated_at: string };
type CatalogJob = { id: string; status: string; active_saved: boolean; delisted_saved: boolean;
  error_code: string | null; retry_after_utc: string | null; updated_at: string };

@Component({
  selector: 'app-data',
  template: `
    <section class="data-page">
      <p class="eyebrow">LOKALNE DANE RYNKOWE</p>
      <h1>Dane GPW</h1>
      <p>Stan katalogu źródła. Kompletność historycznych notowań nie została jeszcze potwierdzona.</p>
      <section class="status" aria-label="Pobieranie katalogu">
        <h2>Katalog instrumentów</h2>
        @if (catalog(); as currentCatalog) {
          <p>W lokalnym katalogu: <strong>{{ currentCatalog.data.count }}</strong> tickerów.</p>
          <button #refreshTrigger type="button" (click)="startCatalogRefresh()" [disabled]="catalogBusy() || catalogJob()?.status === 'queued' || catalogJob()?.status === 'running' || catalogJob()?.status === 'quota_wait'">
            {{ currentCatalog.data.count ? 'Pobierz katalog ponownie' : 'Pobierz katalog spółek' }}
          </button>
        }
        @if (catalogJob(); as currentJob) {
          <p role="status">Pobieranie katalogu: {{ jobLabel(currentJob.status) }}. Lista aktywna: {{ currentJob.active_saved ? 'zapisana' : 'oczekuje' }}; wycofana: {{ currentJob.delisted_saved ? 'zapisana' : 'oczekuje' }}.</p>
          @if (currentJob.error_code) { <p role="alert">Przyczyna: {{ errorLabel(currentJob.error_code) }}. Bieżący katalog pozostaje dostępny.</p> }
          @if (currentJob.retry_after_utc) { <p>Możliwa kolejna próba: {{ currentJob.retry_after_utc }}</p> }
          @if (currentJob.status === 'failed' || (currentJob.status === 'quota_wait' && retryReady(currentJob.retry_after_utc))) {
            <button type="button" (click)="resumeCatalogRefresh()" [disabled]="catalogBusy()">Ponów pobieranie katalogu</button>
          }
        }
        <button type="button" (click)="refreshCatalogJob()">Odśwież stan katalogu</button>
        @if (catalogError()) { <p role="alert">Nie udało się wykonać operacji katalogu. Sprawdź stan i spróbuj ponownie.</p> }
        @if (catalogChanged()) { <p role="alert">Katalog zmienił się w międzyczasie. Sprawdź aktualną listę i ponownie zdecyduj o pobraniu.</p> }
      </section>
      <dialog #confirmDialog (cancel)="cancelCatalogRefresh()" aria-labelledby="catalog-confirm-title">
        <h2 id="catalog-confirm-title">Pobrać katalog ponownie?</h2>
        <p>Widoczna lista {{ catalog()?.data?.count }} tickerów zostanie zastąpiona po pobraniu obu części katalogu. Zapisane dane historyczne pozostaną dostępne.</p>
        <button type="button" (click)="cancelCatalogRefresh()">Anuluj</button>
        <button type="button" (click)="confirmCatalogRefresh()">Potwierdź pobranie</button>
      </dialog>
      <section class="status" aria-label="Import notowań">
        <h2>Import notowań</h2>
        @if (job(); as current) {
          <p role="status">Stan: {{ jobLabel(current.status) }}. Ukończono {{ current.completed_chunks }} z {{ current.total_chunks }} części.</p>
          <p>Ostatnia aktualizacja: {{ current.updated_at }}</p>
          @if (current.error_code) { <p>Przyczyna: {{ errorLabel(current.error_code) }}</p> }
          @if (current.retry_after_utc) { <p>Możliwa kolejna próba: {{ current.retry_after_utc }}</p> }
          @if (current.status === 'paused' || current.status === 'failed') {
            <button type="button" (click)="resumeImport()" [disabled]="jobBusy()">Wznów import</button>
          }
        } @else { <p>Nie uruchomiono jeszcze importu notowań.</p> }
        @if (!job() || job()?.status === 'done') {
          <button type="button" (click)="startImport()" [disabled]="jobBusy() || !catalog()?.data?.count">Pobierz ostatni rok notowań</button>
        }
        <button type="button" (click)="refreshJob()">Odśwież stan</button>
        @if (jobError()) { <p role="alert">Nie udało się wykonać operacji importu. Sprawdź stan źródła i spróbuj ponownie.</p> }
      </section>
      @if (loading()) { <p role="status">Wczytywanie katalogu…</p> }
      @if (error()) { <p role="alert">Nie udało się odczytać lokalnego katalogu. Wcześniejsze dane mogą nadal istnieć.</p> }
      @if (catalog(); as result) {
        <section class="status" aria-label="Stan katalogu">
          <h2>Zakres źródła</h2>
          <p>Potwierdzony zakres GPW: <strong>nieznany</strong></p>
          <p>Uprawnienia do retencji danych dla konta: <strong>niezweryfikowane</strong></p>
          <p>Liczba lokalnych rekordów źródła: <strong>{{ result.data.count }}</strong></p>
          @if (result.data.checked_at) { <p>Ostatnio opublikowany katalog: {{ result.data.checked_at }}</p> }
          @if (result.data.catalog_origin === 'legacy') { <p>Zastany katalog — data publikacji nieznana.</p> }
          @if (result.data.status === 'empty') { <p role="status">Brak pobranych danych. Nie wykonano jeszcze próby odczytu źródła.</p> }
          @if (result.data.status === 'unavailable') { <p role="status">Źródło jest niedostępne lub brak dostępu. Dane nie są oznaczone jako kompletne.</p> }
          @if (result.data.status === 'partial' && result.data.catalog_origin === 'legacy') { <p role="status">Zastany katalog nie potwierdza, czy pobrano obie listy WAR.</p> }
          @if (result.data.status === 'partial' && result.data.catalog_origin !== 'legacy') { <p role="status">Próbka źródła jest częściowa. Nie wszystkie listy były dostępne.</p> }
          @for (sample of result.data.sample; track sample.listing_state) {
            <p>{{ sample.listing_state === 'active' ? 'Aktywne' : 'Wycofane' }}: {{ statusLabel(sample.status) }} @if (sample.error_code) { ({{ errorLabel(sample.error_code) }}) }</p>
          }
          @if (result.data.depth_sample.length > 0) {
            <h3>Ograniczona próbka dostępności</h3>
            <p>Najwcześniejsza data poniżej dotyczy tylko rocznego okna próbki, nie początku historii źródła.</p>
            <ul>@for (depth of result.data.depth_sample; track depth.listing_state + depth.data_class) {
              <li>{{ depth.provider_symbol }} ({{ depth.listing_state === 'active' ? 'aktywne' : 'wycofane' }}), {{ classLabel(depth.data_class) }}: {{ statusLabel(depth.status) }}; okno {{ depth.sample_from }}–{{ depth.sample_to }}; najwcześniejsza dostępna w próbce: {{ depth.earliest_observed || 'nieznana' }}</li>
            }</ul>
          }
        </section>
        <section class="status" aria-label="Katalog symboli">
          <h2>Katalog źródła</h2>
          <div class="filters">
            <label>Rynek
              <select [value]="market()" (change)="setMarket($event)">
                <option value="all">Wszystkie</option><option value="main">Rynek główny</option><option value="newconnect">NewConnect</option><option value="unclassified">Niesklasyfikowane</option>
              </select>
            </label>
            <label>Notowanie
              <select [value]="listing()" (change)="setListing($event)">
                <option value="all">Wszystkie</option><option value="active">Aktywne</option><option value="delisted">Wycofane</option>
              </select>
            </label>
          </div>
          @if (result.data.rows.length === 0) { <p>Brak rekordów dla wybranych filtrów.</p> }
          @if (result.data.rows.length > 0) {
            <table><thead><tr><th>Symbol</th><th>Nazwa</th><th>Notowanie</th><th>Rynek</th><th>Dowód źródłowy</th></tr></thead>
              <tbody>@for (row of result.data.rows; track row.id) {
                <tr><td>{{ row.provider_symbol }}</td><td>{{ row.display_name || '—' }}</td><td>{{ row.listing_state === 'active' ? 'Aktywne' : 'Wycofane' }}</td><td>{{ row.market_segment === 'unclassified' ? 'Niesklasyfikowany' : row.market_segment === 'main' ? 'Rynek główny' : 'NewConnect' }}</td><td><code>{{ row.identity_evidence_ref }}</code></td></tr>
              }</tbody>
            </table>
          }
          @if (result.page.next_cursor) { <button type="button" (click)="next()">Następna strona</button> }
        </section>
      }
    </section>
  `,
})
export class DataPage implements OnDestroy {
  @ViewChild('confirmDialog') private confirmDialog?: ElementRef<HTMLDialogElement>;
  @ViewChild('refreshTrigger') private refreshTrigger?: ElementRef<HTMLButtonElement>;
  readonly catalog = signal<CatalogResponse | null>(null);
  readonly loading = signal(true);
  readonly error = signal(false);
  readonly market = signal('all');
  readonly listing = signal('all');
  readonly job = signal<ImportJob | null>(null);
  readonly jobBusy = signal(false);
  readonly jobError = signal(false);
  readonly catalogJob = signal<CatalogJob | null>(null);
  readonly catalogBusy = signal(false);
  readonly catalogError = signal(false);
  readonly catalogChanged = signal(false);
  private cursor: string | null = null;
  private requestSequence = 0;
  private catalogTimer: ReturnType<typeof setInterval> | null = null;
  private lastCatalogJobStatus: string | null = null;

  statusLabel(status: string): string {
    return ({ available: 'dostępne', unavailable: 'niedostępne', quota_wait: 'oczekiwanie na limit', empty: 'brak rekordów' } as Record<string, string>)[status] ?? 'nieznany';
  }
  errorLabel(code: string): string {
    return ({ missing_credential: 'brak klucza dostawcy', daily_budget_reached: 'dzienny budżet wyczerpany', provider_rate_limit: 'limit dostawcy', source_unavailable: 'źródło niedostępne', invalid_catalog_payload: 'nieprawidłowa odpowiedź źródła', budget_below_catalog_minimum: 'ustawiony limit nie pozwala pobrać obu list', stale_catalog_part: 'części katalogu są zbyt odległe w czasie' } as Record<string, string>)[code] ?? 'wymaga sprawdzenia';
  }
  classLabel(dataClass: string): string {
    return ({ eod: 'notowania EOD', dividends: 'dywidendy', splits: 'splity' } as Record<string, string>)[dataClass] ?? 'inne dane';
  }

  jobLabel(status: string): string {
    return ({ queued: 'w kolejce', running: 'w trakcie', quota_wait: 'oczekuje na limit', paused: 'wstrzymany', failed: 'nieudany', done: 'zakończony' } as Record<string, string>)[status] ?? 'nieznany';
  }

  constructor() { void this.load(); void this.refreshJob(); void this.refreshCatalogJob(); }

  ngOnDestroy(): void { if (this.catalogTimer) clearInterval(this.catalogTimer); }

  retryReady(utc: string | null): boolean { return !utc || Date.parse(utc) <= Date.now(); }

  async refreshCatalogJob(): Promise<void> {
    try {
      const response = await fetch('/api/catalog-refreshes/latest');
      if (!response.ok) throw new Error('catalog_job_unavailable');
      const next = ((await response.json()) as { data: CatalogJob | null }).data;
      this.catalogJob.set(next);
      this.catalogError.set(false);
      if (next?.status === 'done' && this.lastCatalogJobStatus && this.lastCatalogJobStatus !== 'done') {
        this.cursor = null;
        await this.load();
      }
      this.lastCatalogJobStatus = next?.status ?? null;
      if (next && ['queued', 'running'].includes(next.status)) {
        if (!this.catalogTimer) this.catalogTimer = setInterval(() => void this.refreshCatalogJob(), 5000);
      } else if (this.catalogTimer) { clearInterval(this.catalogTimer); this.catalogTimer = null; }
    } catch { this.catalogError.set(true); }
  }

  startCatalogRefresh(): void {
    const current = this.catalog();
    if (!current || this.catalogBusy() || ['queued', 'running', 'quota_wait'].includes(this.catalogJob()?.status ?? '')) return;
    if (current.data.count > 0) this.confirmDialog?.nativeElement.showModal();
    else void this.queueCatalogRefresh(false);
  }

  cancelCatalogRefresh(): void {
    this.confirmDialog?.nativeElement.close();
    this.refreshTrigger?.nativeElement.focus();
  }

  async confirmCatalogRefresh(): Promise<void> {
    this.confirmDialog?.nativeElement.close();
    this.refreshTrigger?.nativeElement.focus();
    await this.queueCatalogRefresh(true);
  }

  private async catalogPost(url: string, payload: unknown): Promise<Response> {
    const session = await fetch('/api/session');
    if (!session.ok) throw new Error('session_unavailable');
    const token = ((await session.json()) as { data: { csrf_token: string } }).data.csrf_token;
    return fetch(url, { method: 'POST', credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json', 'X-Lesine-CSRF': token }, body: JSON.stringify(payload) });
  }

  private async queueCatalogRefresh(replaceExisting: boolean): Promise<void> {
    const expected = this.catalog()?.data.current_catalog_id ?? null;
    this.catalogBusy.set(true);
    this.catalogError.set(false);
    this.catalogChanged.set(false);
    try {
      const response = await this.catalogPost('/api/catalog-refreshes', { expected_catalog_id: expected, replace_existing: replaceExisting });
      if (response.status === 409) { this.cursor = null; await this.load(); this.catalogChanged.set(true); return; }
      if (!response.ok) throw new Error('refresh_failed');
      await this.refreshCatalogJob();
    } catch { this.catalogError.set(true); }
    finally { this.catalogBusy.set(false); }
  }

  async resumeCatalogRefresh(): Promise<void> {
    const current = this.catalogJob();
    if (!current || !['failed', 'quota_wait'].includes(current.status)) return;
    this.catalogBusy.set(true);
    this.catalogError.set(false);
    try {
      const response = await this.catalogPost(`/api/catalog-refreshes/${current.id}/resume`, {});
      if (!response.ok) throw new Error('resume_failed');
      await this.refreshCatalogJob();
    } catch { this.catalogError.set(true); }
    finally { this.catalogBusy.set(false); }
  }

  async refreshJob(): Promise<void> {
    try {
      const response = await fetch('/api/import-jobs');
      if (!response.ok) throw new Error('job_unavailable');
      this.job.set(((await response.json()) as { data: ImportJob | null }).data);
      this.jobError.set(false);
    } catch { this.jobError.set(true); }
  }

  private async mutateJob(url: string, payload: unknown): Promise<void> {
    this.jobBusy.set(true);
    this.jobError.set(false);
    try {
      const session = await fetch('/api/session');
      if (!session.ok) throw new Error('session_unavailable');
      const token = ((await session.json()) as { data: { csrf_token: string } }).data.csrf_token;
      const response = await fetch(url, { method: 'POST', credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json', 'X-Lesine-CSRF': token }, body: JSON.stringify(payload) });
      if (!response.ok) throw new Error('job_mutation_failed');
      await this.refreshJob();
    } catch { this.jobError.set(true); }
    finally { this.jobBusy.set(false); }
  }

  async startImport(): Promise<void> {
    const to = new Date();
    const from = new Date(to);
    from.setUTCFullYear(from.getUTCFullYear() - 1);
    await this.mutateJob('/api/import-jobs', { provider: 'eodhd', market_scope: 'all', data_classes: ['daily_bars'],
      mode: 'incremental', from_date: from.toISOString().slice(0, 10), to_date: to.toISOString().slice(0, 10) });
  }

  async resumeImport(): Promise<void> {
    const current = this.job();
    if (current) await this.mutateJob(`/api/import-jobs/${current.id}/resume`, {});
  }

  setMarket(event: Event): void { this.market.set((event.target as HTMLSelectElement).value); this.cursor = null; void this.load(); }
  setListing(event: Event): void { this.listing.set((event.target as HTMLSelectElement).value); this.cursor = null; void this.load(); }
  next(): void { this.cursor = this.catalog()?.page.next_cursor ?? null; void this.load(); }

  private async load(): Promise<void> {
    const sequence = ++this.requestSequence;
    this.loading.set(true);
    this.error.set(false);
    try {
      const params = new URLSearchParams({ market: this.market(), listing: this.listing() });
      if (this.cursor) {
        params.set('after', this.cursor);
        const catalogId = this.catalog()?.data.current_catalog_id;
        if (catalogId) params.set('catalog_id', catalogId);
      }
      const response = await fetch(`/api/catalog?${params.toString()}`);
      if (response.status === 409 && this.cursor) { this.cursor = null; void this.load(); return; }
      if (!response.ok) throw new Error('catalog_unavailable');
      const catalog = await response.json() as CatalogResponse;
      if (sequence === this.requestSequence) this.catalog.set(catalog);
    } catch { if (sequence === this.requestSequence) this.error.set(true); }
    finally { if (sequence === this.requestSequence) this.loading.set(false); }
  }
}
