import { z } from 'zod';
import { LIMITS } from '../constants';

const positiveId = z.number().int().positive();
const coercedId = z.coerce.number().int().positive();

const sendTextSchema = z.object({
  conversationId: positiveId,
  clientId: z.uuid('clientId 必须是 UUID'),
  type: z.literal('text'),
  content: z
    .string()
    .trim()
    .min(1, '消息不能为空')
    .max(LIMITS.messageText.max, `消息最多 ${LIMITS.messageText.max} 字`),
});

/** 图片消息：先走上传接口拿到 key，再把 key 发过来 */
const sendImageSchema = z.object({
  conversationId: positiveId,
  clientId: z.uuid('clientId 必须是 UUID'),
  type: z.literal('image'),
  attachmentKey: z.string().min(1).max(200),
});

export const sendMessageSchema = z.discriminatedUnion('type', [sendTextSchema, sendImageSchema]);
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

const groupNameSchema = z
  .string()
  .trim()
  .min(1, '请输入群名')
  .max(LIMITS.groupName.max, `群名最多 ${LIMITS.groupName.max} 字`);

export const createGroupConversationSchema = z.object({
  type: z.literal('group'),
  name: groupNameSchema,
  /** 不含创建者自己，必须都是创建者的好友 */
  memberIds: z
    .array(positiveId)
    .min(1, '至少选择一位好友')
    .max(LIMITS.groupMembers.max - 1, `群成员最多 ${LIMITS.groupMembers.max} 人`),
});
export type CreateGroupConversationInput = z.infer<typeof createGroupConversationSchema>;

export const createConversationSchema = z.discriminatedUnion('type', [
  createDirectConversationSchema,
  createGroupConversationSchema,
]);
export type CreateConversationInput = z.infer<typeof createConversationSchema>;

export const updateConversationSchema = z.object({ name: groupNameSchema });
export type UpdateConversationInput = z.infer<typeof updateConversationSchema>;

export const addMembersSchema = z.object({
  userIds: z.array(positiveId).min(1, '至少选择一位好友').max(LIMITS.groupMembers.max),
});
export type AddMembersInput = z.infer<typeof addMembersSchema>;

export const memberParamsSchema = z.object({ id: coercedId, userId: coercedId });
