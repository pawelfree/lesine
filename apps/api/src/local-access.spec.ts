import assert from 'node:assert/strict';
import { test } from 'node:test';
import { csrfToken, localAccessAllowed } from './local-access.js';

test('only local Host and Origin values can read the API', () => {
  assert.equal(localAccessAllowed({ host: 'localhost:8080' }, 'GET'), true);
  assert.equal(localAccessAllowed({ host: 'evil.example' }, 'GET'), false);
  assert.equal(localAccessAllowed({ host: 'localhost:8080', origin: 'https://evil.example' }, 'GET'), false);
});

test('writes require an origin, cookie and matching CSRF header', () => {
  const base = { host: 'localhost:8080', origin: 'http://localhost:8080' };
  assert.equal(localAccessAllowed(base, 'POST'), false);
  assert.equal(localAccessAllowed({ ...base, cookie: `lesine_csrf=${csrfToken()}` }, 'POST'), false);
  assert.equal(localAccessAllowed({ ...base, cookie: `lesine_csrf=${csrfToken()}`, 'x-lesine-csrf': '0'.repeat(64) }, 'POST'), false);
  assert.equal(localAccessAllowed({ ...base, cookie: `lesine_csrf=${csrfToken()}`, 'x-lesine-csrf': 'ą'.repeat(64) }, 'POST'), false);
  assert.equal(localAccessAllowed({ ...base, cookie: `lesine_csrf=${csrfToken()}`, 'x-lesine-csrf': csrfToken() }, 'POST'), true);
});
