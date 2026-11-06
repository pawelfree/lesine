import { TestBed } from '@angular/core/testing';
import { App } from './app';
import { DataPage, recentEodWindow } from './data';
import { provideRouter } from '@angular/router';

describe('App', () => {
  it('plans a fresh Free window without requesting the unfinished current day', () => {
    expect(recentEodWindow(new Date('2026-11-06T06:30:00Z'))).toEqual({
      from_date: '2025-11-06', to_date: '2026-11-05',
    });
  });
  it('shows the application navigation', async () => {
    TestBed.configureTestingModule({ providers: [provideRouter([])] });
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('Dane');
  });

  it('shows an honest empty catalog state', async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async () => new Response(JSON.stringify({ data: { status: 'empty', rights_status: 'unverified', checked_at: null, count: 0, rows: [], sample: [], depth_sample: [] }, page: { next_cursor: null } }), { status: 200 });
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
    globalThis.fetch = async (input) => String(input).startsWith('/api/import-jobs') || String(input).startsWith('/api/catalog-refreshes')
      ? new Response(JSON.stringify({ data: { id: 'fixture', status: 'quota_wait', completed_chunks: 1,
          total_chunks: 3, cursor: 'opaque', error_code: 'daily_budget_reached', retry_after_utc: null,
          updated_at: '2026-11-04T20:00:00Z' } }))
      : new Response(JSON.stringify({ data: { status: 'empty', rights_status: 'unverified',
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
    globalThis.fetch = async (input) => String(input).startsWith('/api/import-jobs') || String(input).startsWith('/api/catalog-refreshes')
      ? new Response(JSON.stringify({ data: null }), { status: 200 })
      : new Promise<Response>((resolve) => pending.push(resolve));
    try {
      const page = new DataPage();
      page.setListing({ target: { value: 'delisted' } } as unknown as Event);
      const result = (status: string) => new Response(JSON.stringify({ data: { status, rights_status: 'unverified', checked_at: null, count: 0, rows: [], sample: [], depth_sample: [] }, page: { next_cursor: null } }), { status: 200 });
      pending[1](result('unavailable'));
      await new Promise((resolve) => setTimeout(resolve, 0));
      pending[0](result('empty'));
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(page.catalog()?.data.status).toBe('unavailable');
    } finally { globalThis.fetch = originalFetch; }
  });

  it('queues an empty catalog directly without a confirmation', async () => {
    const originalFetch = globalThis.fetch;
    const posts: { url: string; body: unknown }[] = [];
    globalThis.fetch = async (input, init) => {
      const url = String(input);
      if (url === '/api/session') return new Response(JSON.stringify({ data: { csrf_token: 'fixture' } }));
      if (url === '/api/catalog-refreshes' && init?.method === 'POST') {
        posts.push({ url, body: JSON.parse(String(init.body)) });
        return new Response(JSON.stringify({ data: { id: 'job', status: 'queued' } }), { status: 202 });
      }
      if (url === '/api/catalog-refreshes/latest' || url === '/api/import-jobs')
        return new Response(JSON.stringify({ data: null }));
      return new Response(JSON.stringify({ data: { status: 'empty', count: 0, rows: [], sample: [],
        depth_sample: [], current_catalog_id: null, catalog_origin: null }, page: { next_cursor: null } }));
    };
    try {
      const fixture = TestBed.createComponent(DataPage);
      await fixture.whenStable();
      fixture.detectChanges();
      const button = [...(fixture.nativeElement as HTMLElement).querySelectorAll('button')]
        .find((item) => item.textContent?.includes('Pobierz katalog spółek'));
      button?.click();
      await fixture.whenStable();
      expect(posts).toEqual([{ url: '/api/catalog-refreshes',
        body: { expected_catalog_id: null, replace_existing: false } }]);
      fixture.destroy();
    } finally { globalThis.fetch = originalFetch; }
  });

  it('requires explicit confirmation to replace a visible catalog', async () => {
    const originalFetch = globalThis.fetch;
    const posts: unknown[] = [];
    const catalogId = '42a85758-e45b-465f-b141-ac0302bd09c2';
    globalThis.fetch = async (input, init) => {
      const url = String(input);
      if (url === '/api/session') return new Response(JSON.stringify({ data: { csrf_token: 'fixture' } }));
      if (url === '/api/catalog-refreshes' && init?.method === 'POST') {
        posts.push(JSON.parse(String(init.body)));
        return new Response(JSON.stringify({ data: { id: 'job', status: 'queued' } }), { status: 202 });
      }
      if (url === '/api/catalog-refreshes/latest' || url === '/api/import-jobs')
        return new Response(JSON.stringify({ data: null }));
      return new Response(JSON.stringify({ data: { status: 'available', count: 3, rows: [], sample: [],
        depth_sample: [], current_catalog_id: catalogId, catalog_origin: 'eodhd_war_pair' }, page: { next_cursor: null } }));
    };
    try {
      const fixture = TestBed.createComponent(DataPage);
      await fixture.whenStable();
      fixture.detectChanges();
      const dialog = (fixture.nativeElement as HTMLElement).querySelector('dialog')!;
      let opened = false;
      dialog.showModal = () => { opened = true; };
      dialog.close = () => { opened = false; };
      const start = [...(fixture.nativeElement as HTMLElement).querySelectorAll('button')]
        .find((item) => item.textContent?.includes('Pobierz katalog ponownie'))!;
      start.click();
      expect(opened).toBe(true);
      expect(posts.length).toBe(0);
      fixture.componentInstance.cancelCatalogRefresh();
      expect(posts.length).toBe(0);
      start.click();
      await fixture.componentInstance.confirmCatalogRefresh();
      expect(posts).toEqual([{ expected_catalog_id: catalogId, replace_existing: true }]);
      fixture.destroy();
    } finally { globalThis.fetch = originalFetch; }
  });

  it('keeps the newest catalog job status when an older poll finishes later', async () => {
    const originalFetch = globalThis.fetch;
    const pending: ((value: Response) => void)[] = [];
    globalThis.fetch = async (input) => String(input) === '/api/catalog-refreshes/latest'
      ? new Promise<Response>((resolve) => pending.push(resolve))
      : new Response(JSON.stringify({ data: { status: 'empty', count: 0, rows: [], sample: [],
          depth_sample: [], current_catalog_id: null, catalog_origin: null }, page: { next_cursor: null } }));
    try {
      const page = new DataPage();
      const newer = page.refreshCatalogJob();
      const result = (status: string) => new Response(JSON.stringify({ data: { id: 'job', status,
        active_saved: false, delisted_saved: false, error_code: null, retry_after_utc: null,
        updated_at: '2026-11-05T09:00:00Z' } }));
      pending[1](result('done'));
      await newer;
      pending[0](result('queued'));
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(page.catalogJob()?.status).toBe('done');
      page.ngOnDestroy();
    } finally { globalThis.fetch = originalFetch; }
  });
});
