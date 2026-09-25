import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import fastifyCookie from '@fastify/cookie';
import fastifyRateLimit from '@fastify/rate-limit';
import fastifyStatic from '@fastify/static';
import { sql } from 'drizzle-orm';
import Fastify from 'fastify';
import {
  type ZodTypeProvider,
  serializerCompiler,
  validatorCompiler,
} from 'fastify-type-provider-zod';
import { config } from './config';
import type { Db } from './db/client';
import { registerErrorHandler } from './lib/errors';
import { authRoutes } from './modules/auth/auth.routes';
import { authPlugin } from './plugins/auth';
import { attachRealtime } from './realtime';

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
  /** 集成测试里关闭，避免连续请求被限流 */
  rateLimit?: boolean;
}

export async function buildApp({ db, rateLimit = true }: BuildAppOptions) {
  const base = Fastify({
    logger: loggerOptions(),
    // Railway 前面有反向代理，生产环境从 X-Forwarded-For 取真实 IP 供限流使用
    trustProxy: config.NODE_ENV === 'production',
  });

  base.decorate('db', db);
  registerErrorHandler(base);
  await base.register(fastifyCookie);
  if (rateLimit) {
    await base.register(fastifyRateLimit, {
      global: false,
      errorResponseBuilder: () => ({
        statusCode: 429,
        message: '操作太频繁，请稍后再试',
        code: 'RATE_LIMITED',
      }),
    });
  }
  await base.register(authPlugin);

  const app = base.withTypeProvider<ZodTypeProvider>();
  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);

  await app.register(authRoutes, { prefix: '/api/auth' });

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
        return reply.code(404).send({ message: '接口不存在', code: 'NOT_FOUND' });
      }
      return reply.sendFile('index.html');
    });
  }

  attachRealtime(app);

  return app;
}

export type App = Awaited<ReturnType<typeof buildApp>>;
