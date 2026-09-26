import type { ReactionSummary } from '@beechat/shared';
import { and, asc, eq, inArray } from 'drizzle-orm';
import type { AppContext } from '../../context';
import type { DbLike } from '../../db/client';
import { messageReactions, messages } from '../../db/schema';
import { AppError } from '../../lib/errors';
import { conversationRoom } from '../../realtime/rooms';
import { assertMember } from './conversations.service';

/** 一次查出一批消息的回应汇总：表情 → 人数与人员顺序 */
export async function summarizeReactions(
  db: DbLike,
  messageIds: number[],
): Promise<Map<number, ReactionSummary[]>> {
  const result = new Map<number, ReactionSummary[]>();
  if (messageIds.length === 0) return result;
  const rows = await db
    .select({
      messageId: messageReactions.messageId,
      userId: messageReactions.userId,
      emoji: messageReactions.emoji,
    })
    .from(messageReactions)
    .where(inArray(messageReactions.messageId, messageIds))
    .orderBy(asc(messageReactions.createdAt), asc(messageReactions.userId));
  for (const row of rows) {
    const list = result.get(row.messageId) ?? [];
    let entry = list.find((item) => item.emoji === row.emoji);
    if (!entry) {
      entry = { emoji: row.emoji, count: 0, userIds: [] };
      list.push(entry);
    }
    entry.count += 1;
    entry.userIds.push(row.userId);
    result.set(row.messageId, list);
  }
  return result;
}

/** 点一下加上，再点一下取消；变化后把这条消息的汇总广播给整个会话 */
export async function toggleReaction(
  ctx: AppContext,
  userId: number,
  conversationId: number,
  messageId: number,
  emoji: string,
): Promise<ReactionSummary[]> {
  const { db, io } = ctx;
  await assertMember(db, conversationId, userId);
  const [message] = await db
    .select({ id: messages.id, deletedAt: messages.deletedAt })
    .from(messages)
    .where(and(eq(messages.id, messageId), eq(messages.conversationId, conversationId)))
    .limit(1);
  if (!message) throw new AppError(404, '消息不存在', 'MESSAGE_NOT_FOUND');
  if (message.deletedAt) throw new AppError(400, '已撤回的消息不能回应', 'MESSAGE_RECALLED');

  const removed = await db
    .delete(messageReactions)
    .where(
      and(
        eq(messageReactions.messageId, messageId),
        eq(messageReactions.userId, userId),
        eq(messageReactions.emoji, emoji),
      ),
    )
    .returning({ messageId: messageReactions.messageId });
  if (removed.length === 0) {
    await db.insert(messageReactions).values({ messageId, userId, emoji }).onConflictDoNothing();
  }

  const reactions = (await summarizeReactions(db, [messageId])).get(messageId) ?? [];
  io.to(conversationRoom(conversationId)).emit('message:reactions', {
    conversationId,
    messageId,
    reactions,
  });
  return reactions;
}
