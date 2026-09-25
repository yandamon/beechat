import type { FastifyBaseLogger } from 'fastify';
import type { Db } from './db/client';
import type { PresenceService } from './realtime/presence';
import type { RealtimeServer } from './realtime/server';

/** 业务服务需要的全部依赖，路由从 app.ctx 取出后传给服务函数 */
export interface AppContext {
  db: Db;
  io: RealtimeServer;
  presence: PresenceService;
  log: FastifyBaseLogger;
}

declare module 'fastify' {
  interface FastifyInstance {
    ctx: AppContext;
  }
}
