import type { ConversationView } from '@beechat/shared';
import { and, count, desc, eq, gt, inArray, isNull, max, ne, or, sql } from 'drizzle-orm';
import type { AppContext } from '../../context';
import type { DbLike } from '../../db/client';
import {
  type ConversationMember,
  conversationMembers,
  conversations,
  messages,
  type User,
  users,
} from '../../db/schema';
import { isUniqueViolation } from '../../lib/db-errors';
import { AppError } from '../../lib/errors';
import { toMessageView, toPublicUser } from '../../lib/views';
import { conversationRoom, userRoom } from '../../realtime/rooms';
import type { RealtimeServer } from '../../realtime/server';
import { areFriends } from '../friends/friends.repo';

/** 一对一会话的唯一键，保证两个人之间只有一个私聊 */
export const directKeyOf = (a: number, b: number) => `${Math.min(a, b)}:${Math.max(a, b)}`;

export async function listUserConversationIds(db: DbLike, userId: number): Promise<number[]> {
  const rows = await db
    .select({ conversationId: conversationMembers.conversationId })
    .from(conversationMembers)
    .where(eq(conversationMembers.userId, userId));
  return rows.map((row) => row.conversationId);
}

export async function assertMember(
  db: DbLike,
  conversationId: number,
  userId: number,
): Promise<ConversationMember> {
  const [member] = await db
    .select()
    .from(conversationMembers)
    .where(
      and(
        eq(conversationMembers.conversationId, conversationId),
        eq(conversationMembers.userId, userId),
      ),
    )
    .limit(1);
  if (!member) throw new AppError(403, '你不在这个会话里', 'NOT_A_MEMBER');
  return member;
}

export async function getOrCreateDirectConversation(
  db: DbLike,
  userA: number,
  userB: number,
): Promise<{ id: number; created: boolean }> {
  const directKey = directKeyOf(userA, userB);
  const findExisting = async () => {
    const [row] = await db
      .select({ id: conversations.id })
      .from(conversations)
      .where(eq(conversations.directKey, directKey))
      .limit(1);
    return row?.id;
  };

  const existingId = await findExisting();
  if (existingId !== undefined) return { id: existingId, created: false };

  try {
    const [created] = await db
      .insert(conversations)
      .values({ type: 'direct', directKey })
      .returning({ id: conversations.id });
    if (!created) throw new Error('insert returned no row');
    await db.insert(conversationMembers).values([
      { conversationId: created.id, userId: userA },
      { conversationId: created.id, userId: userB },
    ]);
    return { id: created.id, created: true };
  } catch (error) {
    // 两边同时创建时输给唯一索引的一方直接复用对方创建的会话
    if (!isUniqueViolation(error)) throw error;
    const id = await findExisting();
    if (id === undefined) throw error;
    return { id, created: false };
  }
}

/** 让某个用户当前的所有连接加入会话房间，新建会话或拉人入群后调用 */
export function joinUserSockets(io: RealtimeServer, userId: number, conversationId: number) {
  io.in(userRoom(userId)).socketsJoin(conversationRoom(conversationId));
}

