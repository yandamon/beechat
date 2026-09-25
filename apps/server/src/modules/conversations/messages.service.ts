import { randomUUID } from 'node:crypto';
import {
  LIMITS,
  type MessagePage,
  type MessageView,
  type MessagesQuery,
  type SendMessageInput,
} from '@beechat/shared';
import { and, asc, desc, eq, gt, isNull, lt, or } from 'drizzle-orm';
import type { AppContext } from '../../context';
import type { DbLike } from '../../db/client';
import {
  type AttachmentMeta,
  conversationMembers,
  conversations,
  type Message,
  messages,
} from '../../db/schema';
import { AppError } from '../../lib/errors';
import { toMessageView } from '../../lib/views';
import { conversationRoom } from '../../realtime/rooms';
import { areFriends } from '../friends/friends.repo';
import { requireCompletedUpload } from '../uploads/uploads.service';
import { assertMember } from './conversations.service';

/** 系统消息：没有发送者，例如“你们已经成为好友” */
export async function insertSystemMessage(
  db: DbLike,
  conversationId: number,
  content: string,
  options: { readBy?: number } = {},
): Promise<Message> {
  const [message] = await db
    .insert(messages)
    .values({ conversationId, senderId: null, type: 'system', content, clientId: randomUUID() })
    .returning();
  if (!message) throw new Error('insert returned no row');
  await db
    .update(conversations)
    .set({ lastMessageAt: message.createdAt })
    .where(eq(conversations.id, conversationId));
  // 动作的发起者不应把自己的操作看成未读
  if (options.readBy !== undefined) {
    await db
      .update(conversationMembers)
      .set({ lastReadMessageId: message.id })
      .where(
        and(
          eq(conversationMembers.conversationId, conversationId),
          eq(conversationMembers.userId, options.readBy),
        ),
      );
  }
  return message;
}

/**
 * 发送消息：校验成员与好友关系，按 clientId 幂等落库，
 * 更新会话时间与发送者的已读位置，然后广播给会话房间。
 * 图片消息引用一次已完成的上传，服务端不经手图片字节。
 */
export async function sendMessage(
  ctx: AppContext,
  senderId: number,
  input: SendMessageInput,
): Promise<MessageView> {
  const { db, io } = ctx;
  const { conversationId } = input;
  await assertMember(db, conversationId, senderId);

  const [conversation] = await db
    .select({ type: conversations.type })
    .from(conversations)
    .where(eq(conversations.id, conversationId))
    .limit(1);
  if (!conversation) throw new AppError(404, '会话不存在', 'CONVERSATION_NOT_FOUND');

  if (conversation.type === 'direct') {
    // 删除好友后会话保留，但双方都不能再发新消息
    const members = await db
      .select({ userId: conversationMembers.userId })
      .from(conversationMembers)
      .where(eq(conversationMembers.conversationId, conversationId));
    const peerId = members.map((member) => member.userId).find((id) => id !== senderId);
    if (peerId === undefined || !(await areFriends(db, senderId, peerId))) {
      throw new AppError(403, '你们还不是好友，暂时不能发消息', 'NOT_FRIENDS');
    }
  }

  let attachment: { key: string; meta: AttachmentMeta } | null = null;
  if (input.type === 'image') {
    const upload = await requireCompletedUpload(db, input.attachmentKey, senderId, 'image');
    attachment = {
      key: upload.key,
      meta: {
        width: upload.width ?? 0,
        height: upload.height ?? 0,
        size: upload.size,
        mime: upload.mime,
      },
    };
  }

  const result = await db.transaction(async (tx) => {
    const [inserted] = await tx
      .insert(messages)
      .values({
        conversationId,
        senderId,
        type: input.type,
        content: input.type === 'text' ? input.content : null,
        attachmentKey: attachment?.key ?? null,
        attachmentMeta: attachment?.meta ?? null,
        clientId: input.clientId,
      })
      .onConflictDoNothing({ target: [messages.senderId, messages.clientId] })
      .returning();

    if (!inserted) {
      // 同一个 clientId 已经落过库：客户端重试，直接返回原消息
      const [existing] = await tx
        .select()
        .from(messages)
        .where(and(eq(messages.senderId, senderId), eq(messages.clientId, input.clientId)))
        .limit(1);
      if (!existing) throw new Error('duplicate message not found');
      return { message: existing, duplicate: true };
    }

    await tx
      .update(conversations)
      .set({ lastMessageAt: inserted.createdAt })
      .where(eq(conversations.id, conversationId));
    await tx
      .update(conversationMembers)
      .set({ lastReadMessageId: inserted.id })
      .where(
        and(
          eq(conversationMembers.conversationId, conversationId),
          eq(conversationMembers.userId, senderId),
        ),
      );
    return { message: inserted, duplicate: false };
  });

  const view = toMessageView(result.message);
  if (!result.duplicate) io.to(conversationRoom(conversationId)).emit('message:new', view);
  return view;
}

