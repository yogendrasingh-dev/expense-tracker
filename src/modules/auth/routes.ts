import type { FastifyInstance, FastifyReply } from 'fastify';
import { prisma } from '../../db/prisma.js';
import { ValidationError } from '../../shared/errors/index.js';
import { toSecretKey, ACCESS_TOKEN_TTL_SECONDS } from '../../shared/auth/jwt.js';
import { authRateLimitConfig } from '../../shared/auth/rateLimit.js';
import { issueCsrfCookie } from '../../shared/auth/csrf.js';
import {
  ACCESS_TOKEN_COOKIE,
  REFRESH_TOKEN_COOKIE,
  accessTokenCookieOptions,
  refreshTokenCookieOptions,
} from '../../shared/auth/cookies.js';
import { REFRESH_TOKEN_TTL_SECONDS } from '../../shared/auth/tokens.js';
import { registerSchema, verifyEmailSchema } from './schemas.js';
import { createAuthService, type AuthTokens } from './service.js';

function setSessionCookies(reply: FastifyReply, tokens: AuthTokens, secure: boolean): void {
  reply.setCookie(
    ACCESS_TOKEN_COOKIE,
    tokens.accessToken,
    accessTokenCookieOptions(secure, ACCESS_TOKEN_TTL_SECONDS),
  );
  reply.setCookie(
    REFRESH_TOKEN_COOKIE,
    tokens.refreshToken,
    refreshTokenCookieOptions(secure, REFRESH_TOKEN_TTL_SECONDS),
  );
  issueCsrfCookie(reply, { secure, maxAgeSeconds: REFRESH_TOKEN_TTL_SECONDS });
}

function emailFromBody(request: { body?: unknown }): string | undefined {
  const body = request.body as { email?: unknown } | undefined;
  return typeof body?.email === 'string' ? body.email : undefined;
}

export async function registerAuthRoutes(app: FastifyInstance): Promise<void> {
  const authService = createAuthService({
    prisma,
    clock: app.ctx.clock,
    jwtSecret: toSecretKey(app.ctx.config.jwtSecret),
    emailSender: app.ctx.emailSender,
  });

  app.post('/register', { config: authRateLimitConfig(emailFromBody) }, async (request, reply) => {
    const parsed = registerSchema.safeParse(request.body);
    if (!parsed.success) {
      throw new ValidationError('VALIDATION_ERROR', 'Invalid registration input', {
        issues: parsed.error.issues,
      });
    }

    const result = await authService.register(parsed.data);
    setSessionCookies(reply, result, app.ctx.config.cookieSecure);
    reply.status(201).send(result.user);
  });

  app.post('/verify-email', async (request, reply) => {
    const parsed = verifyEmailSchema.safeParse(request.body);
    if (!parsed.success) {
      throw new ValidationError(
        'TOKEN_INVALID_OR_EXPIRED',
        'Verification token is invalid or expired',
      );
    }

    await authService.verifyEmail(parsed.data.token);
    reply.status(200).send({ verified: true });
  });

  app.post(
    '/resend-verification',
    {
      // api-spec.md §25: not in the CSRF-exemption list — an authenticated, mutating endpoint.
      preHandler: [app.ctx.guards.requireAuth, app.csrfProtection],
      config: authRateLimitConfig(),
    },
    async (request, reply) => {
      await authService.resendVerification(request.user!);
      reply.status(200).send({ sent: true });
    },
  );
}
