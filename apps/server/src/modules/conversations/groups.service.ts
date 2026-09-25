import { type ConversationView, LIMITS } from '@beechat/shared';
import { and, asc, count, eq, inArray } from 'drizzle-orm';
import type { AppContext } from '../../context';
import type { DbLike } from '../../db/client';
import { conversationMembers, conversations, friendships, type User, users } from '../../db/schema';
import { AppError } from '../../lib/errors';
import { conversationRoom, userRoom } from '../../realtime/rooms';
import {
  broadcastConversation,
  joinUserSockets,
  requireConversationView,
} from './conversations.service';
import { insertSystemMessage } from './messages.service';

async function loadGroup(db: DbLike, conversationId: number) {
  const [conversation] = await db
    .select()
    .from(conversations)
    .where(eq(conversations.id, conversationId))
    .limit(1);
  if (!conversation) throw new AppError(404, '会话不存在', 'CONVERSATION_NOT_FOUND');
  if (conversation.type !== 'group') throw new AppError(400, '这不是群聊', 'NOT_A_GROUP');
  return conversation;
}

async function isMember(db: DbLike, conversationId: number, userId: number) {
  const [row] = await db
    .select({ userId: conversationMembers.userId })
    .from(conversationMembers)
    .where(
      and(
        eq(conversationMembers.conversationId, conversationId),
        eq(conversationMembers.userId, userId),
      ),
    )
    .limit(1);
  return row !== undefined;
}

async function assertMe(db: DbLike, conversationId: number, meId: number) {
  if (!(await isMember(db, conversationId, meId))) {
    throw new AppError(403, '你不在这个群里', 'NOT_A_MEMBER');
  }
}

/** 只能拉自己的好友进群 */
async function assertAllFriends(db: DbLike, meId: number, userIds: number[]) {
  if (userIds.length === 0) return;
  const rows = await db
    .select({ friendId: friendships.friendId })
    .from(friendships)
    .where(
      and(
        eq(friendships.userId, meId),
        eq(friendships.status, 'friend'),
        inArray(friendships.friendId, userIds),
      ),
    );
  if (rows.length !== userIds.length) {
    throw new AppError(403, '只能邀请你的好友进群', 'NOT_FRIENDS');
  }
}

const joinNames = (list: { displayName: string }[]) =>
  list.map((entry) => entry.displayName).join('、');

export async function createGroup(
  ctx: AppContext,
  me: User,
  input: { name: string; memberIds: number[] },
): Promise<ConversationView> {
  const { db, io } = ctx;
  const memberIds = [...new Set(input.memberIds)].filter((id) => id !== me.id);
  if (memberIds.length === 0) throw new AppError(400, '至少选择一位好友', 'NO_MEMBERS');
  if (memberIds.length + 1 > LIMITS.groupMembers.max) {
    throw new AppError(400, `群成员最多 ${LIMITS.groupMembers.max} 人`, 'GROUP_FULL');
  }
  await assertAllFriends(db, me.id, memberIds);

  const conversationId = await db.transaction(async (tx) => {
    const [created] = await tx
      .insert(conversations)
      .values({ type: 'group', name: input.name, ownerId: me.id })
      .returning({ id: conversations.id });
    if (!created) throw new Error('insert returned no row');
    await tx
      .insert(conversationMembers)
      .values([
        { conversationId: created.id, userId: me.id, role: 'owner' as const },
        ...memberIds.map((userId) => ({ conversationId: created.id, userId })),
      ]);
    await insertSystemMessage(tx, created.id, `${me.displayName} 创建了群聊`, { readBy: me.id });
    return created.id;
  });

  for (const userId of [me.id, ...memberIds]) joinUserSockets(io, userId, conversationId);
  await broadcastConversation(ctx, conversationId);
  return requireConversationView(ctx, me.id, conversationId);
}

export async function renameGroup(
  ctx: AppContext,
  me: User,
  conversationId: number,
  name: string,
): Promise<ConversationView> {
  const { db } = ctx;
  const group = await loadGroup(db, conversationId);
  await assertMe(db, conversationId, me.id);
  if (group.ownerId !== me.id) throw new AppError(403, '只有群主可以修改群名', 'NOT_OWNER');

  await db.transaction(async (tx) => {
    await tx.update(conversations).set({ name }).where(eq(conversations.id, conversationId));
    await insertSystemMessage(tx, conversationId, `${me.displayName} 将群名改为“${name}”`, {
      readBy: me.id,
    });
  });
  await broadcastConversation(ctx, conversationId);
  return requireConversationView(ctx, me.id, conversationId);
}

