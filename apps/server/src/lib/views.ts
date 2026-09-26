import type { MessageView, PublicUser, ReactionSummary, ReplyPreview } from '@beechat/shared';
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

const REPLY_SNIPPET_LENGTH = 80;

export function toReplyPreview(message: Message): ReplyPreview {
  const deleted = message.deletedAt !== null;
  return {
    id: message.id,
    senderId: message.senderId,
    type: message.type,
    content: deleted ? null : (message.content?.slice(0, REPLY_SNIPPET_LENGTH) ?? null),
    deleted,
  };
}

export function toMessageView(
  message: Message,
  replyTo: Message | null = null,
  reactions: ReactionSummary[] = [],
): MessageView {
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
    replyTo: replyTo ? toReplyPreview(replyTo) : null,
    reactions,
    clientId: message.clientId,
    createdAt: message.createdAt.toISOString(),
    deletedAt: message.deletedAt?.toISOString() ?? null,
  };
}
