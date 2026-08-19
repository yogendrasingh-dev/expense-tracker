import { describe, it, expect } from 'vitest';
import { registerSchema } from '../../../../src/modules/auth/schemas.js';

const validInput = {
  email: 'user@example.com',
  password: 'a-password-of-12-chars-or-more',
  name: 'Ada Lovelace',
  baseCurrency: 'USD',
};

describe('FR-1.3: registration password policy (min 12 chars, no complexity mix)', () => {
  it('accepts a password of exactly 12 characters', () => {
    const result = registerSchema.safeParse({ ...validInput, password: '123456789012' });

    expect(result.success).toBe(true);
  });

  it('rejects a password shorter than 12 characters', () => {
    const result = registerSchema.safeParse({ ...validInput, password: 'short-pass' });

    expect(result.success).toBe(false);
  });
});

describe('FR-1.4: registration email format validation', () => {
  it('rejects a malformed email address', () => {
    const result = registerSchema.safeParse({ ...validInput, email: 'not-an-email' });

    expect(result.success).toBe(false);
  });
});

describe('FR-1.5: registration timezone defaulting', () => {
  it('defaults timezone to UTC when omitted', () => {
    const result = registerSchema.safeParse(validInput);

    expect(result.success).toBe(true);
    expect(result.success && result.data.timezone).toBe('UTC');
  });

  it('keeps an explicitly provided timezone', () => {
    const result = registerSchema.safeParse({ ...validInput, timezone: 'Asia/Kolkata' });

    expect(result.success).toBe(true);
    expect(result.success && result.data.timezone).toBe('Asia/Kolkata');
  });
});

describe('FR-26.1: registration requires baseCurrency', () => {
  it('rejects a missing baseCurrency', () => {
    const withoutCurrency: Record<string, unknown> = { ...validInput };
    delete withoutCurrency.baseCurrency;

    const result = registerSchema.safeParse(withoutCurrency);

    expect(result.success).toBe(false);
  });

  it('rejects a baseCurrency that is not a 3-letter code', () => {
    const result = registerSchema.safeParse({ ...validInput, baseCurrency: 'usd' });

    expect(result.success).toBe(false);
  });
});
