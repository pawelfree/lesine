import { Component, signal } from '@angular/core';

@Component({
  selector: 'app-home',
  template: `
    <section class="intro">
      <p class="eyebrow">PLATFORMA BADAWCZA</p>
      <h1>Barometr rynku GPW</h1>
      <p>Przestrzeń do budowania wskaźników rynku i sprawdzania ich na danych historycznych.</p>
    </section>
    <section class="status" aria-label="Stan usług">
      <h2>Stan środowiska</h2>
      <p>API i baza danych: <strong>{{ serviceStatus() }}</strong></p>
      <p class="hint">Dane rynkowe są przygotowywane w zakładce Dane.</p>
    </section>
  `,
})
export class Home {
  readonly serviceStatus = signal('Sprawdzanie…');

  constructor() {
    fetch('/api/health')
      .then((response) => {
        if (!response.ok) throw new Error('API unavailable');
        return response.json() as Promise<{ status: string; database: string }>;
      })
      .then((health) => this.serviceStatus.set(health.status === 'ok' && health.database === 'ok' ? 'Gotowe' : 'Niedostępne'))
      .catch(() => this.serviceStatus.set('Niedostępne'));
  }
}
