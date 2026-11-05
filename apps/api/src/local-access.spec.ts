import assert from 'node:assert/strict';
import { test } from 'node:test';
import { csrfToken, localAccessAllowed } from './local-access.js';
const port = process.env.LESINE_WEB_PORT ?? '8080';

test('only local Host and Origin values can read the API', () => {
  assert.equal(localAccessAllowed({ host: `localhost:${port}` }, 'GET'), true);
  assert.equal(localAccessAllowed({ host: 'evil.example' }, 'GET'), false);
  assert.equal(localAccessAllowed({ host: `localhost:${port}`, origin: 'https://evil.example' }, 'GET'), false);
});

test('writes require an origin, cookie and matching CSRF header', () => {
  const base = { host: `localhost:${port}`, origin: `http://localhost:${port}` };
  assert.equal(localAccessAllowed(base, 'POST'), false);
  assert.equal(localAccessAllowed({ ...base, cookie: `lesine_csrf=${csrfToken()}` }, 'POST'), false);
  assert.equal(localAccessAllowed({ ...base, cookie: `lesine_csrf=${csrfToken()}`, 'x-lesine-csrf': '0'.repeat(64) }, 'POST'), false);
  assert.equal(localAccessAllowed({ ...base, cookie: `lesine_csrf=${csrfToken()}`, 'x-lesine-csrf': 'ą'.repeat(64) }, 'POST'), false);
  assert.equal(localAccessAllowed({ ...base, cookie: `lesine_csrf=${csrfToken()}`, 'x-lesine-csrf': csrfToken() }, 'POST'), true);
});
