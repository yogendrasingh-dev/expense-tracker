import type { FastifyInstance, FastifyRequest } from 'fastify';
import rateLimitPlugin from '@fastify/rate-limit';

const WINDOW_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS = 5;

// The plugin `throw`s whatever errorResponseBuilder returns (it does not call reply.send()
// itself), so this flows through registerErrorHandler like any other thrown error. It carries
// `code`/`statusCode` so that handler can recognize and format it (see errorHandler.ts).
export class RateLimitedError extends Error {
  readonly code = 'RATE_LIMITED';
  readonly statusCode: number;

  constructor(statusCode: number) {
    super('Too many requests, please try again later');
    this.statusCode = statusCode;
  }
}

// architecture.md §17: rate limiting is scoped specifically to /auth/* routes, not applied
// globally, so it never throttles normal authenticated usage. `global: false` means nothing is
// limited unless a route opts in via `authRateLimitConfig` below.
export function registerRateLimit(app: FastifyInstance): void {
  app.register(rateLimitPlugin, {
    global: false,
    // 'preHandler' (not the default 'onRequest') so keyGenerator can read the parsed body
    // (e.g. the email field) for account-scoped keying below.
    hook: 'preHandler',
    errorResponseBuilder: (_request, context) => new RateLimitedError(context.statusCode),
  });
}

// SEC-4 / api-spec.md §24: 5 attempts / 15 minutes, keyed by IP and (where available, e.g. the
// email in a request body) the targeted account.
export function authRateLimitConfig(accountKey?: (request: FastifyRequest) => string | undefined): {
  rateLimit: { max: number; timeWindow: number; keyGenerator: (request: FastifyRequest) => string };
} {
  return {
    rateLimit: {
      max: MAX_ATTEMPTS,
      timeWindow: WINDOW_MS,
      keyGenerator: (request: FastifyRequest) => {
        const account = accountKey?.(request);
        return account ? `${request.ip}:${account}` : request.ip;
      },
    },
  };
}
