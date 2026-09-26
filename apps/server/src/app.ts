import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { LIMITS } from '@beechat/shared';
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
import type { AppContext } from './context';
import type { Db } from './db/client';
import { registerErrorHandler } from './lib/errors';
import { authRoutes } from './modules/auth/auth.routes';
import { conversationsRoutes } from './modules/conversations/conversations.routes';
import { friendsRoutes } from './modules/friends/friends.routes';
import { pushRoutes } from './modules/push/push.routes';
import { PushService, type PushSender, type VapidKeys } from './modules/push/push.service';
import { reportsRoutes } from './modules/reports/reports.routes';
import { uploadsRoutes } from './modules/uploads/uploads.routes';
import { usersRoutes } from './modules/users/users.routes';
import { authPlugin } from './plugins/auth';
import { registerRealtimeHandlers } from './realtime/handlers';
import { createRealtime } from './realtime/server';
import { createStorage } from './storage';
import { LocalStorageDriver } from './storage/local';

declare module 'fastify' {
  interface FastifyInstance {
    db: Db;
  }
}

// 无论从 src/（tsx）还是 dist/（构建产物）运行，前端产物都在 ../../web/dist
const WEB_DIST = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../web/dist');

/** 三项都配置了才启用推送；config 里已经校验过要么全有要么全无 */
function vapidFromEnv(): VapidKeys | undefined {
  if (!config.VAPID_PUBLIC_KEY || !config.VAPID_PRIVATE_KEY || !config.VAPID_SUBJECT)
    return undefined;
  return {
    publicKey: config.VAPID_PUBLIC_KEY,
    privateKey: config.VAPID_PRIVATE_KEY,
    subject: config.VAPID_SUBJECT,
  };
}

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
  /** 断线后多久判定离线；测试里调小 */
  presenceGraceMs?: number;
  /** 测试里注入假的推送发送函数和密钥；不传则按环境变量决定 */
  push?: { vapid?: VapidKeys; sender?: PushSender };
}

export async function buildApp({
  db,
  rateLimit = true,
  presenceGraceMs = LIMITS.presenceGraceMs,
  push: pushOptions,
}: BuildAppOptions) {
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

  const { io, presence } = createRealtime({
    httpServer: base.server,
    db,
    log: base.log,
    presenceGraceMs,
  });
  const storage = createStorage();
  const push = new PushService({
    db,
    presence,
    log: base.log,
    vapid: pushOptions?.vapid ?? vapidFromEnv(),
    sender: pushOptions?.sender,
  });
  const ctx: AppContext = { db, io, presence, storage, push, log: base.log };
  base.decorate('ctx', ctx);
  base.decorate('io', io);
  base.addHook('onClose', async () => {
    presence.dispose();
    await io.close();
  });

  const app = base.withTypeProvider<ZodTypeProvider>();
  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);

  await app.register(authRoutes, { prefix: '/api/auth' });
  await app.register(usersRoutes, { prefix: '/api/users' });
  await app.register(friendsRoutes, { prefix: '/api/friends' });
  await app.register(conversationsRoutes, { prefix: '/api/conversations' });
  await app.register(uploadsRoutes, { prefix: '/api/uploads' });
  await app.register(reportsRoutes, { prefix: '/api/reports' });
  await app.register(pushRoutes, { prefix: '/api/push' });

  // 本地存储驱动时由本服务提供图片；键名唯一，可以长期缓存
  if (storage instanceof LocalStorageDriver) {
    await app.register(fastifyStatic, {
      root: storage.uploadsDir,
      prefix: '/uploads/',
      decorateReply: false,
      immutable: true,
      maxAge: '1y',
    });
  }

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

  registerRealtimeHandlers(ctx);

  return app;
}

export type App = Awaited<ReturnType<typeof buildApp>>;
