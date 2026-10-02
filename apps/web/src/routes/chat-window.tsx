import { useQueryClient } from '@tanstack/react-query';
import { Bell, BellOff, ChevronLeft, Ellipsis, Flag, Info, Pin, PinOff } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router';
import { ActionSheet, type SheetAction } from '@/components/action-sheet';
import { Composer, type QuoteBar } from '@/components/chat/composer';
import { GroupInfoDialog } from '@/components/chat/group-info-dialog';
import { MessageList } from '@/components/chat/message-list';
import { ReportDialog, type ReportTarget } from '@/components/report-dialog';
import { UserAvatar } from '@/components/user-avatar';
import { buttonVariants } from '@/components/ui/button';
import { useMe } from '@/features/auth/use-auth';
import { type LocalMessage, flattenMessages, markConversationRead } from '@/features/chat/cache';
import { conversationName } from '@/features/chat/names';
import {
  useConversations,
  useFriends,
  useMessages,
  useRecallMessage,
  useToggleReaction,
  useUpdateMembership,
} from '@/features/chat/queries';
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
  const { send, sendImage, retry } = useSendMessage(conversationId, meId);
  const recall = useRecallMessage(conversationId);
  const membership = useUpdateMembership(conversationId);
  const reaction = useToggleReaction(conversationId);
  const [replyTarget, setReplyTarget] = useState<LocalMessage | null>(null);
  const [reportTarget, setReportTarget] = useState<ReportTarget | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [groupInfoOpen, setGroupInfoOpen] = useState(false);

  // 切换会话时清掉正在回复的消息和开着的弹层
  useEffect(() => {
    setReplyTarget(null);
    setReportTarget(null);
    setMenuOpen(false);
    setGroupInfoOpen(false);
  }, [conversationId]);

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

  // 群里按成员表把发送者 id 换成名字；已退群的人显示统一的占位
  const memberNames = useMemo(
    () => new Map(conversation?.members.map((member) => [member.id, member.displayName]) ?? []),
    [conversation?.members],
  );

  const nameOf = (senderId: number | null) => {
    if (senderId === meId) return t.chat.me;
    if (senderId === null) return t.chat.formerMember;
    return memberNames.get(senderId) ?? t.chat.formerMember;
  };
  const quote: QuoteBar | null = replyTarget
    ? {
        name: nameOf(replyTarget.senderId),
        preview:
          replyTarget.type === 'image'
            ? t.chat.imageMessage
            : (replyTarget.content ?? t.chat.quotedDeleted),
      }
    : null;

  if (conversations.isPending) {
    return (
      <p className="p-6 pt-[calc(env(safe-area-inset-top)+1.5rem)] text-sm text-muted-foreground">
        {t.common.loading}
      </p>
    );
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

  const isGroup = conversation.type === 'group';
  const peer = conversation.peer;
  const title = conversationName(conversation);
  const stillFriends =
    isGroup || !friends.isSuccess || friends.data.some((friend) => friend.id === peer?.id);

  let statusLine: string;
  if (typingUsers.length > 0) {
    statusLine = isGroup
      ? t.chat.typingNames(
          typingUsers.map((id) => memberNames.get(id) ?? t.chat.formerMember).join('、'),
        )
      : t.chat.typing;
  } else if (isGroup) {
    statusLine = t.chat.memberCount(conversation.members.length);
  } else {
    statusLine = peer?.online ? t.chat.online : t.chat.offline;
  }

  const togglePinned = () => membership.mutate({ pinned: !conversation.pinned });
  const toggleMuted = () => membership.mutate({ muted: !conversation.muted });
  const reportPeer = () => {
    if (peer) setReportTarget({ userId: peer.id, name: peer.displayName });
  };

  // 手机上标题栏放不下一排图标，收进“更多”里；这里的图标表示点了之后会发生什么
  const menuActions: SheetAction[] = [
    {
      key: 'pin',
      label: conversation.pinned ? t.chat.unpin : t.chat.pin,
      icon: conversation.pinned ? PinOff : Pin,
      onSelect: togglePinned,
    },
    {
      key: 'mute',
      label: conversation.muted ? t.chat.unmute : t.chat.mute,
      icon: conversation.muted ? Bell : BellOff,
      onSelect: toggleMuted,
    },
  ];
  if (isGroup) {
    menuActions.push({
      key: 'info',
      label: t.group.info,
      icon: Info,
      onSelect: () => setGroupInfoOpen(true),
    });
  } else if (peer) {
    menuActions.push({
      key: 'report',
      label: t.report.action,
      icon: Flag,
      destructive: true,
      onSelect: reportPeer,
    });
  }

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col">
      <header className="shrink-0 border-b border-border pt-safe md:pt-0">
        <div className="flex h-14 items-center gap-1 px-1 md:h-12 md:gap-2 md:px-4">
          <Link
            to="/"
            aria-label={t.common.back}
            className={cn(buttonVariants({ variant: 'ghost', size: 'icon-lg' }), 'md:hidden')}
          >
            <ChevronLeft className="size-6" />
          </Link>
          <UserAvatar
            name={title}
            seed={peer?.id ?? conversation.id}
            src={peer?.avatarUrl ?? conversation.avatarUrl}
            className="size-9 md:size-8"
          />
          <div className="ml-1 min-w-0 flex-1 md:ml-0">
            <p className="truncate text-base font-semibold md:text-sm">{title}</p>
            <p
              className={cn(
                'truncate text-xs',
                typingUsers.length > 0 ? 'text-primary' : 'text-muted-foreground',
              )}
            >
              {statusLine}
            </p>
          </div>
          {/* 桌面：操作一字排开，图标表示当前状态 */}
          <div className="hidden items-center gap-1 md:flex">
            <button
              type="button"
              onClick={togglePinned}
              disabled={membership.isPending}
              className={cn(buttonVariants({ variant: 'ghost', size: 'icon' }))}
              aria-label={conversation.pinned ? t.chat.unpin : t.chat.pin}
              title={conversation.pinned ? t.chat.unpin : t.chat.pin}
              aria-pressed={conversation.pinned}
            >
              {conversation.pinned ? <PinOff /> : <Pin />}
            </button>
            <button
              type="button"
              onClick={toggleMuted}
              disabled={membership.isPending}
              className={cn(buttonVariants({ variant: 'ghost', size: 'icon' }))}
              aria-label={conversation.muted ? t.chat.unmute : t.chat.mute}
              title={conversation.muted ? t.chat.unmute : t.chat.mute}
              aria-pressed={conversation.muted}
            >
              {conversation.muted ? <BellOff /> : <Bell />}
            </button>
            {isGroup ? (
              <button
                type="button"
                onClick={() => setGroupInfoOpen(true)}
                className={cn(buttonVariants({ variant: 'ghost', size: 'icon' }))}
                aria-label={t.group.info}
                title={t.group.info}
              >
                <Info />
              </button>
            ) : peer ? (
              <button
                type="button"
                onClick={reportPeer}
                className={cn(buttonVariants({ variant: 'ghost', size: 'icon' }))}
                aria-label={t.report.action}
                title={t.report.action}
              >
                <Flag />
              </button>
            ) : null}
          </div>
          {/* 手机：一个“更多” */}
          <button
            type="button"
            onClick={() => setMenuOpen(true)}
            className={cn(buttonVariants({ variant: 'ghost', size: 'icon-lg' }), 'md:hidden')}
            aria-label={t.common.more}
          >
            <Ellipsis className="size-6" />
          </button>
        </div>
      </header>
      <ActionSheet open={menuOpen} onOpenChange={setMenuOpen} title={title} actions={menuActions} />
      {isGroup ? (
        <GroupInfoDialog
          conversation={conversation}
          meId={meId}
          open={groupInfoOpen}
          onOpenChange={setGroupInfoOpen}
        />
      ) : null}
      <ReportDialog target={reportTarget} onClose={() => setReportTarget(null)} />

      <MessageList
        key={conversationId}
        messages={messages}
        meId={meId}
        senderName={isGroup ? (id) => memberNames.get(id) ?? t.chat.formerMember : undefined}
        peerLastReadMessageId={isGroup ? null : conversation.peerLastReadMessageId}
        isPending={messagesQuery.isPending}
        hasMore={messagesQuery.hasNextPage}
        isFetchingMore={messagesQuery.isFetchingNextPage}
        onLoadMore={() => void messagesQuery.fetchNextPage()}
        onRetry={retry}
        onRecall={(message) => recall.mutate(message.id)}
        onReply={setReplyTarget}
        onReact={(message, emoji) => reaction.mutate({ messageId: message.id, emoji })}
        onReport={(message) => {
          if (message.senderId === null) return;
          setReportTarget({
            userId: message.senderId,
            name: nameOf(message.senderId),
            messageId: message.id,
            preview: message.type === 'image' ? t.chat.imageMessage : (message.content ?? ''),
          });
        }}
        nameOf={nameOf}
      />

      <Composer
        conversationId={conversationId}
        onSend={(content) => {
          send(
            content,
            replyTarget
              ? {
                  id: replyTarget.id,
                  senderId: replyTarget.senderId,
                  type: replyTarget.type,
                  content: replyTarget.content,
                  deleted: replyTarget.deletedAt !== null,
                }
              : null,
          );
          setReplyTarget(null);
        }}
        onSendImage={sendImage}
        quote={quote}
        onCancelQuote={() => setReplyTarget(null)}
        disabled={!stillFriends}
        disabledHint={t.chat.notFriendsAnymore}
      />
    </div>
  );
}
