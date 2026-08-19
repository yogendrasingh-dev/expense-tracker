export interface AppConfig {
  nodeEnv: string;
  port: number;
  databaseUrl: string | undefined;
  jwtSecret: string;
  cookieSecure: boolean;
}

const DEFAULT_PORT = 3000;

// Insecure, fixed fallback used only outside production so local/test runs don't require a
// .env file. Secrets are never hardcoded for a real deployment (architecture.md §17).
const DEV_JWT_SECRET_FALLBACK = 'dev-only-insecure-jwt-secret-do-not-use-in-production';

function parsePort(raw: string | undefined): number {
  if (raw === undefined || raw.trim() === '') {
    return DEFAULT_PORT;
  }

  const parsed = Number(raw);

  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`Invalid PORT environment variable: ${JSON.stringify(raw)}`);
  }

  return parsed;
}

function parseJwtSecret(raw: string | undefined, nodeEnv: string): string {
  if (raw !== undefined && raw.trim() !== '') {
    return raw;
  }

  if (nodeEnv === 'production') {
    throw new Error('JWT_SECRET environment variable is required in production');
  }

  return DEV_JWT_SECRET_FALLBACK;
}

export function loadConfig(): AppConfig {
  const nodeEnv = process.env.NODE_ENV ?? 'development';

  return {
    nodeEnv,
    port: parsePort(process.env.PORT),
    databaseUrl: process.env.DATABASE_URL,
    jwtSecret: parseJwtSecret(process.env.JWT_SECRET, nodeEnv),
    cookieSecure: nodeEnv === 'production',
  };
}
