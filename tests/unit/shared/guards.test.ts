import { describe, it, expect, vi } from 'vitest';
import type { FastifyRequest } from 'fastify';
import type { PrismaClient } from '@prisma/client';
import { createAuthGuards, type AuthenticatedUser } from '../../../src/shared/auth/guards.js';
import { signAccessToken, toSecretKey } from '../../../src/shared/auth/jwt.js';
import { ACCESS_TOKEN_COOKIE } from '../../../src/shared/auth/cookies.js';
import { fixedClock } from '../../../src/shared/time/clock.js';
import { ForbiddenError, UnauthorizedError } from '../../../src/shared/errors/index.js';

const secret = toSecretKey('test-secret-value-not-used-in-production');
const now = new Date('2026-01-01T00:00:00Z');
const clock = fixedClock(now);

function makeRequest(cookies: Record<string, string | undefined>): FastifyRequest {
  return { cookies } as unknown as FastifyRequest;
}

function makeUser(overrides: Partial<AuthenticatedUser> = {}): AuthenticatedUser {
  return {
    id: 'user-1',
    email: 'a@example.com',
    name: 'A',
    verified: true,
    timezone: 'UTC',
    baseCurrency: 'USD',
    pendingEmail: null,
    ...overrides,
  };
}

describe('architecture.md §7-8: requireAuth guard', () => {
  it('rejects a request with no access token cookie', async () => {
    const findUnique = vi.fn();
    const { requireAuth } = createAuthGuards({
      prisma: { user: { findUnique } } as unknown as PrismaClient,
      jwtSecret: secret,
      clock,
    });

    await expect(requireAuth(makeRequest({}))).rejects.toBeInstanceOf(UnauthorizedError);
    expect(findUnique).not.toHaveBeenCalled();
  });

  it('rejects an expired access token', async () => {
    const token = await signAccessToken('user-1', secret, new Date(now.getTime() - 60 * 60 * 1000));
    const { requireAuth } = createAuthGuards({
      prisma: { user: { findUnique: vi.fn() } } as unknown as PrismaClient,
      jwtSecret: secret,
      clock,
    });

    await expect(requireAuth(makeRequest({ [ACCESS_TOKEN_COOKIE]: token }))).rejects.toBeInstanceOf(
      UnauthorizedError,
    );
  });

  it('rejects a valid token for a user that no longer exists', async () => {
    const token = await signAccessToken('user-1', secret, now);
    const { requireAuth } = createAuthGuards({
      prisma: { user: { findUnique: vi.fn().mockResolvedValue(null) } } as unknown as PrismaClient,
      jwtSecret: secret,
      clock,
    });

    await expect(requireAuth(makeRequest({ [ACCESS_TOKEN_COOKIE]: token }))).rejects.toBeInstanceOf(
      UnauthorizedError,
    );
  });

  it('attaches the fresh user record on a valid token (CLAUDE.md §14 Finding B)', async () => {
    const token = await signAccessToken('user-1', secret, now);
    const dbUser = {
      id: 'user-1',
      email: 'a@example.com',
      passwordHash: 'should-not-leak-onto-request.user',
      name: 'A',
      verified: true,
      timezone: 'UTC',
      baseCurrency: 'USD',
      pendingEmail: null,
      createdAt: now,
      updatedAt: now,
    };
    const findUnique = vi.fn().mockResolvedValue(dbUser);
    const { requireAuth } = createAuthGuards({
      prisma: { user: { findUnique } } as unknown as PrismaClient,
      jwtSecret: secret,
      clock,
    });
    const request = makeRequest({ [ACCESS_TOKEN_COOKIE]: token });

    await requireAuth(request);

    expect(findUnique).toHaveBeenCalledWith({ where: { id: 'user-1' } });
    expect(request.user).toEqual(makeUser());
  });
});

describe('BR-6: requireVerified guard', () => {
  it('rejects an unverified user with 403 ACCOUNT_UNVERIFIED', async () => {
    const { requireVerified } = createAuthGuards({
      prisma: {} as unknown as PrismaClient,
      jwtSecret: secret,
      clock,
    });
    const request = makeRequest({});
    request.user = makeUser({ verified: false });

    await expect(requireVerified(request)).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('passes through for a verified user', async () => {
    const { requireVerified } = createAuthGuards({
      prisma: {} as unknown as PrismaClient,
      jwtSecret: secret,
      clock,
    });
    const request = makeRequest({});
    request.user = makeUser({ verified: true });

    await expect(requireVerified(request)).resolves.toBeUndefined();
  });
});
