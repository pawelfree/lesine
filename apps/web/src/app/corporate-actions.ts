import { Component, OnDestroy, signal } from '@angular/core';

type ActionKind = 'dividends' | 'splits';
type Action = { event_key: string; revision_id: string; source_symbol_id: string;
  provider_symbol: string; data_class: ActionKind;
  ex_date: string; state: 'active' | 'withdrawn'; ambiguous: boolean; amount: string | null;
  adjusted_amount: string | null; currency: string | null; split_numerator: string | null;
  split_denominator: string | null; first_seen_at: string; availability_evidence: string;
  source_file_sha256: string; has_older_revisions: boolean };
type ActionPage = { data: { rows: Action[] }; page: { next_cursor: string | null } };
type ImportJob = { status: string; completed_chunks: number; total_chunks: number;
  error_code: string | null; retry_after_utc: string | null; updated_at: string };
type History = { loading: boolean; error: boolean; rows: Action[]; next_cursor: string | null };

function isActionPage(value: unknown): value is ActionPage {
  if (!value || typeof value !== 'object') return false;
  const item = value as { data?: { rows?: unknown }; page?: { next_cursor?: unknown } };
  return Array.isArray(item.data?.rows) && !!item.page &&
    (item.page.next_cursor === null || typeof item.page.next_cursor === 'string');
}

@Component({
  selector: 'app-corporate-actions',
  styles: [`
    .action-filters { display: flex; flex-wrap: wrap; gap: 0.75rem; margin: 1rem 0; align-items: end; }
    .action-filters label { display: grid; gap: 0.3rem; min-width: 9rem; }
    .action-filters input, .action-filters select { padding: 0.5rem; }
    .action-table { overflow-x: auto; }
    .action-table table { min-width: 48rem; }
    .hash { overflow-wrap: anywhere; font-size: 0.8rem; }
    .history { margin: 0.5rem 0; }
    .history li { margin: 0.35rem 0; }
  `],
  template: `
    <section class="status" aria-label="Działania korporacyjne">
      <h2>Działania korporacyjne</h2>
      <p>Zapisane lokalnie dywidendy i splity. Data zdarzenia ani pierwszy lokalny zapis nie potwierdzają historycznej daty publikacji. Brak rekordu nie oznacza braku zdarzenia u dostawcy.</p>
      <form class="action-filters" (submit)="applyFilters($event)">
        <label>Typ danych
          <select [value]="kind()" (change)="changeKind($event)">
            <option value="dividends">Dywidendy</option><option value="splits">Splity</option>
          </select>
        </label>
        <label>Symbol dostawcy
          <input type="text" maxlength="32" [value]="symbol()" (input)="symbol.set(inputValue($event))" placeholder="np. PKO.WAR">
        </label>
        <label>Od daty zdarzenia
          <input type="date" [value]="fromDate()" (change)="fromDate.set(inputValue($event))">
        </label>
        <label>Do daty zdarzenia
          <input type="date" [value]="toDate()" (change)="toDate.set(inputValue($event))">
        </label>
        <button type="submit">Pokaż zapisane zdarzenia</button>
      </form>
      @if (filterError()) { <p role="alert">{{ filterError() }}</p> }
      @if (job(); as currentJob) {
        <p role="status">Import {{ kindLabel() }}: {{ jobLabel(currentJob.status) }}. Ukończono {{ currentJob.completed_chunks }} z {{ currentJob.total_chunks }} części.</p>
        <p>Ostatnia aktualizacja: {{ currentJob.updated_at }}</p>
        @if (currentJob.error_code) { <p role="alert">Przyczyna: {{ errorLabel(currentJob.error_code) }}. Zapisane zdarzenia pozostają dostępne.</p> }
        @if (currentJob.retry_after_utc) { <p>Możliwa kolejna próba: {{ currentJob.retry_after_utc }}</p> }
      } @else if (!jobLoading() && !jobError()) { <p>Nie uruchomiono jeszcze importu {{ kindLabel() }}.</p> }
      @if (jobLoading()) { <p role="status">Wczytywanie stanu importu…</p> }
      @if (jobError()) { <p role="alert">Nie udało się odczytać stanu importu {{ kindLabel() }}.</p> }
      <button type="button" (click)="refresh()">Odśwież działania i stan importu</button>
      @if (loading()) { <p role="status">Wczytywanie działań korporacyjnych…</p> }
      @if (error()) { <p role="alert">Nie udało się odczytać działań korporacyjnych lub ich archiwum. Zapisane dane nie zostały usunięte.</p> }
      @if (!loading() && !error() && page(); as currentPage) {
        @if (currentPage.data.rows.length === 0) { <p role="status">Brak lokalnie zapisanych zdarzeń dla tych filtrów.</p> }
        @if (currentPage.data.rows.length > 0) {
          <div class="action-table"><table>
            <thead><tr><th scope="col">Symbol</th><th scope="col">Typ / data</th><th scope="col">Stan / wartość</th><th scope="col">Pierwszy lokalny zapis</th><th scope="col">Dowód i rewizje</th></tr></thead>
            <tbody>@for (action of currentPage.data.rows; track action.revision_id) {
              <tr>
                <td>{{ action.provider_symbol }}</td>
                <td>{{ action.data_class === 'dividends' ? 'Dywidenda' : 'Split' }}<br>{{ action.ex_date }}</td>
                <td>{{ action.state === 'withdrawn' ? 'Wycofane' : 'Aktywne' }}; {{ actionValue(action) }} @if (action.ambiguous) { <strong>Niejednoznaczne</strong> }</td>
                <td>{{ action.first_seen_at }}</td>
                <td><code class="hash">{{ action.source_file_sha256 }}</code>
                  <p>Dowód dostępności: {{ availabilityLabel(action.availability_evidence) }}</p>
                  @if (action.has_older_revisions) {
                    <details (toggle)="toggleHistory($event, action)">
                      <summary>Historia rewizji</summary>
                      @if (history()[historyKey(action)]; as revisions) {
                        @if (revisions.loading) { <p role="status">Wczytywanie rewizji…</p> }
                        @if (revisions.error) { <p role="alert">Nie udało się odczytać historii lub dowodu źródłowego.</p> }
                        @if (revisions.rows.length) {
                          <ol class="history">@for (revision of revisions.rows; track revision.revision_id) {
                            <li>{{ revision.first_seen_at }}: {{ revision.state === 'withdrawn' ? 'wycofane' : actionValue(revision) }}; ID {{ revision.revision_id }}; dowód <code class="hash">{{ revision.source_file_sha256 }}</code></li>
                          }</ol>
                        }
                        @if (revisions.next_cursor && !revisions.loading) {
                          <button type="button" (click)="nextHistory(action)">Więcej rewizji</button>
                        }
                      }
                    </details>
                  }
                </td>
              </tr>
            }</tbody>
          </table></div>
        }
        @if (currentPage.page.next_cursor) {
          <button type="button" (click)="nextPage()">Następna strona działań</button>
        }
      }
    </section>
  `,
})
export class CorporateActionsSection implements OnDestroy {
  readonly kind = signal<ActionKind>('dividends');
  readonly symbol = signal('');
  readonly fromDate = signal('');
  readonly toDate = signal('');
  readonly filterError = signal('');
  readonly page = signal<ActionPage | null>(null);
  readonly loading = signal(true);
  readonly error = signal(false);
  readonly job = signal<ImportJob | null>(null);
  readonly jobLoading = signal(true);
  readonly jobError = signal(false);
  readonly history = signal<Record<string, History>>({});
  private cursor: string | null = null;
  private requestSequence = 0;
  private jobSequence = 0;
  private historyGeneration = 0;

