import { z } from 'zod';

// FR-1.1-1.5: email, password (>=12 chars, FR-1.3), name, optional timezone (defaults to UTC,
// FR-1.5), required baseCurrency (FR-26.1). No IANA-format check on timezone here — api-spec.md
// only documents that validation for `PATCH /users/me/timezone` (§10), not registration (§3).
export const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(12),
  name: z.string().min(1),
  timezone: z.string().min(1).default('UTC'),
  baseCurrency: z.string().regex(/^[A-Z]{3}$/, 'baseCurrency must be a 3-letter ISO 4217 code'),
});

export type RegisterInput = z.infer<typeof registerSchema>;

// api-spec.md §4: the only documented error for this endpoint is TOKEN_INVALID_OR_EXPIRED, so a
// malformed/missing token maps to that code rather than a separate VALIDATION_ERROR.
export const verifyEmailSchema = z.object({
  token: z.string().min(1),
});
