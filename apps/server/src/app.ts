import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import fastifyStatic from '@fastify/static';
import Fastify from 'fastify';
import { config } from './config';

// 无论从 src/（tsx）还是 dist/（构建产物）运行，前端产物都在 ../../web/dist
const WEB_DIST = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../web/dist');

function loggerOptions() {
  if (config.NODE_ENV === 'test') return false;
  if (config.NODE_ENV === 'development') {
    return { level: config.LOG_LEVEL, transport: { target: 'pino-pretty' } };
  }
  return { level: config.LOG_LEVEL };
}

export async function buildApp() {
  const app = Fastify({ logger: loggerOptions() });

  app.get('/api/health', async () => ({
    status: 'ok',
    name: 'beechat',
    env: config.NODE_ENV,
    time: new Date().toISOString(),
  }));

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
