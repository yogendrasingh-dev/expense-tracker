import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';

function createTestPrismaClient(): PrismaClient {
  const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
  return new PrismaClient({ adapter });
}

export const testDb = createTestPrismaClient();

export async function truncateAllTables(): Promise<void> {
  await testDb.$executeRawUnsafe(
    'TRUNCATE TABLE "User", "RefreshToken", "VerificationToken", "Category" RESTART IDENTITY CASCADE;',
  );
}