/** 历史消息：默认最新一页；before 向更早翻页；after 用于重连后补拉 */
export async function getMessages(
  ctx: AppContext,
  userId: number,
  conversationId: number,
  query: MessagesQuery,
): Promise<MessagePage> {
  const { db } = ctx;
  await assertMember(db, conversationId, userId);
  const { limit } = query;

  if (query.after !== undefined) {
    const rows = await db
      .select()
      .from(messages)
      .where(and(eq(messages.conversationId, conversationId), gt(messages.id, query.after)))
      .orderBy(asc(messages.id))
      .limit(limit + 1);
    return { messages: rows.slice(0, limit).map(toMessageView), hasMore: rows.length > limit };
  }

  const rows = await db
    .select()
    .from(messages)
    .where(
      and(
        eq(messages.conversationId, conversationId),
        query.before !== undefined ? lt(messages.id, query.before) : undefined,
      ),
    )
    .orderBy(desc(messages.id))
    .limit(limit + 1);
  return {
    messages: rows.slice(0, limit).reverse().map(toMessageView),
    hasMore: rows.length > limit,
  };
}

/** 推进已读位置，只会向前不会后退；返回是否真的变了 */
export async function markRead(
  ctx: AppContext,
  userId: number,
  conversationId: number,
  messageId: number,
): Promise<boolean> {
  const updated = await ctx.db
    .update(conversationMembers)
    .set({ lastReadMessageId: messageId })
    .where(
      and(
        eq(conversationMembers.conversationId, conversationId),
        eq(conversationMembers.userId, userId),
        or(
          isNull(conversationMembers.lastReadMessageId),
          lt(conversationMembers.lastReadMessageId, messageId),
        ),
      ),
    )
    .returning({ conversationId: conversationMembers.conversationId });
  return updated.length > 0;
}

/** 撤回：只能撤自己发出且在时限内的消息，软删除后把新视图广播给全会话 */
export async function recallMessage(
  ctx: AppContext,
  userId: number,
  conversationId: number,
  messageId: number,
): Promise<MessageView> {
  const { db, io } = ctx;
  await assertMember(db, conversationId, userId);
  const [message] = await db
    .select()
    .from(messages)
    .where(and(eq(messages.id, messageId), eq(messages.conversationId, conversationId)))
    .limit(1);
  if (!message) throw new AppError(404, '消息不存在', 'MESSAGE_NOT_FOUND');
  if (message.senderId !== userId) throw new AppError(403, '只能撤回自己的消息', 'NOT_SENDER');
  if (message.deletedAt) return toMessageView(message);
  if (Date.now() - message.createdAt.getTime() > LIMITS.recallWindowMs) {
    throw new AppError(400, '超过两分钟的消息不能撤回', 'RECALL_WINDOW_PASSED');
  }
  const [updated] = await db
    .update(messages)
    .set({ deletedAt: new Date() })
    .where(eq(messages.id, messageId))
    .returning();
  const view = toMessageView(updated ?? message);
  io.to(conversationRoom(conversationId)).emit('message:updated', view);
  return view;
}
