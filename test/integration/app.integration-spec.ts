import { INestApplication } from '@nestjs/common';
import {
  PostgreSqlContainer,
  StartedPostgreSqlContainer,
} from '@testcontainers/postgresql';
import { readFileSync } from 'fs';
import { join } from 'path';
import { AgentBrowserSession } from './agent-browser';
import { createTestApp, TestApp } from './test-app';

function adminAuthHeader(): string {
  const user = process.env.ADMIN_USERNAME ?? 'admin';
  const password = process.env.ADMIN_PASSWORD ?? 'admin';
  return `Basic ${Buffer.from(`${user}:${password}`).toString('base64')}`;
}

describe('App (integration)', () => {
  let container: StartedPostgreSqlContainer;
  let testApp: TestApp;
  let app: INestApplication;
  let baseUrl: string;
  let browser: AgentBrowserSession;

  beforeAll(async () => {
    container = await new PostgreSqlContainer('postgres:16-alpine').start();
    process.env.DATABASE_URL = container.getConnectionUri();

    testApp = await createTestApp();
    ({ app, baseUrl } = testApp);
    browser = new AgentBrowserSession();
  }, 180_000);

  afterAll(async () => {
    browser?.close();
    await app?.close();
    await container?.stop();
  }, 60_000);

  it('serves the home page with the database reported as connected', () => {
    browser.open(`${baseUrl}/`);

    expect(browser.getText('[data-testid="app-status"]')).toContain(
      'Application status: ok',
    );
    expect(browser.getText('[data-testid="db-status"]')).toContain(
      'Database status: Connected',
    );
  });

  it('rejects unauthenticated requests to the admin panel', async () => {
    // Plain HTTP check rather than driving the browser here: an
    // unauthenticated Basic-Auth response triggers Chrome's native
    // credentials prompt, which would hang headless automation.
    const response = await fetch(`${baseUrl}/admin`);
    expect(response.status).toBe(401);
  });

  it('serves the admin panel once authenticated', () => {
    browser.setCredentials(
      process.env.ADMIN_USERNAME ?? 'admin',
      process.env.ADMIN_PASSWORD ?? 'admin',
    );
    browser.open(`${baseUrl}/admin`);

    expect(browser.getText('h1')).toContain('Admin panel');
    expect(browser.getText('[data-testid="admin-db-status"]')).toContain(
      'Database status: Connected',
    );
  });

  it('rejects unauthenticated requests to the advisor-reports extraction endpoint', async () => {
    // Plain HTTP check for the same reason as the admin-panel check above:
    // avoids triggering a native Basic-Auth credentials prompt.
    const response = await fetch(`${baseUrl}/admin/advisor-reports/extract`, {
      method: 'POST',
    });
    expect(response.status).toBe(401);
  });

  it('extracts the advisor report from an authenticated PDF upload', async () => {
    const pdfBytes = readFileSync(
      join(
        __dirname,
        '../../src/advisor-reports/__fixtures__/minimal-report.pdf',
      ),
    );
    const form = new FormData();
    form.append(
      'file',
      new Blob([pdfBytes], { type: 'application/pdf' }),
      'report.pdf',
    );

    const response = await fetch(`${baseUrl}/admin/advisor-reports/extract`, {
      method: 'POST',
      headers: { Authorization: adminAuthHeader() },
      body: form,
    });

    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      report: unknown;
      warnings: unknown;
    };
    expect(body).toHaveProperty('report');
    expect(body).toHaveProperty('warnings');
  });
});
