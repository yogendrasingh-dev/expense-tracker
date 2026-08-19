import { describe, it, expect } from 'vitest';
import { hashPassword, verifyPassword } from '../../../src/shared/auth/password.js';

describe('SEC-1: argon2id password hashing', () => {
  it('verifies a password against its own hash', async () => {
    const hash = await hashPassword('correct-horse-battery-staple');

    await expect(verifyPassword(hash, 'correct-horse-battery-staple')).resolves.toBe(true);
  });

  it('rejects an incorrect password against a valid hash', async () => {
    const hash = await hashPassword('correct-horse-battery-staple');

    await expect(verifyPassword(hash, 'wrong-password')).resolves.toBe(false);
  });

  it('produces an argon2id-prefixed hash', async () => {
    const hash = await hashPassword('correct-horse-battery-staple');

    expect(hash.startsWith('$argon2id$')).toBe(true);
  });
});
