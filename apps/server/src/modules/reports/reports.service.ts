import type { CreateReportInput } from '@beechat/shared';
import { and, eq } from 'drizzle-orm';
import type { AppContext } from '../../context';
import { messages, reports, users } from '../../db/schema';
import { AppError } from '../../lib/errors';
import { assertMember } from '../conversations/conversations.service';

/**
 * 记录一条举报。没有后台界面，靠日志和数据库人工处理；
 * 同一个人对同一条消息只记一次，重复提交直接返回已有记录。
 */
export async function createReport(
  ctx: AppContext,
  reporterId: number,
  input: CreateReportInput,
): Promise<{ id: number }> {
  const { db, log } = ctx;
  if (input.targetUserId === reporterId) throw new AppError(400, '不能举报自己', 'SELF_REPORT');
  const [target] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.id, input.targetUserId))
    .limit(1);
  if (!target) throw new AppError(404, '用户不存在', 'USER_NOT_FOUND');

  const messageId = input.messageId ?? null;
  let snapshot: string | null = null;
  if (messageId !== null) {
    const [message] = await db
      .select({
        conversationId: messages.conversationId,
        senderId: messages.senderId,
        type: messages.type,
        content: messages.content,
        attachmentKey: messages.attachmentKey,
      })
      .from(messages)
      .where(eq(messages.id, messageId))
      .limit(1);
    if (!message) throw new AppError(404, '消息不存在', 'MESSAGE_NOT_FOUND');
    await assertMember(db, message.conversationId, reporterId);
    if (message.senderId !== input.targetUserId) {
      throw new AppError(400, '这条消息不是该用户发的', 'MESSAGE_SENDER_MISMATCH');
    }
    snapshot =
      message.type === 'image' ? `[图片] ${message.attachmentKey ?? ''}` : (message.content ?? '');
  }

  const detail = input.detail?.length ? input.detail : null;
  const [inserted] = await db
    .insert(reports)
    .values({
      reporterId,
      targetUserId: input.targetUserId,
      messageId,
      reason: input.reason,
      detail,
      snapshot,
    })
    .onConflictDoNothing()
    .returning({ id: reports.id });
  if (inserted) {
    log.warn(
      {
        reportId: inserted.id,
        reporterId,
        targetUserId: input.targetUserId,
        messageId,
        reason: input.reason,
      },
      'user report received',
    );
    return { id: inserted.id };
  }

  // 只有带消息的举报才会撞上唯一索引：返回之前那条
  if (messageId === null) throw new AppError(500, '举报失败，请稍后再试', 'REPORT_FAILED');
  const [existing] = await db
    .select({ id: reports.id })
    .from(reports)
    .where(and(eq(reports.reporterId, reporterId), eq(reports.messageId, messageId)))
    .limit(1);
  if (!existing) throw new AppError(500, '举报失败，请稍后再试', 'REPORT_FAILED');
  return { id: existing.id };
}
