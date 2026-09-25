import type { MessageView, PublicUser } from '@beechat/shared';
import type { Message, User } from '../db/schema';

export function toPublicUser(user: User): PublicUser {
  return {
    id: user.id,
    username: user.username,
    displayName: user.displayName,
    // 头像地址在对象存储接入后由 avatarKey 生成
    avatarUrl: null,
    createdAt: user.createdAt.toISOString(),
  };
}

export function toMessageView(message: Message): MessageView {
  return {
    id: message.id,
    conversationId: message.conversationId,
    senderId: message.senderId,
    type: message.type,
    content: message.deletedAt ? null : message.content,
    // 图片上传接入后由 attachmentKey 和 attachmentMeta 生成
    attachment: null,
    clientId: message.clientId,
    createdAt: message.createdAt.toISOString(),
    deletedAt: message.deletedAt?.toISOString() ?? null,
  };
}
