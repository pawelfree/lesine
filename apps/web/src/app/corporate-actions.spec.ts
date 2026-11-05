import { TestBed } from '@angular/core/testing';
import { CorporateActionsSection } from './corporate-actions';

const action = { event_key: 'a'.repeat(64), revision_id: 'revision-2', source_symbol_id: '1'.repeat(64),
  provider_symbol: 'TEST.WAR',
  data_class: 'dividends', ex_date: '2026-05-01', state: 'withdrawn', ambiguous: false,
  amount: null, adjusted_amount: null, currency: 'PLN', split_numerator: null,
  split_denominator: null, first_seen_at: '2026-06-02T00:00:00Z',
  availability_evidence: 'first_import', source_file_sha256: 'b'.repeat(64),
  has_older_revisions: true };
const page = (rows: unknown[], next_cursor: string | null = null) =>
  ({ data: { rows }, page: { next_cursor } });

describe('CorporateActionsSection', () => {
  it('shows retained withdrawal, quota status, and the older revision with source evidence', async () => {
    const original = globalThis.fetch;
    const requests: string[] = [];
    globalThis.fetch = async (input) => {
      const url = String(input); requests.push(url);
      if (url.includes('/revisions')) return new Response(JSON.stringify(page([
        action, { ...action, revision_id: 'revision-1', state: 'active', amount: '2',
          first_seen_at: '2026-05-02T00:00:00Z' },
      ])));
      if (url.startsWith('/api/import-jobs?')) return new Response(JSON.stringify({ data: {
        status: 'quota_wait', completed_chunks: 1, total_chunks: 3,
        error_code: 'daily_budget_reached', retry_after_utc: '2026-11-06T00:00:00Z',
        updated_at: '2026-11-05T20:00:00Z',
      } }));
      return new Response(JSON.stringify(page([action])));
    };
    try {
      const fixture = TestBed.createComponent(CorporateActionsSection);
      await fixture.whenStable(); fixture.detectChanges();
      const element = fixture.nativeElement as HTMLElement;
      expect(element.textContent).toContain('TEST.WAR');
      expect(element.textContent).toContain('Wycofane');
      expect(element.textContent).toContain('dzienny budżet wyczerpany');
      expect(element.textContent).toContain('Zapisane zdarzenia pozostają dostępne');
      expect(element.textContent).toContain('nie potwierdzają historycznej daty publikacji');
      const details = element.querySelector('details') as HTMLDetailsElement;
      details.open = true; details.dispatchEvent(new Event('toggle'));
      await fixture.whenStable(); fixture.detectChanges();
      expect(element.textContent).toContain('revision-1');
      expect(element.textContent).toContain('revision-2');
      expect(element.textContent).toContain('b'.repeat(64));
      expect(requests.some((url) => url.includes(`/revisions?source_symbol_id=${action.source_symbol_id}`))).toBe(true);
      fixture.destroy();
    } finally { globalThis.fetch = original; }
  });

  it('passes a symbol filter and resets the cursor when the class changes', async () => {
    const original = globalThis.fetch;
    const requests: string[] = [];
    globalThis.fetch = async (input) => {
      const url = String(input); requests.push(url);
      if (url.startsWith('/api/import-jobs?')) return new Response(JSON.stringify({ data: null }));
      if (url.includes('data_class=splits')) return new Response(JSON.stringify(page([])));
      return new Response(JSON.stringify(page([action], 'next-cursor')));
    };
    try {
      const fixture = TestBed.createComponent(CorporateActionsSection);
      await fixture.whenStable(); fixture.detectChanges();
      const element = fixture.nativeElement as HTMLElement;
      const symbol = element.querySelector('input[type="text"]') as HTMLInputElement;
      symbol.value = 'test.war'; symbol.dispatchEvent(new Event('input'));
      (element.querySelector('form') as HTMLFormElement).dispatchEvent(new Event('submit', { cancelable: true }));
      await fixture.whenStable(); fixture.detectChanges();
      expect(requests.some((url) => url.includes('provider_symbol=TEST.WAR'))).toBe(true);
      const next = [...element.querySelectorAll('button')].find((button) => button.textContent?.includes('Następna strona'));
      next?.click();
      await fixture.whenStable(); fixture.detectChanges();
      expect(requests.some((url) => url.includes('cursor=next-cursor'))).toBe(true);
      const kind = element.querySelector('select') as HTMLSelectElement;
      kind.value = 'splits'; kind.dispatchEvent(new Event('change'));
      await fixture.whenStable(); fixture.detectChanges();
      const latest = requests.filter((url) => url.startsWith('/api/corporate-actions?')).at(-1) ?? '';
      expect(latest).toContain('data_class=splits');
      expect(latest).not.toContain('cursor=');
      expect(element.textContent).toContain('Brak lokalnie zapisanych zdarzeń');
      fixture.destroy();
    } finally { globalThis.fetch = original; }
  });

  it('shows an archive error without calling the provider', async () => {
    const original = globalThis.fetch;
    const requests: string[] = [];
    globalThis.fetch = async (input) => {
      const url = String(input); requests.push(url);
      if (url.startsWith('/api/import-jobs?')) return new Response(JSON.stringify({ data: null }));
      return new Response(JSON.stringify({ error: { code: 'archive_corrupt' } }), { status: 503 });
    };
    try {
      const fixture = TestBed.createComponent(CorporateActionsSection);
      await fixture.whenStable(); fixture.detectChanges();
      expect((fixture.nativeElement as HTMLElement).textContent).toContain('Nie udało się odczytać działań korporacyjnych');
      expect(requests.every((url) => url.startsWith('/api/'))).toBe(true);
      fixture.destroy();
    } finally { globalThis.fetch = original; }
  });
});
