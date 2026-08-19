import { randomUUID } from 'node:crypto';
import { Prisma, VerificationTokenType, type PrismaClient, type User } from '@prisma/client';
import { ConflictError, ValidationError } from '../../shared/errors/index.js';
import type { Clock } from '../../shared/time/clock.js';
import type { EmailSender } from '../../shared/email/EmailSender.js';
import { hashPassword } from '../../shared/auth/password.js';
import {
  generateOpaqueToken,
  hashOpaqueToken,
  REFRESH_TOKEN_TTL_SECONDS,
  VERIFICATION_TOKEN_TTL_SECONDS,
} from '../../shared/auth/tokens.js';
import { signAccessToken } from '../../shared/auth/jwt.js';
import { DEFAULT_CATEGORY_NAMES, normalizeCategoryName } from './defaultCategories.js';
import type { RegisterInput } from './schemas.js';

export interface AuthServiceDeps {
  prisma: PrismaClient;
  clock: Clock;
  jwtSecret: Uint8Array;
  emailSender: EmailSender;
}

export interface PublicUser {
  id: string;
  email: string;
  pendingEmail: string | null;
  name: string;
  timezone: string;
  baseCurrency: string;
  verified: boolean;
  createdAt: Date;
}

function toPublicUser(user: User): PublicUser {
  return {
    id: user.id,
    email: user.email,
    pendingEmail: user.pendingEmail,
    name: user.name,
    timezone: user.timezone,
    baseCurrency: user.baseCurrency,
    verified: user.verified,
    createdAt: user.createdAt,
  };
}

function verificationEmailBody(token: string): string {
  return `Your verification token is: ${token}`;
}

function isUniqueConstraintViolation(err: unknown): boolean {
  return err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002';
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  refreshTokenExpiresAt: Date;
}

export interface RegisterResult extends AuthTokens {
  user: PublicUser;
}

export interface AuthService {
  register(input: RegisterInput): Promise<RegisterResult>;
  verifyEmail(token: string): Promise<void>;
  resendVerification(user: { id: string; email: string; verified: boolean }): Promise<void>;
}

export function createAuthService(deps: AuthServiceDeps): AuthService {
  // FR-1.1-1.5 + FR-6: one atomic transaction creates the account, its default categories, an
  // EMAIL_VERIFY token, and the initial refresh-token family — architecture.md §12.
  async function register(input: RegisterInput): Promise<RegisterResult> {
    const existing = await deps.prisma.user.findUnique({ where: { email: input.email } });
    if (existing) {
      throw new ConflictError('EMAIL_ALREADY_IN_USE', 'Email is already in use');
    }

    const now = deps.clock.now();
    const passwordHash = await hashPassword(input.password);

    const verificationToken = generateOpaqueToken();
    const verificationExpiresAt = new Date(now.getTime() + VERIFICATION_TOKEN_TTL_SECONDS * 1000);

    const refreshToken = generateOpaqueToken();
    const refreshFamilyId = randomUUID();
    const refreshExpiresAt = new Date(now.getTime() + REFRESH_TOKEN_TTL_SECONDS * 1000);

    let user: User;
    try {
      user = await deps.prisma.$transaction(async (tx) => {
        const createdUser = await tx.user.create({
          data: {
            email: input.email,
            passwordHash,
            name: input.name,
            timezone: input.timezone,
            baseCurrency: input.baseCurrency,
          },
        });

        await tx.category.createMany({
          data: DEFAULT_CATEGORY_NAMES.map((name) => ({
            userId: createdUser.id,
            name,
            normalizedName: normalizeCategoryName(name),
          })),
        });

        await tx.verificationToken.create({
          data: {
            userId: createdUser.id,
            type: VerificationTokenType.EMAIL_VERIFY,
            tokenHash: hashOpaqueToken(verificationToken),
            expiresAt: verificationExpiresAt,
          },
        });

        await tx.refreshToken.create({
          data: {
            userId: createdUser.id,
            familyId: refreshFamilyId,
            tokenHash: hashOpaqueToken(refreshToken),
            expiresAt: refreshExpiresAt,
          },
        });

        return createdUser;
      });
    } catch (err) {
      if (isUniqueConstraintViolation(err)) {
        throw new ConflictError('EMAIL_ALREADY_IN_USE', 'Email is already in use');
      }
      throw err;
    }

    const accessToken = await signAccessToken(user.id, deps.jwtSecret, now);

    await deps.emailSender.send({
      to: user.email,
      subject: 'Verify your email',
      body: verificationEmailBody(verificationToken),
    });

    return {
      user: toPublicUser(user),
      accessToken,
      refreshToken,
      refreshTokenExpiresAt: refreshExpiresAt,
    };
  }

  // FR-2.1-2.3: a valid, unexpired, unused, correctly-typed token flips User.verified.
  async function verifyEmail(token: string): Promise<void> {
    const now = deps.clock.now();
    const record = await deps.prisma.verificationToken.findUnique({
      where: { tokenHash: hashOpaqueToken(token) },
    });

    const isUsable =
      record !== null &&
      record.type === VerificationTokenType.EMAIL_VERIFY &&
      record.usedAt === null &&
      record.expiresAt > now;

    if (!isUsable) {
      throw new ValidationError(
        'TOKEN_INVALID_OR_EXPIRED',
        'Verification token is invalid or expired',
      );
    }

    await deps.prisma.$transaction([
      deps.prisma.verificationToken.update({ where: { id: record.id }, data: { usedAt: now } }),
      deps.prisma.user.update({ where: { id: record.userId }, data: { verified: true } }),
    ]);
  }

  // FR-2.4: any authenticated user (any verification status) may request a new verification
  // email; an already-verified account gets a conflict rather than another token.
  async function resendVerification(user: {
    id: string;
    email: string;
    verified: boolean;
  }): Promise<void> {
    if (user.verified) {
      throw new ConflictError('ALREADY_VERIFIED', 'Account email is already verified');
    }

    const now = deps.clock.now();
    const token = generateOpaqueToken();

    await deps.prisma.verificationToken.create({
      data: {
        userId: user.id,
        type: VerificationTokenType.EMAIL_VERIFY,
        tokenHash: hashOpaqueToken(token),
        expiresAt: new Date(now.getTime() + VERIFICATION_TOKEN_TTL_SECONDS * 1000),
      },
    });

    await deps.emailSender.send({
      to: user.email,
      subject: 'Verify your email',
      body: verificationEmailBody(token),
    });
  }

  return { register, verifyEmail, resendVerification };
}
