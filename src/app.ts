import Fastify, { type FastifyInstance } from 'fastify';
import fastifyCookie from '@fastify/cookie';
import { loadConfig, type AppConfig } from './config/index.js';
import { prisma } from './db/prisma.js';
import { registerErrorHandler } from './shared/errors/errorHandler.js';
import { registerRateLimit } from './shared/auth/rateLimit.js';
import { registerCsrf } from './shared/auth/csrf.js';
import { createAuthGuards, type AuthGuards } from './shared/auth/guards.js';
import { toSecretKey } from './shared/auth/jwt.js';
import { REFRESH_TOKEN_TTL_SECONDS } from './shared/auth/tokens.js';
import { systemClock, type Clock } from './shared/time/clock.js';
import { ConsoleEmailSender } from './shared/email/ConsoleEmailSender.js';
import type { EmailSender } from './shared/email/EmailSender.js';
import { registerAuthRoutes } from './modules/auth/routes.js';

export interface AppContext {
  config: AppConfig;
  clock: Clock;
  guards: AuthGuards;
  emailSender: EmailSender;
}

declare module 'fastify' {
  interface FastifyInstance {
    ctx: AppContext;
  }
}

export interface BuildAppOverrides {
  clock?: Clock;
  emailSender?: EmailSender;
}

export function buildApp(
  config: AppConfig = loadConfig(),
  overrides: BuildAppOverrides = {},
): FastifyInstance {
  const app = Fastify({
    logger: config.nodeEnv === 'development' ? { transport: { target: 'pino-pretty' } } : true,
  });

  registerErrorHandler(app);
  app.register(fastifyCookie);
  registerRateLimit(app);
  registerCsrf(app, { secure: config.cookieSecure, maxAgeSeconds: REFRESH_TOKEN_TTL_SECONDS });

  // testing-strategy.md §14: the clock is injectable so token-expiry boundaries can be
  // constructed deterministically in tests instead of waiting on real wall-clock time.
  const clock = overrides.clock ?? systemClock;
  const guards = createAuthGuards({ prisma, jwtSecret: toSecretKey(config.jwtSecret), clock });
  const emailSender = overrides.emailSender ?? new ConsoleEmailSender();

  app.decorate('ctx', { config, clock, guards, emailSender });

  app.register(registerAuthRoutes, { prefix: '/api/v1/auth' });

  return app;
}
