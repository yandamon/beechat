import type { ConversationView, MessagePage, MessageView } from '@beechat/shared';
import type { InfiniteData, QueryClient } from '@tanstack/react-query';
import type { FriendView } from '@beechat/shared';

export const queryKeys = {
  conversations: ['conversations'] as const,
  messages: (conversationId: number) => ['messages', conversationId] as const,
  allMessages: ['messages'] as const,
  friends: ['friends', 'list'] as const,
  friendRequests: ['friends', 'requests'] as const,
  userSearch: (q: string) => ['users', 'search', q] as const,
};

/** 本地消息在服务端消息之上多两个状态位：发送中、发送失败 */
export interface LocalMessage extends MessageView {
  pending?: boolean;
  failed?: boolean;
}

export type MessagesData = InfiniteData<MessagePage, unknown>;

/** 页面数组里 pages[0] 是最新一页，渲染时要倒过来再拍平 */
export function flattenMessages(data: MessagesData | undefined): LocalMessage[] {
  if (!data) return [];
  return [...data.pages].reverse().flatMap((page) => page.messages as LocalMessage[]);
}

/** 追加或按 clientId 替换一条消息；历史还没加载时什么都不做 */
export function appendMessage(queryClient: QueryClient, message: LocalMessage) {
  queryClient.setQueryData<MessagesData>(queryKeys.messages(message.conversationId), (data) => {
    if (!data || data.pages.length === 0) return data;
    const [latest, ...older] = data.pages;
    if (!latest) return data;
    const kept = latest.messages.filter((entry) => entry.clientId !== message.clientId);
    return { ...data, pages: [{ ...latest, messages: [...kept, message] }, ...older] };
  });
}

export function markMessageFailed(
  queryClient: QueryClient,
  conversationId: number,
  clientId: string,
) {
  queryClient.setQueryData<MessagesData>(queryKeys.messages(conversationId), (data) => {
    if (!data) return data;
    return {
      ...data,
      pages: data.pages.map((page) => ({
        ...page,
        messages: page.messages.map((entry) =>
          entry.clientId === clientId
            ? ({ ...entry, pending: false, failed: true } satisfies LocalMessage)
            : entry,
        ),
      })),
    };
  });
}

/** 置顶的排最前，其余按最后一条消息时间倒序 */
export function sortConversations(list: ConversationView[]): ConversationView[] {
  return [...list].sort((a, b) => {
    if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
    return (b.lastMessageAt ?? b.createdAt).localeCompare(a.lastMessageAt ?? a.createdAt);
  });
}

export function upsertConversation(queryClient: QueryClient, view: ConversationView) {
  queryClient.setQueryData<ConversationView[]>(queryKeys.conversations, (list) =>
    sortConversations([view, ...(list ?? []).filter((entry) => entry.id !== view.id)]),
  );
}

/**
 * 一条新消息到达后更新会话列表：最后一条消息、排序、未读数。
 * 会话还不在列表里时重新拉取整个列表。
 */
export function applyMessageToConversations(
  queryClient: QueryClient,
  message: MessageView,
  options: { meId: number; isActive: boolean },
) {
  let found = false;
  queryClient.setQueryData<ConversationView[]>(queryKeys.conversations, (list) => {
    if (!list) return list;
    const next = list.map((conversation) => {
      if (conversation.id !== message.conversationId) return conversation;
      found = true;
      const isOwn = message.senderId === options.meId;
      const countsAsUnread = !isOwn && !options.isActive;
      return {
        ...conversation,
        lastMessage: message,
        lastMessageAt: message.createdAt,
        // 自己发了消息就等于看完了这个会话；活跃会话的未读由已读上报归零
        unreadCount: isOwn
          ? 0
          : countsAsUnread
            ? conversation.unreadCount + 1
            : conversation.unreadCount,
        lastReadMessageId:
          isOwn || options.isActive
            ? Math.max(conversation.lastReadMessageId ?? 0, message.id)
            : conversation.lastReadMessageId,
      };
    });
    return sortConversations(next);
  });
  if (!found) void queryClient.invalidateQueries({ queryKey: queryKeys.conversations });
}

export function markConversationRead(
  queryClient: QueryClient,
  conversationId: number,
  messageId: number,
) {
  queryClient.setQueryData<ConversationView[]>(queryKeys.conversations, (list) =>
    list?.map((conversation) =>
      conversation.id === conversationId
        ? {
            ...conversation,
            unreadCount: 0,
            lastReadMessageId: Math.max(conversation.lastReadMessageId ?? 0, messageId),
          }
        : conversation,
    ),
  );
}

export function setUserOnline(
  queryClient: QueryClient,
  userId: number,
  online: boolean,
  lastSeenAt: string | null,
) {
  queryClient.setQueryData<ConversationView[]>(queryKeys.conversations, (list) =>
    list?.map((conversation) =>
      conversation.peer?.id === userId
        ? { ...conversation, peer: { ...conversation.peer, online } }
        : conversation,
    ),
  );
  queryClient.setQueryData<FriendView[]>(queryKeys.friends, (list) =>
    list?.map((friend) =>
      friend.id === userId
        ? { ...friend, online, lastSeenAt: lastSeenAt ?? friend.lastSeenAt }
        : friend,
    ),
  );
}

/** 被移出群聊或群解散：从列表和消息缓存里删掉 */
export function removeConversation(queryClient: QueryClient, conversationId: number) {
  queryClient.setQueryData<ConversationView[]>(queryKeys.conversations, (list) =>
    list?.filter((conversation) => conversation.id !== conversationId),
  );
  queryClient.removeQueries({ queryKey: queryKeys.messages(conversationId) });
}

/** 对方读到了某条消息：更新私聊会话里的对方已读位置 */
export function applyPeerRead(
  queryClient: QueryClient,
  conversationId: number,
  userId: number,
  messageId: number,
) {
  queryClient.setQueryData<ConversationView[]>(queryKeys.conversations, (list) =>
    list?.map((conversation) =>
      conversation.id === conversationId && conversation.peer?.id === userId
        ? {
            ...conversation,
            peerLastReadMessageId: Math.max(conversation.peerLastReadMessageId ?? 0, messageId),
          }
        : conversation,
    ),
  );
}

/** 撤回等变更：按 clientId 替换消息，并同步会话列表里的最后一条 */
export function replaceMessage(queryClient: QueryClient, message: MessageView) {
  queryClient.setQueryData<MessagesData>(queryKeys.messages(message.conversationId), (data) => {
    if (!data) return data;
    return {
      ...data,
      pages: data.pages.map((page) => ({
        ...page,
        messages: page.messages.map((entry) =>
          entry.clientId === message.clientId ? message : entry,
        ),
      })),
    };
  });
  queryClient.setQueryData<ConversationView[]>(queryKeys.conversations, (list) =>
    list?.map((conversation) =>
      conversation.id === message.conversationId && conversation.lastMessage?.id === message.id
        ? { ...conversation, lastMessage: message }
        : conversation,
    ),
  );
}
