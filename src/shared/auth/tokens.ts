import { randomBytes, createHash } from 'node:crypto';

const OPAQUE_TOKEN_BYTES = 32;

// FR-3.4/SEC-6: refresh tokens are long-lived (~30 days); FR-2.1/FR-5.2/FR-25.4/SEC-3:
// verification/reset/email-change tokens are single-use with a 1-hour expiry.
export const REFRESH_TOKEN_TTL_SECONDS = 30 * 24 * 60 * 60;
export const VERIFICATION_TOKEN_TTL_SECONDS = 60 * 60;

// Refresh tokens and verification tokens (architecture.md §16) are opaque, high-entropy random
// values — the raw value is sent to the client/email and only its hash is ever stored, mirroring
// the defense-in-depth principle used for passwords. SHA-256 (not argon2id) is deliberately used
// here: these are already-random 256-bit values, not user-chosen secrets, so a deliberately slow
// hash buys no additional security and would only hurt refresh-heavy traffic.
export function generateOpaqueToken(): string {
  return randomBytes(OPAQUE_TOKEN_BYTES).toString('base64url');
}

export function hashOpaqueToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}
