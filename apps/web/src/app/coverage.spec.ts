import { TestBed } from '@angular/core/testing';
import { CoverageSection } from './coverage';

const report = (rows: unknown[] = []) => ({ data: {
  report_id: 'report-1', created_at: '2026-11-05T12:00:00Z', archive_last_committed_at: '2026-11-04T18:00:00Z',
  refresh_status: 'fresh', refresh_error_code: null, catalog_id: null, expected_scope_status: 'unknown',
  summary: { expected: null, provider_available: null, acquired: 1, gaps: null },
  scope: { market: 'all', listing: 'all', status: 'all', source: 'eodhd', data_class: 'daily_bars' }, rows,
}, page: { next_cursor: null } });

describe('CoverageSection', () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => localStorage.clear());

  it('shows unknown scope, acquired dates and keyboard-operable gap details', async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async () => new Response(JSON.stringify(report([{
      source_symbol_id: 'identity-1', provider_symbol: 'ABC.WAR', market_segment: 'unclassified',
      listing: 'delisted', in_current_catalog: false, source: 'eodhd', data_class: 'daily_bars',
      expected_from: null, expected_to: null, provider_from: null, provider_to: null,
      acquired_from: '2026-01-02', acquired_to: '2026-11-04', status: 'unclassified',
      findings: [{ from_date: null, to_date: null, reason_code: 'expected_scope_unknown', evidence_ref: null, evidence_checked_at: null }],
    }])));
    try {
      const fixture = TestBed.createComponent(CoverageSection);
      await fixture.whenStable(); fixture.detectChanges();
      const element = fixture.nativeElement as HTMLElement;
      expect(element.textContent).toContain('Oczekiwany zakres rynku jest nieznany');
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
      expect(localStorage.getItem('lesine-eod-coverage-v1')).toBeTruthy();
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

  it('clears cached market content after local access is denied', async () => {
    const originalFetch = globalThis.fetch;
    localStorage.setItem('lesine-eod-coverage-v1', JSON.stringify({ version: 1,
      saved_at: new Date().toISOString(), response: report() }));
    globalThis.fetch = async () => new Response(null, { status: 403 });
    try {
      const fixture = TestBed.createComponent(CoverageSection);
      await fixture.whenStable(); fixture.detectChanges();
      expect(localStorage.getItem('lesine-eod-coverage-v1')).toBeNull();
      expect((fixture.nativeElement as HTMLElement).textContent).not.toContain('Raport obliczony');
      expect((fixture.nativeElement as HTMLElement).textContent).toContain('Brak dostępu do raportu');
      fixture.destroy();
    } finally { globalThis.fetch = originalFetch; }
  });
});
