import { Component, signal } from '@angular/core';

@Component({
  selector: 'app-root',
  styleUrl: './app.css',
  templateUrl: './app.html',
})
export class App {
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
