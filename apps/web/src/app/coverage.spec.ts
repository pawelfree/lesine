import { TestBed } from '@angular/core/testing';
import { CoverageSection } from './coverage';

const report = (rows: unknown[] = []) => ({ data: {
  report_id: 'report-1', created_at: '2026-11-05T12:00:00Z', archive_last_committed_at: '2026-11-04T18:00:00Z',
  refresh_status: 'fresh', refresh_error_code: null, catalog_id: null,
  summary: { acquired: 1 },
  scope: { market: 'all', listing: 'all', status: 'all', source: 'eodhd', data_class: 'daily_bars' }, rows,
}, page: { next_cursor: null } });

describe('CoverageSection', () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => localStorage.clear());

  it('shows acquired dates and keyboard-operable import details', async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async () => new Response(JSON.stringify(report([{
      source_symbol_id: 'identity-1', provider_symbol: 'ABC.WAR', market_segment: 'unclassified',
      listing: 'delisted', in_current_catalog: false, source: 'eodhd', data_class: 'daily_bars',
      acquired_from: '2026-01-02', acquired_to: '2026-11-04', status: 'unclassified',
      findings: [{ from_date: null, to_date: null, reason_code: 'import_request_unfinished', evidence_ref: null, evidence_checked_at: null }],
    }])));
    try {
      const fixture = TestBed.createComponent(CoverageSection);
      await fixture.whenStable(); fixture.detectChanges();
      const element = fixture.nativeElement as HTMLElement;
      expect(element.textContent).toContain('Nie potwierdza kompletności historii GPW');
      expect(element.textContent).not.toContain('Oczekiwane');
      expect(element.textContent).not.toContain('Dostępne u dostawcy');
      expect(element.textContent).not.toContain('Potwierdzone luki');
      expect(Array.from(element.querySelectorAll('.filters option')).some((option) => option.textContent === 'Kompletny')).toBe(false);
      expect(element.textContent).toContain('2026-01-02 – 2026-11-04');
      expect(element.textContent).toContain('poza bieżącym katalogiem');
      expect(element.querySelector('details summary')?.textContent).toContain('Powody i dowody');
      expect(element.querySelectorAll('.filters select').length).toBe(5);
      fixture.destroy();
    } finally { globalThis.fetch = originalFetch; }
  });

  it('retains a dated cached report after an API outage and never applies offline filters silently', async () => {
    const originalFetch = globalThis.fetch;
    const filtered = report();
    filtered.data.scope.listing = 'delisted';
    globalThis.fetch = async () => new Response(JSON.stringify(filtered));
    try {
      const first = TestBed.createComponent(CoverageSection);
      await first.whenStable(); first.destroy();
      expect(localStorage.getItem('lesine-eod-coverage-v3')).toBeTruthy();
      globalThis.fetch = async () => { throw new Error('offline'); };
      const second = TestBed.createComponent(CoverageSection);
      await second.whenStable(); second.detectChanges();
      const element = second.nativeElement as HTMLElement;
      expect(element.textContent).toContain('Widok z pamięci przeglądarki');
      expect(element.textContent).toContain('filtry dotyczą zapisanego widoku');
      expect((element.querySelectorAll('.filters select')[3] as HTMLSelectElement).value).toBe('delisted');
      second.destroy();
    } finally { globalThis.fetch = originalFetch; }
  });

  it('shows the saved first page and labels previous filters when connectivity fails after a filter change', async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async () => new Response(JSON.stringify(report([{
      source_symbol_id: 'identity-1', provider_symbol: 'ABC.WAR', market_segment: 'main',
      listing: 'active', in_current_catalog: true, source: 'eodhd', data_class: 'daily_bars',
      acquired_from: null, acquired_to: null, status: 'unknown', findings: [],
    }])));
    try {
      const fixture = TestBed.createComponent(CoverageSection);
      await fixture.whenStable(); fixture.detectChanges();
      expect(fixture.nativeElement.querySelector('details')).toBeNull();
      globalThis.fetch = async () => { throw new Error('offline'); };
      const listing = fixture.nativeElement.querySelectorAll('.filters select')[3] as HTMLSelectElement;
      listing.value = 'delisted'; listing.dispatchEvent(new Event('change'));
      await fixture.whenStable(); fixture.detectChanges();
      const element = fixture.nativeElement as HTMLElement;
      expect(listing.value).toBe('delisted');
      expect(element.textContent).toContain('ABC.WAR');
      expect(element.textContent).toContain('Widok z pamięci przeglądarki');
      expect(element.textContent).toContain('Wybrane teraz filtry nie zostały zastosowane');
      expect(fixture.componentInstance.result()?.data.scope.listing).toBe('all');
      fixture.destroy();
    } finally { globalThis.fetch = originalFetch; }
  });

  it('ignores an old access denial after a newer filtered request succeeds', async () => {
    const originalFetch = globalThis.fetch;
    let resolveOld: ((response: Response) => void) | undefined;
    globalThis.fetch = () => new Promise<Response>((resolve) => { resolveOld = resolve; });
    try {
      const fixture = TestBed.createComponent(CoverageSection);
      const oldRequest = resolveOld;
      globalThis.fetch = async () => new Response(JSON.stringify(report()));
      fixture.componentInstance.changeFilter('listing', { target: { value: 'delisted' } } as unknown as Event);
      await Promise.resolve();
      oldRequest?.(new Response(null, { status: 403 }));
      await fixture.whenStable(); fixture.detectChanges();
      expect(fixture.componentInstance.result()?.data.report_id).toBe('report-1');
      expect(fixture.componentInstance.accessDenied()).toBe(false);
      expect(localStorage.getItem('lesine-eod-coverage-v3')).toBeTruthy();
      fixture.destroy();
    } finally { globalThis.fetch = originalFetch; }
  });

  it('removes structurally invalid or undated browser cache before rendering', async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async () => { throw new Error('offline'); };
    try {
      const incomplete = report() as { data: Record<string, unknown>; page: { next_cursor: null } };
      delete incomplete.data['summary'];
      for (const value of [
        { version: 1, saved_at: new Date().toISOString(), response: incomplete },
        { version: 1, saved_at: 'invalid-date', response: report() },
      ]) {
        localStorage.setItem('lesine-eod-coverage-v3', JSON.stringify(value));
        const fixture = TestBed.createComponent(CoverageSection);
        await fixture.whenStable(); fixture.detectChanges();
        expect(localStorage.getItem('lesine-eod-coverage-v3')).toBeNull();
        expect(fixture.componentInstance.result()).toBeNull();
        fixture.destroy();
      }
    } finally { globalThis.fetch = originalFetch; }
  });

  it('clears cached market content after local access is denied', async () => {
    const originalFetch = globalThis.fetch;
    localStorage.setItem('lesine-eod-coverage-v3', JSON.stringify({ version: 1,
      saved_at: new Date().toISOString(), response: report() }));
    globalThis.fetch = async () => new Response(null, { status: 403 });
    try {
      const fixture = TestBed.createComponent(CoverageSection);
      await fixture.whenStable(); fixture.detectChanges();
      expect(localStorage.getItem('lesine-eod-coverage-v3')).toBeNull();
      expect((fixture.nativeElement as HTMLElement).textContent).not.toContain('Raport obliczony');
      expect((fixture.nativeElement as HTMLElement).textContent).toContain('Brak dostępu do raportu');
      fixture.destroy();
    } finally { globalThis.fetch = originalFetch; }
  });
});
