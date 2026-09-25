import type { ConversationView } from '@beechat/shared';
import { t } from '@/i18n/zh-CN';

/** 会话显示名：私聊用对方的显示名，群聊用群名 */
export function conversationName(conversation: ConversationView): string {
  return conversation.peer?.displayName ?? conversation.name ?? t.chat.groupFallbackName;
}
