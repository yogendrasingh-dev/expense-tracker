import type { FastifyRequest } from 'fastify';
import type { PrismaClient } from '@prisma/client';
import { ForbiddenError, UnauthorizedError } from '../errors/index.js';
import type { Clock } from '../time/clock.js';
import { ACCESS_TOKEN_COOKIE } from './cookies.js';
import { InvalidAccessTokenError, verifyAccessToken } from './jwt.js';

export interface AuthenticatedUser {
  id: string;
  email: string;
  name: string;
  verified: boolean;
  timezone: string;
  baseCurrency: string;
  pendingEmail: string | null;
}

declare module 'fastify' {
  interface FastifyRequest {
    user?: AuthenticatedUser;
  }
}

export interface AuthGuardDeps {
  prisma: PrismaClient;
  jwtSecret: Uint8Array;
  clock: Clock;
}

export interface AuthGuards {
  requireAuth(request: FastifyRequest): Promise<void>;
  requireVerified(request: FastifyRequest): Promise<void>;
}

// architecture.md §7-8: every request re-verifies the access token's signature/expiry, then
// (CLAUDE.md §14 Finding B) re-reads the user's mutable fields fresh from the database — never
// trusting a cached JWT claim for verified/timezone/baseCurrency.
export function createAuthGuards(deps: AuthGuardDeps): AuthGuards {
  async function requireAuth(request: FastifyRequest): Promise<void> {
    const token = request.cookies[ACCESS_TOKEN_COOKIE];
    if (!token) {
      throw new UnauthorizedError('UNAUTHORIZED', 'Authentication is required');
    }

    let userId: string;
    try {
      userId = await verifyAccessToken(token, deps.jwtSecret, deps.clock.now());
    } catch (err) {
      if (err instanceof InvalidAccessTokenError) {
        throw new UnauthorizedError('UNAUTHORIZED', 'Access token is invalid or expired');
      }
      throw err;
    }

    const user = await deps.prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new UnauthorizedError('UNAUTHORIZED', 'Access token is invalid or expired');
    }

    request.user = {
      id: user.id,
      email: user.email,
      name: user.name,
      verified: user.verified,
      timezone: user.timezone,
      baseCurrency: user.baseCurrency,
      pendingEmail: user.pendingEmail,
    };
  }

  // BR-6: unverified accounts may authenticate but not mutate financial/category records.
  async function requireVerified(request: FastifyRequest): Promise<void> {
    if (!request.user?.verified) {
      throw new ForbiddenError('ACCOUNT_UNVERIFIED', 'Account email is not verified');
    }
  }

  return { requireAuth, requireVerified };
}
