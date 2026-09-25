import { LIMITS } from '@beechat/shared';
import { and, eq, gt } from 'drizzle-orm';
import type { FastifyReply } from 'fastify';
import { config } from '../../config';
import type { Db } from '../../db/client';
import { sessions, users, type User } from '../../db/schema';
import { generateToken, hashToken } from '../../lib/tokens';

export const SESSION_COOKIE = 'beechat_session';

const DAY_MS = 24 * 60 * 60 * 1000;
const SESSION_TTL_MS = LIMITS.sessionDays * DAY_MS;
/** 剩余有效期低于这个值才续期，也就是每天最多写一次库 */
const REFRESH_BELOW_MS = SESSION_TTL_MS - DAY_MS;

export interface SessionWithUser {
  sessionId: string;
  expiresAt: Date;
  user: User;
}

export async function createSession(db: Db, userId: number, userAgent?: string) {
  const token = generateToken();
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
  await db.insert(sessions).values({
    id: hashToken(token),
    userId,
    expiresAt,
    userAgent: userAgent?.slice(0, 255) ?? null,
  });
  return { token, expiresAt };
}

export async function findSessionByToken(db: Db, token: string): Promise<SessionWithUser | null> {
  const [row] = await db
    .select({ sessionId: sessions.id, expiresAt: sessions.expiresAt, user: users })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .where(and(eq(sessions.id, hashToken(token)), gt(sessions.expiresAt, new Date())))
    .limit(1);
  return row ?? null;
}

/** 滚动续期。返回新的过期时间；还不需要续期时返回 null。 */
export async function touchSession(db: Db, session: SessionWithUser): Promise<Date | null> {
  if (session.expiresAt.getTime() - Date.now() > REFRESH_BELOW_MS) return null;
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
  await db.update(sessions).set({ expiresAt }).where(eq(sessions.id, session.sessionId));
  return expiresAt;
}

export async function deleteSession(db: Db, sessionId: string) {
  await db.delete(sessions).where(eq(sessions.id, sessionId));
}

export async function deleteUserSessions(db: Db, userId: number) {
  await db.delete(sessions).where(eq(sessions.userId, userId));
}

export function setSessionCookie(reply: FastifyReply, token: string, expiresAt: Date) {
  reply.setCookie(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: config.NODE_ENV === 'production',
    path: '/',
    expires: expiresAt,
  });
}

export function clearSessionCookie(reply: FastifyReply) {
  reply.clearCookie(SESSION_COOKIE, { path: '/' });
}

/** 从原始 Cookie 头里取一个值，给 Socket.IO 握手用，那里没有 Fastify 的 request.cookies */
export function readCookie(header: string | undefined, name: string): string | undefined {
  if (!header) return undefined;
  for (const part of header.split(';')) {
    const [rawKey, ...rest] = part.split('=');
    if (rawKey?.trim() === name) {
      try {
        return decodeURIComponent(rest.join('=').trim());
      } catch {
        return undefined;
      }
    }
  }
  return undefined;
}