/** 任何成员都可以邀请自己的好友 */
export async function addMembers(
  ctx: AppContext,
  me: User,
  conversationId: number,
  userIds: number[],
): Promise<ConversationView> {
  const { db, io } = ctx;
  await loadGroup(db, conversationId);
  await assertMe(db, conversationId, me.id);

  const existing = await db
    .select({ userId: conversationMembers.userId })
    .from(conversationMembers)
    .where(eq(conversationMembers.conversationId, conversationId));
  const existingIds = new Set(existing.map((row) => row.userId));
  const newIds = [...new Set(userIds)].filter((id) => !existingIds.has(id));
  if (newIds.length === 0) throw new AppError(409, '这些用户已经在群里了', 'ALREADY_MEMBERS');
  if (existingIds.size + newIds.length > LIMITS.groupMembers.max) {
    throw new AppError(400, `群成员最多 ${LIMITS.groupMembers.max} 人`, 'GROUP_FULL');
  }
  await assertAllFriends(db, me.id, newIds);
  const invited = await db.select().from(users).where(inArray(users.id, newIds));

  await db.transaction(async (tx) => {
    await tx
      .insert(conversationMembers)
      .values(newIds.map((userId) => ({ conversationId, userId })));
    await insertSystemMessage(
      tx,
      conversationId,
      `${me.displayName} 邀请 ${joinNames(invited)} 加入了群聊`,
      { readBy: me.id },
    );
  });

  for (const userId of newIds) joinUserSockets(io, userId, conversationId);
  await broadcastConversation(ctx, conversationId);
  return requireConversationView(ctx, me.id, conversationId);
}

/**
 * 退群或移出成员。群主退群时群主转给最早加入的成员；
 * 最后一个人退出时群解散。被移出的人收到 conversation:removed。
 */
export async function removeMember(
  ctx: AppContext,
  me: User,
  conversationId: number,
  targetId: number,
): Promise<void> {
  const { db, io } = ctx;
  const group = await loadGroup(db, conversationId);
  await assertMe(db, conversationId, me.id);
  const leaving = targetId === me.id;
  if (!leaving && group.ownerId !== me.id) {
    throw new AppError(403, '只有群主可以移出成员', 'NOT_OWNER');
  }
  const [target] = await db.select().from(users).where(eq(users.id, targetId)).limit(1);
  if (!target) throw new AppError(404, '用户不存在', 'USER_NOT_FOUND');
  if (!leaving && !(await isMember(db, conversationId, targetId))) {
    throw new AppError(404, '该用户不在群里', 'NOT_A_MEMBER');
  }

  const dissolved = await db.transaction(async (tx) => {
    await tx
      .delete(conversationMembers)
      .where(
        and(
          eq(conversationMembers.conversationId, conversationId),
          eq(conversationMembers.userId, targetId),
        ),
      );
    const remaining = await tx
      .select({ userId: conversationMembers.userId })
      .from(conversationMembers)
      .where(eq(conversationMembers.conversationId, conversationId))
      .orderBy(asc(conversationMembers.joinedAt), asc(conversationMembers.userId));
    const [successor] = remaining;
    if (!successor) {
      await tx.delete(conversations).where(eq(conversations.id, conversationId));
      return true;
    }

    let note = leaving
      ? `${target.displayName} 退出了群聊`
      : `${me.displayName} 将 ${target.displayName} 移出了群聊`;
    if (group.ownerId === targetId) {
      await tx
        .update(conversations)
        .set({ ownerId: successor.userId })
        .where(eq(conversations.id, conversationId));
      await tx
        .update(conversationMembers)
        .set({ role: 'owner' })
        .where(
          and(
            eq(conversationMembers.conversationId, conversationId),
            eq(conversationMembers.userId, successor.userId),
          ),
        );
      const [successorUser] = await tx
        .select({ displayName: users.displayName })
        .from(users)
        .where(eq(users.id, successor.userId))
        .limit(1);
      note += `，群主已转让给 ${successorUser?.displayName ?? '群成员'}`;
    }
    await insertSystemMessage(tx, conversationId, note, leaving ? {} : { readBy: me.id });
    return false;
  });

  io.in(userRoom(targetId)).socketsLeave(conversationRoom(conversationId));
  io.to(userRoom(targetId)).emit('conversation:removed', { conversationId });
  if (!dissolved) await broadcastConversation(ctx, conversationId);
}

/** 群成员数，供界面和上限检查使用 */
export async function countMembers(db: DbLike, conversationId: number): Promise<number> {
  const [row] = await db
    .select({ value: count() })
    .from(conversationMembers)
    .where(eq(conversationMembers.conversationId, conversationId));
  return row?.value ?? 0;
}
