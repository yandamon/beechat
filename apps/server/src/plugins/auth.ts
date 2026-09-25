import type { FastifyRequest } from 'fastify';
import fp from 'fastify-plugin';
import type { User } from '../db/schema';
import { unauthorized } from '../lib/errors';
import {
  SESSION_COOKIE,
  clearSessionCookie,
  createSession,
  findSessionByToken,
  setSessionCookie,
  touchSession,
} from '../modules/auth/session.service';

export interface AuthContext {
  user: User;
  sessionId: string;
}

declare module 'fastify' {
  interface FastifyRequest {
    /** 由 app.authenticate 填充；未登录的请求上为 undefined */
    auth?: AuthContext;
  }
  interface FastifyInstance {
    /** 作为 preHandler 使用：校验 Cookie 里的会话，失败抛 401 */
    authenticate: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
    /** 为用户创建会话并写入 Cookie */
    startSession: (reply: FastifyReply, userId: number, userAgent?: string) => Promise<void>;
  }
}

/** 在已挂 authenticate 的路由里取当前用户，类型上保证非空 */
export function requireAuth(request: FastifyRequest): AuthContext {
  if (!request.auth) throw unauthorized();
  return request.auth;
}

export const authPlugin = fp(
  async (app) => {
    app.decorateRequest('auth', undefined);

    app.decorate('authenticate', async (request, reply) => {
      const token = request.cookies[SESSION_COOKIE];
      if (!token) throw unauthorized();

      const session = await findSessionByToken(app.db, token);
      if (!session) {
        clearSessionCookie(reply);
        throw unauthorized();
      }

      const refreshed = await touchSession(app.db, session);
      if (refreshed) setSessionCookie(reply, token, refreshed);

      request.auth = { user: session.user, sessionId: session.sessionId };
    });

    app.decorate('startSession', async (reply, userId, userAgent) => {
      const { token, expiresAt } = await createSession(app.db, userId, userAgent);
      setSessionCookie(reply, token, expiresAt);
    });
  },
  { name: 'auth', dependencies: ['@fastify/cookie'] },
);
