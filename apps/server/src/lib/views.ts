import type { MessageView, PublicUser } from '@beechat/shared';
import type { Message, User } from '../db/schema';
import { publicUrlFor } from '../storage';

export function toPublicUser(user: User): PublicUser {
  return {
    id: user.id,
    username: user.username,
    displayName: user.displayName,
    avatarUrl: user.avatarKey ? publicUrlFor(user.avatarKey) : null,
    createdAt: user.createdAt.toISOString(),
  };
}

export function toMessageView(message: Message): MessageView {
  const meta = message.attachmentMeta;
  const attachment =
    message.attachmentKey && meta && !message.deletedAt
      ? {
          url: publicUrlFor(message.attachmentKey),
          width: meta.width,
          height: meta.height,
          size: meta.size,
          mime: meta.mime,
        }
      : null;
  return {
    id: message.id,
    conversationId: message.conversationId,
    senderId: message.senderId,
    type: message.type,
    content: message.deletedAt ? null : message.content,
    attachment,
    clientId: message.clientId,
    createdAt: message.createdAt.toISOString(),
    deletedAt: message.deletedAt?.toISOString() ?? null,
  };
}
