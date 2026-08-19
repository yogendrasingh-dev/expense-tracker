import { describe, it, expect } from 'vitest';
import {
  signAccessToken,
  verifyAccessToken,
  toSecretKey,
  InvalidAccessTokenError,
  ACCESS_TOKEN_TTL_SECONDS,
} from '../../../src/shared/auth/jwt.js';

const secret = toSecretKey('test-secret-value-not-used-in-production');

describe('FR-3.4: access token sign/verify', () => {
  it('round-trips the user id through sign and verify', async () => {
    const token = await signAccessToken('user-123', secret);

    await expect(verifyAccessToken(token, secret)).resolves.toBe('user-123');
  });

  it('rejects a token verified after its ~15-minute expiry', async () => {
    const issuedAt = new Date('2026-01-01T00:00:00Z');
    const token = await signAccessToken('user-123', secret, issuedAt);
    const afterExpiry = new Date(issuedAt.getTime() + (ACCESS_TOKEN_TTL_SECONDS + 1) * 1000);

    await expect(verifyAccessToken(token, secret, afterExpiry)).rejects.toBeInstanceOf(
      InvalidAccessTokenError,
    );
  });

  it('rejects a token signed with a different secret', async () => {
    const token = await signAccessToken('user-123', secret);
    const otherSecret = toSecretKey('a-completely-different-secret-value');

    await expect(verifyAccessToken(token, otherSecret)).rejects.toBeInstanceOf(
      InvalidAccessTokenError,
    );
  });

  it('rejects a malformed token', async () => {
    await expect(verifyAccessToken('not-a-jwt', secret)).rejects.toBeInstanceOf(
      InvalidAccessTokenError,
    );
  });
});
