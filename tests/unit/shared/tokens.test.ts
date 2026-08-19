import { describe, it, expect } from 'vitest';
import { generateOpaqueToken, hashOpaqueToken } from '../../../src/shared/auth/tokens.js';

describe('SEC-3/SEC-8: opaque token generation and hashing', () => {
  it('generates distinct tokens on each call', () => {
    const a = generateOpaqueToken();
    const b = generateOpaqueToken();

    expect(a).not.toBe(b);
  });

  it('hashes the same token deterministically', () => {
    const token = generateOpaqueToken();

    expect(hashOpaqueToken(token)).toBe(hashOpaqueToken(token));
  });

  it('produces different hashes for different tokens', () => {
    const a = generateOpaqueToken();
    const b = generateOpaqueToken();

    expect(hashOpaqueToken(a)).not.toBe(hashOpaqueToken(b));
  });

  it('does not reveal the original token in its hash', () => {
    const token = generateOpaqueToken();

    expect(hashOpaqueToken(token)).not.toContain(token);
  });
});
