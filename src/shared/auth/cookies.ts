import type { CookieSerializeOptions } from '@fastify/cookie';

// architecture.md §7: both tokens are httpOnly/Secure cookies; api-spec.md §25 adds a third,
// non-httpOnly cookie carrying the double-submit CSRF token.
export const ACCESS_TOKEN_COOKIE = 'access_token';
export const REFRESH_TOKEN_COOKIE = 'refresh_token';
export const CSRF_TOKEN_COOKIE = 'csrf_token';

function baseOptions(secure: boolean): CookieSerializeOptions {
  return { path: '/', secure, sameSite: 'lax' };
}

export function accessTokenCookieOptions(
  secure: boolean,
  maxAgeSeconds: number,
): CookieSerializeOptions {
  return { ...baseOptions(secure), httpOnly: true, maxAge: maxAgeSeconds };
}

export function refreshTokenCookieOptions(
  secure: boolean,
  maxAgeSeconds: number,
): CookieSerializeOptions {
  return { ...baseOptions(secure), httpOnly: true, maxAge: maxAgeSeconds };
}

export function csrfTokenCookieOptions(
  secure: boolean,
  maxAgeSeconds: number,
): CookieSerializeOptions {
  return { ...baseOptions(secure), httpOnly: false, maxAge: maxAgeSeconds };
}

export function clearedCookieOptions(secure: boolean): CookieSerializeOptions {
  return baseOptions(secure);
}
