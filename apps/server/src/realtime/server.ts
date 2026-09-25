import type { ClientToServerEvents, ServerToClientEvents } from '@beechat/shared';
import { eq } from 'drizzle-orm';
import type { FastifyBaseLogger } from 'fastify';
import type { Server as HttpServer } from 'node:http';
import { Server } from 'socket.io';
import type { Db } from '../db/client';
import { users } from '../db/schema';
import { listUserConversationIds } from '../modules/conversations/conversations.service';
import { getFriendIds } from '../modules/friends/friends.repo';
import { SESSION_COOKIE, findSessionByToken, readCookie } from '../modules/auth/session.service';
import { PresenceService } from './presence';
import { conversationRoom, userRoom } from './rooms';

export interface SocketData {
  userId: number;
  username: string;
}

export type RealtimeServer = Server<
  ClientToServerEvents,
  ServerToClientEvents,
  Record<string, never>,
  SocketData
>;

declare module 'fastify' {
  interface FastifyInstance {
    io: RealtimeServer;
  }
}

export interface CreateRealtimeOptions {
  httpServer: HttpServer;
  db: Db;
  log: FastifyBaseLogger;
  presenceGraceMs: number;
}

/** 创建 Socket.IO 服务与在线状态服务；事件处理在 handlers.ts 里注册 */
export function createRealtime({ httpServer, db, log, presenceGraceMs }: CreateRealtimeOptions) {
  const io: RealtimeServer = new Server(httpServer, { serveClient: false });

  async function broadcastPresence(userId: number, online: boolean, lastSeenAt: Date | null) {
    const friendIds = await getFriendIds(db, userId);
    const event = { userId, online, lastSeenAt: lastSeenAt?.toISOString() ?? null };
    for (const friendId of friendIds) io.to(userRoom(friendId)).emit('presence', event);
  }

  const presence = new PresenceService(
    {
      onOnline: (userId) =>
        broadcastPresence(userId, true, null).catch((error) =>
          log.error(error, 'presence broadcast failed'),
        ),
      onOffline: async (userId) => {
        try {
          const lastSeenAt = new Date();
          await db.update(users).set({ lastSeenAt }).where(eq(users.id, userId));
          await broadcastPresence(userId, false, lastSeenAt);
        } catch (error) {
          log.error(error, 'presence offline handling failed');
        }
      },
    },
    presenceGraceMs,
  );

  // 握手时复用登录 Cookie；没有有效会话的连接直接拒绝。加入房间也在这里完成。
  io.use(async (socket, next) => {
    try {
      const token = readCookie(socket.handshake.headers.cookie, SESSION_COOKIE);
      const session = token ? await findSessionByToken(db, token) : null;
      if (!session) {
        next(new Error('unauthorized'));
        return;
      }
      socket.data.userId = session.user.id;
      socket.data.username = session.user.username;
      // 在握手阶段就加入房间：客户端收到 connect 时已经能收到会话事件
      await socket.join(userRoom(session.user.id));
      const conversationIds = await listUserConversationIds(db, session.user.id);
      await socket.join(conversationIds.map(conversationRoom));
      next();
    } catch (error) {
      log.error(error, 'socket auth failed');
      next(new Error('unauthorized'));
    }
  });

  return { io, presence };
}
