import { randomUUID } from 'node:crypto';
import { describe, it, expect } from 'vitest';
import { VerificationTokenType } from '@prisma/client';
import { buildTestApp } from '../helpers/buildTestApp.js';
import { FakeEmailSender } from '../helpers/fakeEmailSender.js';
import { mutableClock } from '../helpers/mutableClock.js';
import { cookieValue, cookieHeader } from '../helpers/cookies.js';
import { testDb } from './helpers/db.js';
import { ACCESS_TOKEN_COOKIE, CSRF_TOKEN_COOKIE } from '../../src/shared/auth/cookies.js';
import { CSRF_SECRET_COOKIE } from '../../src/shared/auth/csrf.js';
import { hashOpaqueToken, VERIFICATION_TOKEN_TTL_SECONDS } from '../../src/shared/auth/tokens.js';

function registerPayload(overrides: Record<string, unknown> = {}) {
  return {
    email: `user-${randomUUID()}@example.com`,
    password: 'a-password-of-12-chars-or-more',
    name: 'Ada Lovelace',
    baseCurrency: 'USD',
    ...overrides,
  };
}

function extractToken(body: string): string {
  const match = /Your verification token is: (\S+)/.exec(body);
  if (!match) {
    throw new Error(`No verification token found in email body: ${body}`);
  }
  return match[1];
}

describe('FR-2.1: registration issues a verification email', () => {
  it('sends an EMAIL_VERIFY token via the configured EmailSender', async () => {
    const emailSender = new FakeEmailSender();
    const app = buildTestApp({ emailSender });
    await app.ready();
    const payload = registerPayload();

    await app.inject({ method: 'POST', url: '/api/v1/auth/register', payload });

    const message = emailSender.lastSentTo(payload.email);
    expect(message).toBeDefined();
    expect(message?.body).toContain('verification token');

    await app.close();
  });
});

describe('FR-2.2/FR-2.3: POST /auth/verify-email', () => {
  it('marks the account verified given a valid, unexpired token', async () => {
    const emailSender = new FakeEmailSender();
    const app = buildTestApp({ emailSender });
    await app.ready();
    const payload = registerPayload();

    await app.inject({ method: 'POST', url: '/api/v1/auth/register', payload });
    const token = extractToken(emailSender.lastSentTo(payload.email)!.body);

    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/verify-email',
      payload: { token },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ verified: true });

    const user = await testDb.user.findUniqueOrThrow({ where: { email: payload.email } });
    expect(user.verified).toBe(true);

    await app.close();
  });

  it('rejects an already-used token', async () => {
    const emailSender = new FakeEmailSender();
    const app = buildTestApp({ emailSender });
    await app.ready();
    const payload = registerPayload();

    await app.inject({ method: 'POST', url: '/api/v1/auth/register', payload });
    const token = extractToken(emailSender.lastSentTo(payload.email)!.body);

    await app.inject({ method: 'POST', url: '/api/v1/auth/verify-email', payload: { token } });
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/verify-email',
      payload: { token },
    });

    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe('TOKEN_INVALID_OR_EXPIRED');

    await app.close();
  });

  it('rejects an expired token', async () => {
    const emailSender = new FakeEmailSender();
    const time = mutableClock(new Date('2026-01-01T00:00:00Z'));
    const app = buildTestApp({ emailSender, clock: time.clock });
    await app.ready();
    const payload = registerPayload();

    await app.inject({ method: 'POST', url: '/api/v1/auth/register', payload });
    const token = extractToken(emailSender.lastSentTo(payload.email)!.body);

    time.advance((VERIFICATION_TOKEN_TTL_SECONDS + 1) * 1000);

    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/verify-email',
      payload: { token },
    });

    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe('TOKEN_INVALID_OR_EXPIRED');

    await app.close();
  });

  it('rejects a token of the wrong type (e.g. a PASSWORD_RESET token)', async () => {
    const app = buildTestApp();
    await app.ready();
    const payload = registerPayload();

    await app.inject({ method: 'POST', url: '/api/v1/auth/register', payload });
    const user = await testDb.user.findUniqueOrThrow({ where: { email: payload.email } });

    const rawToken = 'a-raw-password-reset-token';
    await testDb.verificationToken.create({
      data: {
        userId: user.id,
        type: VerificationTokenType.PASSWORD_RESET,
        tokenHash: hashOpaqueToken(rawToken),
        expiresAt: new Date(Date.now() + 60 * 60 * 1000),
      },
    });

    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/verify-email',
      payload: { token: rawToken },
    });

    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe('TOKEN_INVALID_OR_EXPIRED');

    await app.close();
  });

  it('rejects a missing token with 400 TOKEN_INVALID_OR_EXPIRED', async () => {
    const app = buildTestApp();
    await app.ready();

    const res = await app.inject({ method: 'POST', url: '/api/v1/auth/verify-email', payload: {} });

    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe('TOKEN_INVALID_OR_EXPIRED');

    await app.close();
  });
});

describe('FR-2.4: POST /auth/resend-verification', () => {
  async function registerAndGetSession(
    app: ReturnType<typeof buildTestApp>,
    payload: ReturnType<typeof registerPayload>,
  ) {
    const res = await app.inject({ method: 'POST', url: '/api/v1/auth/register', payload });
    return {
      cookie: cookieHeader(res, [ACCESS_TOKEN_COOKIE, CSRF_TOKEN_COOKIE, CSRF_SECRET_COOKIE]),
      csrfToken: cookieValue(res, CSRF_TOKEN_COOKIE)!,
    };
  }

  it('rejects an unauthenticated request with 401', async () => {
    const app = buildTestApp();
    await app.ready();

    const res = await app.inject({ method: 'POST', url: '/api/v1/auth/resend-verification' });

    expect(res.statusCode).toBe(401);

    await app.close();
  });

  it('rejects a missing/mismatched CSRF token with 403', async () => {
    const app = buildTestApp();
    await app.ready();
    const { cookie } = await registerAndGetSession(app, registerPayload());

    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/resend-verification',
      headers: { cookie },
    });

    expect(res.statusCode).toBe(403);
    expect(res.json().error.code).toBe('CSRF_TOKEN_INVALID');

    await app.close();
  });

  it('sends a new verification email for an unverified user', async () => {
    const emailSender = new FakeEmailSender();
    const app = buildTestApp({ emailSender });
    await app.ready();
    const payload = registerPayload();
    const { cookie, csrfToken } = await registerAndGetSession(app, payload);
    const sentBeforeResend = emailSender.sent.length;

    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/resend-verification',
      headers: { cookie, 'x-csrf-token': csrfToken },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ sent: true });
    expect(emailSender.sent.length).toBe(sentBeforeResend + 1);

    await app.close();
  });

  it('rejects an already-verified user with 409 ALREADY_VERIFIED', async () => {
    const emailSender = new FakeEmailSender();
    const app = buildTestApp({ emailSender });
    await app.ready();
    const payload = registerPayload();
    const { cookie, csrfToken } = await registerAndGetSession(app, payload);
    const token = extractToken(emailSender.lastSentTo(payload.email)!.body);
    await app.inject({ method: 'POST', url: '/api/v1/auth/verify-email', payload: { token } });

    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/resend-verification',
      headers: { cookie, 'x-csrf-token': csrfToken },
    });

    expect(res.statusCode).toBe(409);
    expect(res.json().error.code).toBe('ALREADY_VERIFIED');

    await app.close();
  });
});
