import { randomUUID } from 'node:crypto';
import { describe, it, expect } from 'vitest';
import { VerificationTokenType, type Prisma } from '@prisma/client';
import { testDb } from './helpers/db.js';

function createUser(overrides: Partial<Prisma.UserCreateInput> = {}) {
  return testDb.user.create({
    data: {
      email: `user-${randomUUID()}@example.com`,
      passwordHash: 'hash',
      name: 'Test User',
      timezone: 'UTC',
      baseCurrency: 'USD',
      ...overrides,
    },
  });
}

describe('FR-1.2: User.email uniqueness', () => {
  it('rejects a second user with the same email', async () => {
    const email = `dup-${randomUUID()}@example.com`;
    await createUser({ email });

    await expect(createUser({ email })).rejects.toMatchObject({ code: 'P2002' });
  });
});

describe('SEC-8: RefreshToken.tokenHash uniqueness', () => {
  it('rejects a second refresh token with the same hash', async () => {
    const user = await createUser();
    const tokenHash = `token-${randomUUID()}`;
    const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24 * 30);

    await testDb.refreshToken.create({
      data: { userId: user.id, familyId: randomUUID(), tokenHash, expiresAt },
    });

    await expect(
      testDb.refreshToken.create({
        data: { userId: user.id, familyId: randomUUID(), tokenHash, expiresAt },
      }),
    ).rejects.toMatchObject({ code: 'P2002' });
  });
});

describe('SEC-3: VerificationToken.tokenHash uniqueness', () => {
  it('rejects a second verification token with the same hash', async () => {
    const user = await createUser();
    const tokenHash = `verify-${randomUUID()}`;
    const data = {
      userId: user.id,
      type: VerificationTokenType.EMAIL_VERIFY,
      tokenHash,
      expiresAt: new Date(Date.now() + 1000 * 60 * 60),
    };

    await testDb.verificationToken.create({ data });

    await expect(testDb.verificationToken.create({ data })).rejects.toMatchObject({
      code: 'P2002',
    });
  });
});

describe('FR-15.1: Category (userId, normalizedName) uniqueness', () => {
  it('rejects a duplicate normalizedName for the same user', async () => {
    const user = await createUser();

    await testDb.category.create({
      data: { userId: user.id, name: 'Food', normalizedName: 'food' },
    });

    await expect(
      testDb.category.create({
        data: { userId: user.id, name: 'food', normalizedName: 'food' },
      }),
    ).rejects.toMatchObject({ code: 'P2002' });
  });

  it('allows the same normalizedName for two different users', async () => {
    const userA = await createUser();
    const userB = await createUser();

    await testDb.category.create({
      data: { userId: userA.id, name: 'Food', normalizedName: 'food' },
    });

    await expect(
      testDb.category.create({
        data: { userId: userB.id, name: 'Food', normalizedName: 'food' },
      }),
    ).resolves.toBeDefined();
  });
});

describe('DI-2/DI-4: User delete cascades to all child tables', () => {
  it('removes RefreshToken, VerificationToken, and Category rows when the user is deleted', async () => {
    const user = await createUser();

    await testDb.refreshToken.create({
      data: {
        userId: user.id,
        familyId: randomUUID(),
        tokenHash: randomUUID(),
        expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24 * 30),
      },
    });
    await testDb.verificationToken.create({
      data: {
        userId: user.id,
        type: VerificationTokenType.EMAIL_VERIFY,
        tokenHash: randomUUID(),
        expiresAt: new Date(Date.now() + 1000 * 60 * 60),
      },
    });
    await testDb.category.create({
      data: { userId: user.id, name: 'Food', normalizedName: 'food' },
    });

    await testDb.user.delete({ where: { id: user.id } });

    const [refreshTokens, verificationTokens, categories] = await Promise.all([
      testDb.refreshToken.findMany({ where: { userId: user.id } }),
      testDb.verificationToken.findMany({ where: { userId: user.id } }),
      testDb.category.findMany({ where: { userId: user.id } }),
    ]);

    expect(refreshTokens).toHaveLength(0);
    expect(verificationTokens).toHaveLength(0);
    expect(categories).toHaveLength(0);
  });
});
