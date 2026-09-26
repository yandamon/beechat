import type { FastifyBaseLogger } from 'fastify';
import type { Db } from './db/client';
import type { PushService } from './modules/push/push.service';
import type { PresenceService } from './realtime/presence';
import type { RealtimeServer } from './realtime/server';
import type { StorageDriver } from './storage/types';

/** 业务服务需要的全部依赖，路由从 app.ctx 取出后传给服务函数 */
export interface AppContext {
  db: Db;
  io: RealtimeServer;
  presence: PresenceService;
  storage: StorageDriver;
  push: PushService;
  log: FastifyBaseLogger;
}

declare module 'fastify' {
  interface FastifyInstance {
    ctx: AppContext;
  }
}
