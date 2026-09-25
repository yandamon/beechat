import { z } from 'zod';
import { LIMITS } from '../constants';

const positiveId = z.number().int().positive();
const coercedId = z.coerce.number().int().positive();

export const sendMessageSchema = z.object({
  conversationId: positiveId,
  clientId: z.uuid('clientId 必须是 UUID'),
  type: z.literal('text'),
  content: z
    .string()
    .trim()
    .min(1, '消息不能为空')
    .max(LIMITS.messageText.max, `消息最多 ${LIMITS.messageText.max} 字`),
});
export type SendMessageInput = z.infer<typeof sendMessageSchema>;

export const typingSchema = z.object({ conversationId: positiveId });

export const readSchema = z.object({ conversationId: positiveId, messageId: positiveId });

export const conversationIdParamSchema = z.object({ id: coercedId });

/** before：取比它更早的消息；after：取比它更新的消息（重连补拉用）；两者都不传取最新一页 */
export const messagesQuerySchema = z.object({
  before: coercedId.optional(),
  after: z.coerce.number().int().nonnegative().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(LIMITS.historyPageSize),
});
export type MessagesQuery = z.infer<typeof messagesQuerySchema>;

export const createDirectConversationSchema = z.object({
  type: z.literal('direct'),
  userId: positiveId,
});
export type CreateDirectConversationInput = z.infer<typeof createDirectConversationSchema>;
