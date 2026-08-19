import { hash, verify, argon2id, type HashOptions } from 'argon2';

// SEC-1: argon2id, OWASP-recommended minimum parameters (~19 MiB memory, 2 iterations, parallelism 1).
const PRODUCTION_OPTIONS: HashOptions = {
  type: argon2id,
  memoryCost: 19456,
  timeCost: 2,
  parallelism: 1,
};

// testing-strategy.md §22: reduced-cost argon2 params in the test environment only, so the
// integration suite doesn't pay production-grade hashing latency on every user fixture.
const TEST_OPTIONS: HashOptions = { type: argon2id, memoryCost: 1024, timeCost: 1, parallelism: 1 };

function hashOptions(): HashOptions {
  return process.env.NODE_ENV === 'test' ? TEST_OPTIONS : PRODUCTION_OPTIONS;
}

export async function hashPassword(password: string): Promise<string> {
  return hash(password, hashOptions());
}

export async function verifyPassword(passwordHash: string, password: string): Promise<boolean> {
  return verify(passwordHash, password);
}
