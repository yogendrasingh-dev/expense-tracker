import { describe, it, expect } from 'vitest';
import { buildApp } from '../src/app.js';

describe('app boot', () => {
  it('builds and readies the Fastify app with no errors', async () => {
    const app = buildApp();

    await app.ready();
    expect(app.hasRoute).toBeDefined();

    await app.close();
  });
});
