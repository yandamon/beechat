import { useQueryClient } from '@tanstack/react-query';
import { ChevronLeft } from 'lucide-react';
import { useEffect, useMemo } from 'react';
import { Link, useParams } from 'react-router';
import { Composer } from '@/components/chat/composer';
import { MessageList } from '@/components/chat/message-list';
import { UserAvatar } from '@/components/user-avatar';
import { buttonVariants } from '@/components/ui/button';
import { useMe } from '@/features/auth/use-auth';
import { flattenMessages, markConversationRead } from '@/features/chat/cache';
import { conversationName } from '@/features/chat/names';
import { useConversations, useFriends, useMessages } from '@/features/chat/queries';
import { useActiveConversationStore, useTypingUsers } from '@/features/chat/stores';
import { useSendMessage } from '@/features/chat/use-send-message';
import { t } from '@/i18n/zh-CN';
import { socket } from '@/lib/socket';
import { cn } from '@/lib/utils';

export function ChatWindow() {
  const params = useParams();
  const conversationId = Number(params.conversationId);
  const me = useMe();
  const meId = me.data?.id ?? 0;
  const queryClient = useQueryClient();

  const conversations = useConversations();
  const conversation = conversations.data?.find((entry) => entry.id === conversationId);
  const friends = useFriends();
  const messagesQuery = useMessages(conversationId);
  const messages = useMemo(() => flattenMessages(messagesQuery.data), [messagesQuery.data]);
  const typingUsers = useTypingUsers(conversationId);
  const { send, retry } = useSendMessage(conversationId, meId);

  // 告诉实时同步层当前开着哪个会话，它据此决定新消息算不算未读
  useEffect(() => {
    useActiveConversationStore.getState().set(conversationId);
    return () => useActiveConversationStore.getState().set(null);
  }, [conversationId]);

  // 打开会话、有新消息、或页面重新可见时上报已读位置
  const lastServerMessageId = [...messages].reverse().find((entry) => entry.id > 0)?.id;
  const lastReadMessageId = conversation?.lastReadMessageId ?? 0;
  const unreadCount = conversation?.unreadCount ?? 0;
  useEffect(() => {
    if (!lastServerMessageId) return;
    if (lastServerMessageId <= lastReadMessageId && unreadCount === 0) return;
    const report = () => {
      if (document.visibilityState !== 'visible') return;
      socket.emit('conversation:read', { conversationId, messageId: lastServerMessageId });
      markConversationRead(queryClient, conversationId, lastServerMessageId);
    };
    report();
    document.addEventListener('visibilitychange', report);
    return () => document.removeEventListener('visibilitychange', report);
  }, [conversationId, lastServerMessageId, lastReadMessageId, unreadCount, queryClient]);

  if (conversations.isPending) {
    return <p className="p-6 text-sm text-muted-foreground">{t.common.loading}</p>;
  }
  if (!conversation) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center">
        <p className="text-sm text-muted-foreground">{t.chat.conversationMissing}</p>
        <Link to="/" className={buttonVariants({ variant: 'outline', size: 'sm' })}>
          {t.common.back}
        </Link>
      </div>
    );
  }

  const peer = conversation.peer;
  const stillFriends =
    conversation.type !== 'direct' ||
    !friends.isSuccess ||
    friends.data.some((friend) => friend.id === peer?.id);
  const statusLine =
    typingUsers.length > 0 ? t.chat.typing : peer?.online ? t.chat.online : t.chat.offline;

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col">
      <header className="flex h-12 shrink-0 items-center gap-2 border-b border-border px-2 md:px-4">
        <Link
          to="/"
          aria-label={t.common.back}
          className={cn(buttonVariants({ variant: 'ghost', size: 'icon' }), 'md:hidden')}
        >
          <ChevronLeft />
        </Link>
        <UserAvatar
          name={conversationName(conversation)}
          seed={peer?.id ?? conversation.id}
          className="size-8"
        />
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold">{conversationName(conversation)}</p>
          {peer ? (
            <p
              className={cn(
                'truncate text-xs',
                typingUsers.length > 0 ? 'text-primary' : 'text-muted-foreground',
              )}
            >
              {statusLine}
            </p>
          ) : null}
        </div>
      </header>

      <MessageList
        key={conversationId}
        messages={messages}
        meId={meId}
        isPending={messagesQuery.isPending}
        hasMore={messagesQuery.hasNextPage}
        isFetchingMore={messagesQuery.isFetchingNextPage}
        onLoadMore={() => void messagesQuery.fetchNextPage()}
        onRetry={retry}
      />

      <Composer
        conversationId={conversationId}
        onSend={send}
        disabled={!stillFriends}
        disabledHint={t.chat.notFriendsAnymore}
      />
    </div>
  );
}
