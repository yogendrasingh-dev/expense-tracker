export interface AppConfig {
  nodeEnv: string;
  port: number;
  databaseUrl: string | undefined;
}

const DEFAULT_PORT = 3000;

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

export function loadConfig(): AppConfig {
  return {
    nodeEnv: process.env.NODE_ENV ?? 'development',
    port: parsePort(process.env.PORT),
    databaseUrl: process.env.DATABASE_URL,
  };
}