/** 构造某个用户视角下的会话列表：成员、最后一条消息、未读数 */
export async function getConversationViews(
  ctx: AppContext,
  userId: number,
  conversationIds?: number[],
): Promise<ConversationView[]> {
  const { db, presence } = ctx;
  if (conversationIds && conversationIds.length === 0) return [];

  const base = await db
    .select({
      conversation: conversations,
      lastReadMessageId: conversationMembers.lastReadMessageId,
    })
    .from(conversationMembers)
    .innerJoin(conversations, eq(conversations.id, conversationMembers.conversationId))
    .where(
      and(
        eq(conversationMembers.userId, userId),
        conversationIds ? inArray(conversations.id, conversationIds) : undefined,
      ),
    )
    .orderBy(sql`${conversations.lastMessageAt} desc nulls last`, desc(conversations.createdAt));
  if (base.length === 0) return [];
  const ids = base.map((row) => row.conversation.id);

  const memberRows = await db
    .select({
      conversationId: conversationMembers.conversationId,
      role: conversationMembers.role,
      joinedAt: conversationMembers.joinedAt,
      user: users,
    })
    .from(conversationMembers)
    .innerJoin(users, eq(users.id, conversationMembers.userId))
    .where(inArray(conversationMembers.conversationId, ids));

  const lastIdRows = await db
    .select({ conversationId: messages.conversationId, id: max(messages.id) })
    .from(messages)
    .where(and(inArray(messages.conversationId, ids), isNull(messages.deletedAt)))
    .groupBy(messages.conversationId);
  const lastIds = lastIdRows.map((row) => row.id).filter((id): id is number => id !== null);
  const lastMessages =
    lastIds.length > 0 ? await db.select().from(messages).where(inArray(messages.id, lastIds)) : [];

  const unreadRows = await db
    .select({ conversationId: messages.conversationId, unread: count() })
    .from(messages)
    .innerJoin(
      conversationMembers,
      and(
        eq(conversationMembers.conversationId, messages.conversationId),
        eq(conversationMembers.userId, userId),
      ),
    )
    .where(
      and(
        inArray(messages.conversationId, ids),
        isNull(messages.deletedAt),
        gt(messages.id, sql`coalesce(${conversationMembers.lastReadMessageId}, 0)`),
        or(isNull(messages.senderId), ne(messages.senderId, userId)),
      ),
    )
    .groupBy(messages.conversationId);

  const membersByConversation = new Map<number, typeof memberRows>();
  for (const row of memberRows) {
    const list = membersByConversation.get(row.conversationId) ?? [];
    list.push(row);
    membersByConversation.set(row.conversationId, list);
  }
  const lastByConversation = new Map(lastMessages.map((row) => [row.conversationId, row]));
  const unreadByConversation = new Map(unreadRows.map((row) => [row.conversationId, row.unread]));

  return base.map(({ conversation, lastReadMessageId }) => {
    const memberList = membersByConversation.get(conversation.id) ?? [];
    const peer =
      conversation.type === 'direct'
        ? memberList.find((member) => member.user.id !== userId)?.user
        : undefined;
    const lastMessage = lastByConversation.get(conversation.id);
    return {
      id: conversation.id,
      type: conversation.type,
      name: conversation.name,
      avatarUrl: null,
      peer: peer ? { ...toPublicUser(peer), online: presence.isOnline(peer.id) } : null,
      members: memberList.map((member) => ({
        ...toPublicUser(member.user),
        role: member.role,
        joinedAt: member.joinedAt.toISOString(),
      })),
      lastMessage: lastMessage ? toMessageView(lastMessage) : null,
      lastMessageAt: conversation.lastMessageAt?.toISOString() ?? null,
      unreadCount: unreadByConversation.get(conversation.id) ?? 0,
      lastReadMessageId,
      createdAt: conversation.createdAt.toISOString(),
    };
  });
}

export async function getConversationView(
  ctx: AppContext,
  userId: number,
  conversationId: number,
): Promise<ConversationView | null> {
  const [view] = await getConversationViews(ctx, userId, [conversationId]);
  return view ?? null;
}

/** 和某个好友开始私聊：会话已存在则直接返回 */
export async function openDirectConversation(
  ctx: AppContext,
  me: User,
  otherId: number,
): Promise<ConversationView> {
  if (otherId === me.id) throw new AppError(400, '不能和自己聊天', 'SELF_CONVERSATION');
  if (!(await areFriends(ctx.db, me.id, otherId))) {
    throw new AppError(403, '先加对方为好友才能私聊', 'NOT_FRIENDS');
  }
  const { id, created } = await getOrCreateDirectConversation(ctx.db, me.id, otherId);
  if (created) {
    joinUserSockets(ctx.io, me.id, id);
    joinUserSockets(ctx.io, otherId, id);
  }
  const view = await getConversationView(ctx, me.id, id);
  if (!view) throw new AppError(404, '会话不存在', 'CONVERSATION_NOT_FOUND');
  return view;
}