  constructor() { void this.load(); void this.loadJob(); }
  ngOnDestroy(): void { this.requestSequence++; this.jobSequence++; this.historyGeneration++; }

  inputValue(event: Event): string { return (event.target as HTMLInputElement).value; }
  kindLabel(): string { return this.kind() === 'dividends' ? 'dywidend' : 'splitów'; }
  jobLabel(status: string): string {
    return ({ queued: 'w kolejce', running: 'w trakcie', quota_wait: 'oczekuje na limit',
      paused: 'wstrzymany', failed: 'nieudany', done: 'zakończony' } as Record<string, string>)[status] ?? 'nieznany';
  }
  errorLabel(code: string): string {
    return ({ missing_credential: 'brak klucza dostawcy', daily_budget_reached: 'dzienny budżet wyczerpany',
      provider_rate_limit: 'limit dostawcy', provider_forbidden: 'brak uprawnień u dostawcy',
      source_unavailable: 'źródło niedostępne', network_error: 'błąd sieci' } as Record<string, string>)[code] ?? code;
  }
  availabilityLabel(value: string): string {
    return ({ first_import: 'pierwszy lokalny import', ex_date_only: 'tylko data zdarzenia',
      declaration_date_only: 'tylko data deklaracji' } as Record<string, string>)[value] ?? value;
  }
  actionValue(action: Action): string {
    if (action.state === 'withdrawn') return 'zdarzenie wycofane';
    if (action.data_class === 'splits') return `${action.split_numerator ?? '?'}:${action.split_denominator ?? '?'}`;
    return `${action.amount ?? action.adjusted_amount ?? '?'} ${action.currency ?? ''}`.trim();
  }

