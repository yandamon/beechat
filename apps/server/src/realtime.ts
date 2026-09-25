import type { FastifyInstance } from 'fastify';
import { Server } from 'socket.io';
import { SESSION_COOKIE, findSessionByToken, readCookie } from './modules/auth/session.service';

export interface SocketData {
  userId: number;
  username: string;
}

// 事件名与载荷类型在功能落地时补充到 packages/shared，这里先放开
type AnyEvents = Record<string, (...args: never[]) => void>;

export type RealtimeServer = Server<AnyEvents, AnyEvents, AnyEvents, SocketData>;

declare module 'fastify' {
  interface FastifyInstance {
    io: RealtimeServer;
  }
}

export function attachRealtime(app: FastifyInstance) {
  const io: RealtimeServer = new Server(app.server, { serveClient: false });

  // 握手时复用登录 Cookie；没有有效会话的连接直接拒绝
  io.use(async (socket, next) => {
    try {
      const token = readCookie(socket.handshake.headers.cookie, SESSION_COOKIE);
      const session = token ? await findSessionByToken(app.db, token) : null;
      if (!session) {
        next(new Error('unauthorized'));
        return;
      }
      socket.data.userId = session.user.id;
      socket.data.username = session.user.username;
      next();
    } catch (error) {
      app.log.error(error, 'socket auth failed');
      next(new Error('unauthorized'));
    }
  });

  io.on('connection', (socket) => {
    const { userId } = socket.data;
    // 同一账号的每个连接都进同一个房间，便于按用户推送和多端同步
    void socket.join(`user:${userId}`);
    app.log.info({ socketId: socket.id, userId }, 'socket connected');
    socket.on('disconnect', (reason) => {
      app.log.info({ socketId: socket.id, userId, reason }, 'socket disconnected');
    });
  });

  app.decorate('io', io);
  app.addHook('onClose', async () => {
    await io.close();
  });

  return io;
}
