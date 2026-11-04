import { randomBytes, timingSafeEqual } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';

const processToken = randomBytes(32).toString('hex');
const webPort = /^\d{2,5}$/.test(process.env.LESINE_WEB_PORT ?? '') ? process.env.LESINE_WEB_PORT : '8080';
const localHosts = new Set(['localhost', `localhost:${webPort}`, '127.0.0.1', `127.0.0.1:${webPort}`, '[::1]', `[::1]:${webPort}`, '127.0.0.1:3000']);
const localOrigins = new Set([`http://localhost:${webPort}`, `http://127.0.0.1:${webPort}`, `http://[::1]:${webPort}`]);

export function csrfToken(): string {
  return processToken;
}

export function localAccessAllowed(headers: IncomingMessage['headers'], method: string): boolean {
  const host = headers.host;
  if (!host || !localHosts.has(host.toLowerCase())) return false;
  const origin = headers.origin;
  if (origin && !localOrigins.has(origin)) return false;
  if (['GET', 'HEAD', 'OPTIONS'].includes(method)) return true;
  if (!origin) return false;
  const cookie = headers.cookie?.match(/(?:^|;\s*)lesine_csrf=([a-f0-9]{64})(?:;|$)/)?.[1];
  const supplied = headers['x-lesine-csrf'];
  if (!cookie || typeof supplied !== 'string' || supplied.length !== 64) return false;
  return timingSafeEqual(Buffer.from(cookie), Buffer.from(processToken)) &&
    timingSafeEqual(Buffer.from(supplied), Buffer.from(processToken));
}

export function localAccessMiddleware(req: IncomingMessage, res: ServerResponse, next: () => void): void {
  if (localAccessAllowed(req.headers, req.method ?? 'GET')) {
    next();
    return;
  }
  res.statusCode = 403;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify({ error: { code: 'access_denied', message: 'Dostęp lokalny jest wymagany.', field_errors: [], retry_after_utc: null } }));
}
