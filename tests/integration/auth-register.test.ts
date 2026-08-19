import { randomUUID } from 'node:crypto';
import { describe, it, expect } from 'vitest';
import { buildTestApp } from '../helpers/buildTestApp.js';
import { cookieValue } from '../helpers/cookies.js';
import { testDb } from './helpers/db.js';
import {
  ACCESS_TOKEN_COOKIE,
  REFRESH_TOKEN_COOKIE,
  CSRF_TOKEN_COOKIE,
} from '../../src/shared/auth/cookies.js';

function registerPayload(overrides: Record<string, unknown> = {}) {
  return {
    email: `user-${randomUUID()}@example.com`,
    password: 'a-password-of-12-chars-or-more',
    name: 'Ada Lovelace',
    baseCurrency: 'USD',
    ...overrides,
  };
}

describe('FR-1.1/FR-1.5/FR-6: POST /auth/register', () => {
  it('creates a user and seeds the 7 default categories atomically', async () => {
    const app = buildTestApp();
    await app.ready();
    const payload = registerPayload();

    const res = await app.inject({ method: 'POST', url: '/api/v1/auth/register', payload });

    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body).toMatchObject({
      email: payload.email,
      name: payload.name,
      baseCurrency: 'USD',
      timezone: 'UTC',
      verified: false,
      pendingEmail: null,
    });
    expect(body.passwordHash).toBeUndefined();

    const user = await testDb.user.findUniqueOrThrow({ where: { email: payload.email } });
    const categories = await testDb.category.findMany({ where: { userId: user.id } });
    expect(categories).toHaveLength(7);
    expect(categories.map((c) => c.name).sort()).toEqual(
      ['Entertainment', 'Food', 'Other', 'Rent', 'Salary', 'Transport', 'Utilities'].sort(),
    );

    await app.close();
  });

  it('sets access, refresh, and CSRF cookies on success', async () => {
    const app = buildTestApp();
    await app.ready();

    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      payload: registerPayload(),
    });

    expect(cookieValue(res, ACCESS_TOKEN_COOKIE)).toBeDefined();
    expect(cookieValue(res, REFRESH_TOKEN_COOKIE)).toBeDefined();
    expect(cookieValue(res, CSRF_TOKEN_COOKIE)).toBeDefined();

    await app.close();
  });

  it('defaults timezone to UTC and preserves an explicitly provided timezone (FR-1.5)', async () => {
    const app = buildTestApp();
    await app.ready();

    const withTz = registerPayload({ timezone: 'Asia/Kolkata' });
    const res = await app.inject({ method: 'POST', url: '/api/v1/auth/register', payload: withTz });

    expect(res.json().timezone).toBe('Asia/Kolkata');

    await app.close();
  });

  it('rejects a duplicate email with 409 EMAIL_ALREADY_IN_USE (FR-1.2)', async () => {
    const app = buildTestApp();
    await app.ready();
    const payload = registerPayload();

    await app.inject({ method: 'POST', url: '/api/v1/auth/register', payload });
    const res = await app.inject({ method: 'POST', url: '/api/v1/auth/register', payload });

    expect(res.statusCode).toBe(409);
    expect(res.json()).toEqual({
      error: { code: 'EMAIL_ALREADY_IN_USE', message: 'Email is already in use' },
    });

    await app.close();
  });

  it('leaves exactly one user (and its 7 categories) after a concurrent duplicate-email race', async () => {
    const app = buildTestApp();
    await app.ready();
    const payload = registerPayload();

    const [first, second] = await Promise.all([
      app.inject({ method: 'POST', url: '/api/v1/auth/register', payload }),
      app.inject({ method: 'POST', url: '/api/v1/auth/register', payload }),
    ]);

    const statuses = [first.statusCode, second.statusCode].sort();
    expect(statuses).toEqual([201, 409]);

    const users = await testDb.user.findMany({ where: { email: payload.email } });
    expect(users).toHaveLength(1);
    const categories = await testDb.category.findMany({ where: { userId: users[0].id } });
    expect(categories).toHaveLength(7);

    await app.close();
  });

  it('rejects a malformed email with 400 VALIDATION_ERROR (FR-1.4)', async () => {
    const app = buildTestApp();
    await app.ready();

    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      payload: registerPayload({ email: 'not-an-email' }),
    });

    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe('VALIDATION_ERROR');

    await app.close();
  });

  it('rejects a missing baseCurrency with 400 VALIDATION_ERROR', async () => {
    const app = buildTestApp();
    await app.ready();
    const withoutCurrency: Record<string, unknown> = registerPayload();
    delete withoutCurrency.baseCurrency;

    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      payload: withoutCurrency,
    });

    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe('VALIDATION_ERROR');

    await app.close();
  });

  it('rate-limits after 5 attempts within 15 minutes (SEC-4)', async () => {
    const app = buildTestApp();
    await app.ready();
    const payload = registerPayload();

    const responses = [];
    for (let i = 0; i < 6; i += 1) {
      responses.push(await app.inject({ method: 'POST', url: '/api/v1/auth/register', payload }));
    }

    expect(responses.slice(0, 5).every((res) => res.statusCode !== 429)).toBe(true);
    expect(responses[5].statusCode).toBe(429);
    expect(responses[5].json()).toEqual({
      error: { code: 'RATE_LIMITED', message: 'Too many requests, please try again later' },
    });

    await app.close();
  });
});
