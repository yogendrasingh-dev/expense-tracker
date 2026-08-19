import type { FastifyError, FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { AppError } from './index.js';
import { RateLimitedError } from '../auth/rateLimit.js';

interface ErrorBody {
  error: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
  };
}

function isCsrfError(error: FastifyError): boolean {
  return typeof error.code === 'string' && error.code.startsWith('FST_CSRF_');
}

export function registerErrorHandler(app: FastifyInstance): void {
  app.setErrorHandler((error: FastifyError, request: FastifyRequest, reply: FastifyReply) => {
    if (error instanceof AppError) {
      const body: ErrorBody = {
        error: {
          code: error.code,
          message: error.message,
          ...(error.details && { details: error.details }),
        },
      };
      reply.status(error.status).send(body);
      return;
    }

    if (isCsrfError(error)) {
      const body: ErrorBody = {
        error: { code: 'CSRF_TOKEN_INVALID', message: 'Invalid or missing CSRF token' },
      };
      reply.status(403).send(body);
      return;
    }

    if (error instanceof RateLimitedError) {
      const body: ErrorBody = { error: { code: error.code, message: error.message } };
      reply.status(error.statusCode).send(body);
      return;
    }

    request.log.error({ err: error }, 'Unhandled error');
    const body: ErrorBody = {
      error: { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred' },
    };
    reply.status(500).send(body);
  });
}
