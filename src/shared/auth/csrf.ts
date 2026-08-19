import type { FastifyInstance, FastifyReply } from 'fastify';
import csrfProtectionPlugin from '@fastify/csrf-protection';
import { CSRF_TOKEN_COOKIE, csrfTokenCookieOptions } from './cookies.js';

export interface CsrfConfig {
  secure: boolean;
  maxAgeSeconds: number;
}

// The plugin's own httpOnly secret cookie (distinct from our non-httpOnly CSRF_TOKEN_COOKIE
// below). A client must present both this cookie and the matching X-CSRF-Token header.
export const CSRF_SECRET_COOKIE = '_csrf';

// api-spec.md §25 (AQ-3): double-submit CSRF token. The plugin stores a secret in an httpOnly
// cookie and derives a token from it; we separately expose that derived token as a third,
// non-httpOnly cookie the client's JS reads and echoes back via X-CSRF-Token.
export function registerCsrf(app: FastifyInstance, config: CsrfConfig): void {
  app.register(csrfProtectionPlugin, {
    cookieKey: CSRF_SECRET_COOKIE,
    cookieOpts: { path: '/', httpOnly: true, secure: config.secure, sameSite: 'lax' },
    getToken: (request) => request.headers['x-csrf-token'] as string | undefined,
  });
}

export function issueCsrfCookie(reply: FastifyReply, config: CsrfConfig): void {
  const token = reply.generateCsrf();
  reply.setCookie(
    CSRF_TOKEN_COOKIE,
    token,
    csrfTokenCookieOptions(config.secure, config.maxAgeSeconds),
  );
}
