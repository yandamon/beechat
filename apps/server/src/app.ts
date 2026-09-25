import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import fastifyStatic from '@fastify/static';
import { sql } from 'drizzle-orm';
import Fastify from 'fastify';
import { config } from './config';
import type { Db } from './db/client';

declare module 'fastify' {
  interface FastifyInstance {
    db: Db;
  }
}

// 无论从 src/（tsx）还是 dist/（构建产物）运行，前端产物都在 ../../web/dist
const WEB_DIST = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../web/dist');

function loggerOptions() {
  if (config.NODE_ENV === 'test') return false;
  if (config.NODE_ENV === 'development') {
    return { level: config.LOG_LEVEL, transport: { target: 'pino-pretty' } };
  }
  return { level: config.LOG_LEVEL };
}

export interface BuildAppOptions {
  db: Db;
}

export async function buildApp({ db }: BuildAppOptions) {
  const app = Fastify({ logger: loggerOptions() });
  app.decorate('db', db);

  app.get('/api/health', async (_request, reply) => {
    let dbStatus: 'ok' | 'error' = 'ok';
    try {
      await db.execute(sql`select 1`);
    } catch (error) {
      app.log.error(error, 'database health check failed');
      dbStatus = 'error';
    }
    return reply.code(dbStatus === 'ok' ? 200 : 503).send({
      status: dbStatus === 'ok' ? 'ok' : 'degraded',
      name: 'beechat',
      env: config.NODE_ENV,
      db: dbStatus,
      time: new Date().toISOString(),
    });
  });

  // 生产环境由同一个服务托管前端静态文件，保证同源
  if (config.NODE_ENV === 'production' && existsSync(WEB_DIST)) {
    await app.register(fastifyStatic, { root: WEB_DIST, wildcard: false });
    app.setNotFoundHandler((request, reply) => {
      if (request.url.startsWith('/api/')) {
        return reply.code(404).send({ error: 'Not Found' });
      }
      return reply.sendFile('index.html');
    });
  }

  return app;
}

export type App = Awaited<ReturnType<typeof buildApp>>;
