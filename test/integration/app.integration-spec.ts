import { INestApplication } from '@nestjs/common';
import {
  PostgreSqlContainer,
  StartedPostgreSqlContainer,
} from '@testcontainers/postgresql';
import { AgentBrowserSession } from './agent-browser';
import { createTestApp, TestApp } from './test-app';

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
});
