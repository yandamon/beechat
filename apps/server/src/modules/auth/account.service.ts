import { verify } from '@node-rs/argon2';
import { eq, inArray } from 'drizzle-orm';
import type { AppContext } from '../../context';
import { conversationMembers, conversations, type User, uploads, users } from '../../db/schema';
import { AppError } from '../../lib/errors';
import { conversationRoom, userRoom } from '../../realtime/rooms';
import { removeMember } from '../conversations/groups.service';

const PROTECTED_USERNAMES = new Set(['demo', 'beebot', 'xiaoya', 'laowang']);

/**
 * 注销账号：退出所有群（群主自动转让）、删除全部私聊、清理上传的文件，
 * 最后删除用户本身，级联带走会话、好友关系、消息与上传记录。
 */
export async function deleteAccount(ctx: AppContext, me: User, password: string) {
  const { db, io, storage, log } = ctx;
  if (PROTECTED_USERNAMES.has(me.username)) {
    throw new AppError(403, '演示账号不能注销', 'DEMO_PROTECTED');
  }
  if (!(await verify(me.passwordHash, password))) {
    throw new AppError(401, '密码不正确', 'INVALID_PASSWORD');
  }

  const memberships = await db
    .select({ conversationId: conversationMembers.conversationId, type: conversations.type })
    .from(conversationMembers)
    .innerJoin(conversations, eq(conversations.id, conversationMembers.conversationId))
    .where(eq(conversationMembers.userId, me.id));

  // 群：按退群处理，群主会转让，最后一个人退出则解散
  for (const membership of memberships.filter((entry) => entry.type === 'group')) {
    await removeMember(ctx, me, membership.conversationId, me.id);
  }

  // 私聊：整个会话删除，并通知对方从列表移除
  const directIds = memberships
    .filter((entry) => entry.type === 'direct')
    .map((entry) => entry.conversationId);
  if (directIds.length > 0) {
    const peers = await db
      .select({
        conversationId: conversationMembers.conversationId,
        userId: conversationMembers.userId,
      })
      .from(conversationMembers)
      .where(inArray(conversationMembers.conversationId, directIds));
    await db.delete(conversations).where(inArray(conversations.id, directIds));
    for (const peer of peers) {
      if (peer.userId === me.id) continue;
      io.in(userRoom(peer.userId)).socketsLeave(conversationRoom(peer.conversationId));
      io.to(userRoom(peer.userId)).emit('conversation:removed', {
        conversationId: peer.conversationId,
      });
    }
  }

  // 对象存储里的文件尽力删除，失败只记日志
  const files = await db
    .select({ key: uploads.key })
    .from(uploads)
    .where(eq(uploads.ownerId, me.id));
  for (const file of files) {
    try {
      await storage.delete(file.key);
    } catch (error) {
      log.warn({ key: file.key, error }, 'failed to delete upload during account deletion');
    }
  }

  await db.delete(users).where(eq(users.id, me.id));
  io.in(userRoom(me.id)).disconnectSockets(true);
}
