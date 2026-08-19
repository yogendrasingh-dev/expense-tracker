import { SignJWT, jwtVerify, errors as joseErrors } from 'jose';

export const ACCESS_TOKEN_TTL_SECONDS = 15 * 60;

export function toSecretKey(secret: string): Uint8Array {
  return new TextEncoder().encode(secret);
}

// CLAUDE.md §14 Finding B / architecture.md §7: the access token carries only the user id (plus
// standard iat/exp) — never `verified`/`timezone`/`baseCurrency`. Those mutable fields are always
// read fresh from the database by the auth guard, never cached in the token.
export async function signAccessToken(
  userId: string,
  secret: Uint8Array,
  now: Date = new Date(),
): Promise<string> {
  const issuedAtSeconds = Math.floor(now.getTime() / 1000);

  return new SignJWT({ sub: userId })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt(issuedAtSeconds)
    .setExpirationTime(issuedAtSeconds + ACCESS_TOKEN_TTL_SECONDS)
    .sign(secret);
}

export class InvalidAccessTokenError extends Error {}

export async function verifyAccessToken(
  token: string,
  secret: Uint8Array,
  now: Date = new Date(),
): Promise<string> {
  try {
    const { payload } = await jwtVerify(token, secret, { currentDate: now, algorithms: ['HS256'] });

    if (typeof payload.sub !== 'string') {
      throw new InvalidAccessTokenError('Access token missing subject claim');
    }

    return payload.sub;
  } catch (err) {
    if (err instanceof joseErrors.JOSEError) {
      throw new InvalidAccessTokenError('Access token invalid or expired');
    }
    throw err;
  }
}
