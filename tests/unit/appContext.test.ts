import { describe, it, expect } from 'vitest';
import { buildTestApp } from '../helpers/buildTestApp.js';
import { FakeEmailSender } from '../helpers/fakeEmailSender.js';

describe('shared auth infrastructure wiring', () => {
  it('boots with cookie/csrf/rate-limit plugins and answers an injected request', async () => {
    const app = buildTestApp();
    app.get('/__smoke', async () => ({ ok: true }));
    await app.ready();

    const res = await app.inject({ method: 'GET', url: '/__smoke' });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ ok: true });

    await app.close();
  });

  it('decorates the app with a context carrying guards and an email sender', async () => {
    const app = buildTestApp();
    await app.ready();

    expect(app.ctx.guards.requireAuth).toBeTypeOf('function');
    expect(app.ctx.guards.requireVerified).toBeTypeOf('function');
    expect(app.ctx.emailSender.send).toBeTypeOf('function');

    await app.close();
  });

  it('accepts an injected FakeEmailSender override that captures sent messages', async () => {
    const fakeEmailSender = new FakeEmailSender();
    const app = buildTestApp({ emailSender: fakeEmailSender });
    await app.ready();

    await app.ctx.emailSender.send({ to: 'user@example.com', subject: 'hi', body: 'hello' });

    expect(fakeEmailSender.sent).toHaveLength(1);
    expect(fakeEmailSender.lastSentTo('user@example.com')?.subject).toBe('hi');

    await app.close();
  });
});
