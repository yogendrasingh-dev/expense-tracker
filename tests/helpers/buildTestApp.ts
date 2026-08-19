import type { FastifyInstance } from 'fastify';
import { buildApp, type BuildAppOverrides } from '../../src/app.js';
import { loadConfig } from '../../src/config/index.js';

export function buildTestApp(overrides: BuildAppOverrides = {}): FastifyInstance {
  return buildApp(loadConfig(), overrides);
}
