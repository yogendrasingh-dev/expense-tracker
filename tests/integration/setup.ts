import { execFileSync } from 'node:child_process';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';

let container: StartedPostgreSqlContainer | undefined;

export default async function setup(): Promise<() => Promise<void>> {
  container = await new PostgreSqlContainer('postgres:16').start();
  const databaseUrl = container.getConnectionUri();

  process.env.DATABASE_URL = databaseUrl;

  // Apply the real migration files (not `db push`) so the migration itself is
  // exercised by every test run, per testing-strategy.md's resolved decision.
  execFileSync('node', ['node_modules/.bin/prisma', 'migrate', 'deploy'], {
    env: { ...process.env, DATABASE_URL: databaseUrl },
    stdio: 'inherit',
  });

  return async () => {
    await container?.stop();
  };
}
