import Fastify, { type FastifyInstance } from 'fastify';
import { loadConfig, type AppConfig } from './config/index.js';

export function buildApp(config: AppConfig = loadConfig()): FastifyInstance {
  const app = Fastify({
    logger: config.nodeEnv === 'development' ? { transport: { target: 'pino-pretty' } } : true,
  });

  return app;
}
