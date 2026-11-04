import { TestBed } from '@angular/core/testing';
import { App } from './app';
import { DataPage } from './data';
import { provideRouter } from '@angular/router';

describe('App', () => {
  it('shows the application navigation', async () => {
    TestBed.configureTestingModule({ providers: [provideRouter([])] });
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('Dane');
  });

  it('shows an honest empty catalog state', async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async () => new Response(JSON.stringify({ data: { status: 'empty', expected_scope_status: 'unknown', rights_status: 'unverified', checked_at: null, count: 0, rows: [], sample: [], depth_sample: [] }, page: { next_cursor: null } }), { status: 200 });
    try {
      const fixture = TestBed.createComponent(DataPage);
      await fixture.whenStable();
      fixture.detectChanges();
      expect((fixture.nativeElement as HTMLElement).textContent).toContain('Brak pobranych danych');
      expect((fixture.nativeElement as HTMLElement).textContent).toContain('nieznany');
    } finally { globalThis.fetch = originalFetch; }
  });

  it('shows import progress without claiming the archive is complete', async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async (input) => String(input).startsWith('/api/import-jobs')
      ? new Response(JSON.stringify({ data: { id: 'fixture', status: 'quota_wait', completed_chunks: 1,
          total_chunks: 3, cursor: 'opaque', error_code: 'daily_budget_reached', retry_after_utc: null,
          updated_at: '2026-11-04T20:00:00Z' } }))
      : new Response(JSON.stringify({ data: { status: 'empty', expected_scope_status: 'unknown', rights_status: 'unverified',
          checked_at: null, count: 0, rows: [], sample: [], depth_sample: [] }, page: { next_cursor: null } }));
    try {
      const fixture = TestBed.createComponent(DataPage);
      await fixture.whenStable();
      fixture.detectChanges();
      const content = (fixture.nativeElement as HTMLElement).textContent ?? '';
      expect(content).toContain('Ukończono 1 z 3 części');
      expect(content).toContain('dzienny budżet wyczerpany');
      expect(content).toContain('Kompletność historycznych notowań nie została jeszcze potwierdzona');
    } finally { globalThis.fetch = originalFetch; }
  });

  it('keeps the newest filter result when an older response arrives later', async () => {
    const originalFetch = globalThis.fetch;
    const pending: ((value: Response) => void)[] = [];
    globalThis.fetch = async (input) => String(input).startsWith('/api/import-jobs')
      ? new Response(JSON.stringify({ data: null }), { status: 200 })
      : new Promise<Response>((resolve) => pending.push(resolve));
    try {
      const page = new DataPage();
      page.setListing({ target: { value: 'delisted' } } as unknown as Event);
      const result = (status: string) => new Response(JSON.stringify({ data: { status, expected_scope_status: 'unknown', rights_status: 'unverified', checked_at: null, count: 0, rows: [], sample: [], depth_sample: [] }, page: { next_cursor: null } }), { status: 200 });
      pending[1](result('unavailable'));
      await new Promise((resolve) => setTimeout(resolve, 0));
      pending[0](result('empty'));
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(page.catalog()?.data.status).toBe('unavailable');
    } finally { globalThis.fetch = originalFetch; }
  });
});
