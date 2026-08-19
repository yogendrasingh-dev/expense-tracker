import { describe, it, expect } from 'vitest';
import Fastify, { type FastifyError } from 'fastify';
import { registerErrorHandler } from '../../../src/shared/errors/errorHandler.js';
import {
  ValidationError,
  UnauthorizedError,
  ForbiddenError,
  NotFoundError,
  ConflictError,
} from '../../../src/shared/errors/index.js';

function buildAppWithRoute(thrower: () => never) {
  const app = Fastify();
  registerErrorHandler(app);
  app.get('/boom', async () => {
    thrower();
  });
  return app;
}

describe('architecture.md §10: centralized error handler', () => {
  it('maps ValidationError to 400', async () => {
    const app = buildAppWithRoute(() => {
      throw new ValidationError('VALIDATION_ERROR', 'invalid input');
    });

    const res = await app.inject({ method: 'GET', url: '/boom' });

    expect(res.statusCode).toBe(400);
    expect(res.json()).toEqual({ error: { code: 'VALIDATION_ERROR', message: 'invalid input' } });
  });

  it('maps UnauthorizedError to 401', async () => {
    const app = buildAppWithRoute(() => {
      throw new UnauthorizedError('UNAUTHORIZED', 'no session');
    });

    const res = await app.inject({ method: 'GET', url: '/boom' });

    expect(res.statusCode).toBe(401);
    expect(res.json()).toEqual({ error: { code: 'UNAUTHORIZED', message: 'no session' } });
  });

  it('maps ForbiddenError to 403 (BR-6 ACCOUNT_UNVERIFIED)', async () => {
    const app = buildAppWithRoute(() => {
      throw new ForbiddenError('ACCOUNT_UNVERIFIED', 'not verified');
    });

    const res = await app.inject({ method: 'GET', url: '/boom' });

    expect(res.statusCode).toBe(403);
    expect(res.json()).toEqual({ error: { code: 'ACCOUNT_UNVERIFIED', message: 'not verified' } });
  });

  it('maps NotFoundError to 404 (SEC-2: ownership mismatches are 404, never 403)', async () => {
    const app = buildAppWithRoute(() => {
      throw new NotFoundError('NOT_FOUND', 'not found');
    });

    const res = await app.inject({ method: 'GET', url: '/boom' });

    expect(res.statusCode).toBe(404);
    expect(res.json()).toEqual({ error: { code: 'NOT_FOUND', message: 'not found' } });
  });

  it('maps ConflictError to 409 and preserves structured details', async () => {
    const app = buildAppWithRoute(() => {
      throw new ConflictError('CATEGORY_DELETE_BUDGET_CONFLICT', 'conflict', {
        conflictingMonths: ['2026-08-01'],
      });
    });

    const res = await app.inject({ method: 'GET', url: '/boom' });

    expect(res.statusCode).toBe(409);
    expect(res.json()).toEqual({
      error: {
        code: 'CATEGORY_DELETE_BUDGET_CONFLICT',
        message: 'conflict',
        details: { conflictingMonths: ['2026-08-01'] },
      },
    });
  });

  it('maps an unhandled error to a sanitized 500 with no internal detail leaked', async () => {
    const app = buildAppWithRoute(() => {
      throw new Error('leaky internal stack trace detail');
    });

    const res = await app.inject({ method: 'GET', url: '/boom' });

    expect(res.statusCode).toBe(500);
    expect(res.json()).toEqual({
      error: { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred' },
    });
  });

  it('maps a CSRF-protection plugin error to 403 CSRF_TOKEN_INVALID', async () => {
    const app = buildAppWithRoute(() => {
      const err = new Error('Invalid csrf token') as FastifyError;
      err.code = 'FST_CSRF_INVALID_TOKEN';
      throw err;
    });

    const res = await app.inject({ method: 'GET', url: '/boom' });

    expect(res.statusCode).toBe(403);
    expect(res.json()).toEqual({
      error: { code: 'CSRF_TOKEN_INVALID', message: 'Invalid or missing CSRF token' },
    });
  });
});