  changeKind(event: Event): void {
    const value = (event.target as HTMLSelectElement).value;
    if (value !== 'dividends' && value !== 'splits') return;
    this.kind.set(value);
    this.cursor = null;
    this.historyGeneration++;
    this.history.set({});
    void this.load(); void this.loadJob();
  }

  applyFilters(event: Event): void {
    event.preventDefault();
    const symbol = this.symbol().trim().toUpperCase();
    if ((symbol && !/^[A-Z0-9.^-]{1,32}$/.test(symbol)) ||
      (this.fromDate() && this.toDate() && this.fromDate() > this.toDate())) {
      this.filterError.set('Sprawdź symbol i przedział dat.');
      return;
    }
    this.symbol.set(symbol);
    this.filterError.set('');
    this.cursor = null;
    this.historyGeneration++;
    this.history.set({});
    void this.load();
  }

  refresh(): void { void this.load(); void this.loadJob(); }
  nextPage(): void {
    const next = this.page()?.page.next_cursor;
    if (!next) return;
    this.cursor = next;
    this.historyGeneration++;
    this.history.set({});
    void this.load();
  }

  historyKey(action: Action): string { return `${action.source_symbol_id}:${action.event_key}`; }
  async toggleHistory(event: Event, action: Action): Promise<void> {
    if (!(event.target as HTMLDetailsElement).open || this.history()[this.historyKey(action)]) return;
    await this.loadHistory(action, null);
  }
  async nextHistory(action: Action): Promise<void> {
    const key = this.historyKey(action);
    if (this.history()[key]?.loading) return;
    const cursor = this.history()[key]?.next_cursor;
    if (cursor) await this.loadHistory(action, cursor);
  }
  private async loadHistory(action: Action, cursor: string | null): Promise<void> {
    const key = this.historyKey(action);
    const generation = this.historyGeneration;
    const previous = this.history()[key];
    this.history.update((all) => ({ ...all, [key]: { loading: true, error: false,
      rows: previous?.rows ?? [], next_cursor: cursor } }));
    try {
      const params = new URLSearchParams({ source_symbol_id: action.source_symbol_id });
      if (cursor) params.set('cursor', cursor);
      const path = `/api/corporate-actions/${action.event_key}/revisions?${params.toString()}`;
      const response = await fetch(path);
      if (!response.ok) throw new Error('history_unavailable');
      const page: unknown = await response.json();
      if (!isActionPage(page)) throw new Error('invalid_history_response');
      if (generation !== this.historyGeneration) return;
      this.history.update((all) => ({ ...all, [key]: { loading: false, error: false,
        rows: [...(cursor ? previous?.rows ?? [] : []), ...page.data.rows], next_cursor: page.page.next_cursor } }));
    } catch {
      if (generation === this.historyGeneration) this.history.update((all) => ({ ...all,
        [key]: { loading: false, error: true, rows: previous?.rows ?? [], next_cursor: cursor } }));
    }
  }

  private async load(): Promise<void> {
    const sequence = ++this.requestSequence;
    this.loading.set(true); this.error.set(false);
    const params = new URLSearchParams({ data_class: this.kind() });
    if (this.symbol()) params.set('provider_symbol', this.symbol());
    if (this.fromDate()) params.set('from_date', this.fromDate());
    if (this.toDate()) params.set('to_date', this.toDate());
    if (this.cursor) params.set('cursor', this.cursor);
    try {
      const response = await fetch(`/api/corporate-actions?${params.toString()}`);
      if (!response.ok) throw new Error('actions_unavailable');
      const result: unknown = await response.json();
      if (!isActionPage(result)) throw new Error('invalid_actions_response');
      if (sequence === this.requestSequence) this.page.set(result);
    } catch { if (sequence === this.requestSequence) this.error.set(true); }
    finally { if (sequence === this.requestSequence) this.loading.set(false); }
  }

  private async loadJob(): Promise<void> {
    const sequence = ++this.jobSequence;
    this.jobLoading.set(true); this.jobError.set(false);
    try {
      const response = await fetch(`/api/import-jobs?data_class=${this.kind()}`);
      if (!response.ok) throw new Error('job_unavailable');
      const data = (await response.json()) as { data: ImportJob | null };
      if (sequence === this.jobSequence) this.job.set(data.data);
    } catch { if (sequence === this.jobSequence) this.jobError.set(true); }
    finally { if (sequence === this.jobSequence) this.jobLoading.set(false); }
  }
}
