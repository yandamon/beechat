import type { ConversationView, MessageView } from '@beechat/shared';
import { BellOff, Pin } from 'lucide-react';
import { Link, useMatch } from 'react-router';
import { UserAvatar } from '@/components/user-avatar';
import { buttonVariants } from '@/components/ui/button';
import { conversationName } from '@/features/chat/names';
import { useConversations } from '@/features/chat/queries';
import { t } from '@/i18n/zh-CN';
import { formatListTime } from '@/lib/format';
import { cn } from '@/lib/utils';

function previewOf(message: MessageView | null): string {
  if (!message) return '';
  if (message.deletedAt) return t.chat.recalledPreview;
  if (message.type === 'image') return t.chat.imageMessage;
  return message.content ?? '';
}

export function ConversationList() {
  const conversations = useConversations();
  const match = useMatch('/c/:conversationId');
  const activeId = match ? Number(match.params.conversationId) : null;

  if (conversations.isPending) {
    return <p className="p-4 text-sm text-muted-foreground">{t.common.loading}</p>;
  }
  if (conversations.isError) {
    return <p className="p-4 text-sm text-destructive">{t.common.loadFailed}</p>;
  }
  if (conversations.data.length === 0) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center">
        <p className="font-medium">{t.chat.empty}</p>
        <p className="text-sm text-muted-foreground">{t.chat.emptyHint}</p>
        <Link to="/friends" className={buttonVariants({ variant: 'outline', size: 'sm' })}>
          {t.chat.goFriends}
        </Link>
      </div>
    );
  }

  return (
    <ul className="min-h-0 flex-1 overflow-y-auto">
      {conversations.data.map((conversation) => (
        <ConversationItem
          key={conversation.id}
          conversation={conversation}
          active={conversation.id === activeId}
        />
      ))}
    </ul>
  );
}

function ConversationItem({
  conversation,
  active,
}: {
  conversation: ConversationView;
  active: boolean;
}) {
  const { peer, lastMessage, lastMessageAt, unreadCount, pinned, muted } = conversation;
  return (
    <li>
      <Link
        to={`/c/${conversation.id}`}
        className={cn(
          'flex items-center gap-3 px-4 py-3 transition-colors hover:bg-muted/60',
          active && 'bg-muted',
        )}
      >
        <UserAvatar
          name={conversationName(conversation)}
          seed={peer?.id ?? conversation.id}
          src={peer?.avatarUrl ?? conversation.avatarUrl}
          online={peer?.online}
        />
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between gap-2">
            <span className="flex min-w-0 items-center gap-1 font-medium">
              <span className="truncate">{conversationName(conversation)}</span>
              {pinned ? (
                <Pin className="size-3 shrink-0 text-muted-foreground" aria-label={t.chat.pin} />
              ) : null}
              {muted ? (
                <BellOff
                  className="size-3 shrink-0 text-muted-foreground"
                  aria-label={t.chat.mute}
                />
              ) : null}
            </span>
            {lastMessageAt ? (
              <time className="shrink-0 text-xs text-muted-foreground">
                {formatListTime(lastMessageAt)}
              </time>
            ) : null}
          </div>
          <div className="flex items-center justify-between gap-2">
            <p className="truncate text-sm text-muted-foreground">{previewOf(lastMessage)}</p>
            {unreadCount > 0 ? (
              <span
                className={cn(
                  'flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full px-1.5 text-xs font-semibold',
                  muted ? 'bg-muted text-muted-foreground' : 'bg-primary text-primary-foreground',
                )}
              >
                {t.chat.unreadBadge(unreadCount)}
              </span>
            ) : null}
          </div>
        </div>
      </Link>
    </li>
  );
}
