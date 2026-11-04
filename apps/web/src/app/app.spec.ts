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
});
