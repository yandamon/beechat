import { ALLOWED_REACTIONS, type AttachmentView, LIMITS } from '@beechat/shared';
import { Copy, Flag, Reply, SmilePlus, Undo2 } from 'lucide-react';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { ActionSheet, type SheetAction } from '@/components/action-sheet';
import { Dialog, DialogContent, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import type { LocalMessage } from '@/features/chat/cache';
import { t } from '@/i18n/zh-CN';
import { formatMessageTime } from '@/lib/format';
import { useLongPress } from '@/lib/use-pointer';
import { cn } from '@/lib/utils';

interface MessageListProps {
  messages: LocalMessage[];
  meId: number;
  /** 群聊里给别人的消息标上名字；私聊不传 */
  senderName?: (senderId: number) => string;
  /** 私聊里对方读到的位置，用于“已读” */
  peerLastReadMessageId?: number | null;
  isPending: boolean;
  hasMore: boolean;
  isFetchingMore: boolean;
  onLoadMore: () => void;
  onRetry: (message: LocalMessage) => void;
  onRecall: (message: LocalMessage) => void;
  onReply: (message: LocalMessage) => void;
  onReact: (message: LocalMessage, emoji: string) => void;
  /** 举报别人发的消息 */
  onReport: (message: LocalMessage) => void;
  /** 把发送者 id 变成名字，引用块和群消息都用它 */
  nameOf: (senderId: number | null) => string;
}

/** 已经发到服务器的消息才能回应、回复、撤回、举报 */
function isActionable(message: LocalMessage) {
  return !message.pending && !message.failed && message.id > 0;
}

function canRecall(message: LocalMessage, mine: boolean) {
  return (
    mine &&
    isActionable(message) &&
    Date.now() - new Date(message.createdAt).getTime() < LIMITS.recallWindowMs
  );
}

function copyText(text: string) {
  try {
    // 非 https 的页面上没有 clipboard，直接放弃
    navigator.clipboard.writeText(text).catch(() => undefined);
  } catch {
    /* 复制失败不值得打扰用户 */
  }
}

/**
 * 消息列表：默认贴住底部，用户往上翻时不再自动滚动；
 * 滚到顶部附近加载更早的消息，并保持视口位置不跳。
 *
 * 消息的操作有两套入口：有鼠标的设备上悬停消息出现小图标；
 * 触屏上长按消息，从底部弹出操作层（表情回应、回复、复制、撤回、举报）。
 */
export function MessageList({
  messages,
  meId,
  senderName,
  peerLastReadMessageId,
  isPending,
  hasMore,
  isFetchingMore,
  onLoadMore,
  onRetry,
  onRecall,
  onReply,
  onReact,
  onReport,
  nameOf,
}: MessageListProps) {
  const listRef = useRef<HTMLDivElement>(null);
  const stickToBottomRef = useRef(true);
  const prevFirstIdRef = useRef<number | undefined>(undefined);
  const prevHeightRef = useRef(0);
  // 长按选中的消息；关闭弹层时先留着，等收起动画放完
  const [actionTargetId, setActionTargetId] = useState<string | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [sheetOpenedAt, setSheetOpenedAt] = useState(0);

  useLayoutEffect(() => {
    const element = listRef.current;
    if (!element) return;
    const firstId = messages[0]?.id;
    const last = messages[messages.length - 1];
    const prependedOlder =
      prevFirstIdRef.current !== undefined &&
      firstId !== undefined &&
      firstId < prevFirstIdRef.current;
    // 自己刚发出的消息永远滚到底
    const justSentByMe = last?.senderId === meId && last.pending === true;

    if (prependedOlder) {
      element.scrollTop += element.scrollHeight - prevHeightRef.current;
    } else if (stickToBottomRef.current || justSentByMe) {
      element.scrollTop = element.scrollHeight;
      stickToBottomRef.current = true;
    }
    prevFirstIdRef.current = firstId;
    prevHeightRef.current = element.scrollHeight;
  }, [messages, meId]);

  // 键盘弹出、输入框长高都会让列表变矮：原本贴着底部的话继续贴着，最新消息不被挡住
  useEffect(() => {
    const element = listRef.current;
    if (!element || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(() => {
      if (stickToBottomRef.current) element.scrollTop = element.scrollHeight;
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const handleScroll = () => {
    const element = listRef.current;
    if (!element) return;
    const distanceToBottom = element.scrollHeight - element.scrollTop - element.clientHeight;
    stickToBottomRef.current = distanceToBottom < 48;
    if (element.scrollTop < 80 && hasMore && !isFetchingMore) onLoadMore();
  };

  // “已读”只标在对方已读范围内、我发出的最后一条消息上
  const lastReadOwnId = [...messages]
    .reverse()
    .find(
      (message) =>
        message.senderId === meId &&
        message.id > 0 &&
        peerLastReadMessageId !== undefined &&
        peerLastReadMessageId !== null &&
        message.id <= peerLastReadMessageId,
    )?.id;

  const actionTarget = messages.find((message) => message.clientId === actionTargetId) ?? null;
  const sheetActions: SheetAction[] = [];
  if (actionTarget) {
    const target = actionTarget;
    const mine = target.senderId === meId;
    sheetActions.push({
      key: 'reply',
      label: t.chat.reply,
      icon: Reply,
      onSelect: () => onReply(target),
    });
    if (target.type === 'text' && target.content) {
      const content = target.content;
      sheetActions.push({
        key: 'copy',
        label: t.chat.copy,
        icon: Copy,
        onSelect: () => copyText(content),
      });
    }
    if (canRecall(target, mine)) {
      sheetActions.push({
        key: 'recall',
        label: t.chat.recall,
        icon: Undo2,
        onSelect: () => onRecall(target),
      });
    }
    if (!mine && target.senderId !== null) {
      sheetActions.push({
        key: 'report',
        label: t.report.action,
        icon: Flag,
        destructive: true,
        onSelect: () => onReport(target),
      });
    }
  }

  return (
    <div
      ref={listRef}
      onScroll={handleScroll}
      className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 py-3 md:px-4"
    >
      {isPending ? (
        <p className="py-6 text-center text-sm text-muted-foreground">{t.common.loading}</p>
      ) : (
        <p className="py-2 text-center text-xs text-muted-foreground">
          {isFetchingMore ? t.chat.loadingEarlier : hasMore ? '' : t.chat.beginning}
        </p>
      )}
      <ol className="space-y-2">
        {messages.map((message, index) => {
          const mine = message.senderId === meId;
          const previous = messages[index - 1];
          // 同一个人连续发的消息只在第一条上标名字
          const showName =
            senderName !== undefined &&
            !mine &&
            message.senderId !== null &&
            message.type !== 'system' &&
            previous?.senderId !== message.senderId;
          const name = showName && message.senderId !== null ? senderName(message.senderId) : null;
          return (
            <li key={message.clientId}>
              {message.type === 'system' ? (
                <SystemMessage content={message.content ?? ''} />
              ) : message.deletedAt ? (
                <SystemMessage
                  content={
                    mine
                      ? t.chat.recalledMine
                      : t.chat.recalledOther(
                          senderName && message.senderId !== null
                            ? senderName(message.senderId)
                            : t.chat.peer,
                        )
                  }
                />
              ) : (
                <Bubble
                  message={message}
                  mine={mine}
                  name={name}
                  read={message.id === lastReadOwnId}
                  onRetry={onRetry}
                  onRecall={onRecall}
                  onReply={onReply}
                  onReact={onReact}
                  onReport={onReport}
                  onLongPress={(target) => {
                    setActionTargetId(target.clientId);
                    setSheetOpenedAt(Date.now());
                    setSheetOpen(true);
                  }}
                  nameOf={nameOf}
                  meId={meId}
                />
              )}
            </li>
          );
        })}
      </ol>
      <ActionSheet
        open={sheetOpen && actionTarget !== null}
        onOpenChange={setSheetOpen}
        title={actionTarget?.type === 'image' ? t.chat.imageMessage : (actionTarget?.content ?? '')}
        actions={sheetActions}
        ignoreOutsidePressBefore={sheetOpenedAt + 400}
      >
        {actionTarget ? (
          <div className="flex justify-between px-2 pb-1">
            {ALLOWED_REACTIONS.map((emoji) => {
              const reacted = actionTarget.reactions.some(
                (reaction) => reaction.emoji === emoji && reaction.userIds.includes(meId),
              );
              return (
                <button
                  key={emoji}
                  type="button"
                  aria-pressed={reacted}
                  onClick={() => {
                    setSheetOpen(false);
                    onReact(actionTarget, emoji);
                  }}
                  className={cn(
                    'flex size-11 items-center justify-center rounded-full text-2xl outline-none focus-visible:ring-2 focus-visible:ring-ring/50 active:scale-90',
                    reacted ? 'bg-primary/15 ring-1 ring-primary' : 'bg-muted',
                  )}
                >
                  {emoji}
                </button>
              );
            })}
          </div>
        ) : null}
      </ActionSheet>
    </div>
  );
}

function SystemMessage({ content }: { content: string }) {
  return (
    <p className="py-1 text-center text-xs text-muted-foreground">
      <span className="inline-block rounded-full bg-muted px-3 py-1">{content}</span>
    </p>
  );
}

const IMAGE_MAX_WIDTH = 280;
const IMAGE_MAX_HEIGHT = 320;

/** 图片按比例缩到气泡里，点开看大图；尺寸未知（本地预览）时交给浏览器 */
function ImageAttachment({
  attachment,
  pending,
}: {
  attachment: AttachmentView;
  pending?: boolean;
}) {
  let style: { width?: number; height?: number } = {};
  if (attachment.width > 0 && attachment.height > 0) {
    const scale = Math.min(
      1,
      IMAGE_MAX_WIDTH / attachment.width,
      IMAGE_MAX_HEIGHT / attachment.height,
    );
    style = {
      width: Math.round(attachment.width * scale),
      height: Math.round(attachment.height * scale),
    };
  }
  return (
    <Dialog>
      <DialogTrigger
        className={cn(
          'block overflow-hidden rounded-xl bg-muted outline-none focus-visible:ring-2 focus-visible:ring-ring/50',
          pending && 'opacity-70',
        )}
        aria-label={t.chat.openImage}
      >
        <img
          src={attachment.url}
          alt={t.chat.imageAlt}
          width={style.width}
          height={style.height}
          loading="lazy"
          draggable={false}
          className="block h-auto max-h-80 max-w-full object-cover [-webkit-touch-callout:none]"
        />
      </DialogTrigger>
      <DialogContent
        variant="center"
        showCloseButton
        className="max-w-[92vw] bg-transparent p-0 shadow-none ring-0 sm:max-w-[92vw]"
      >
        <DialogTitle className="sr-only">{t.chat.imageAlt}</DialogTitle>
        <img
          src={attachment.url}
          alt={t.chat.imageAlt}
          className="mx-auto max-h-[88dvh] max-w-full rounded-lg object-contain"
        />
      </DialogContent>
    </Dialog>
  );
}

/** 引用块里显示的摘要 */
function quotePreview(reply: NonNullable<LocalMessage['replyTo']>): string {
  if (reply.deleted) return t.chat.quotedDeleted;
  if (reply.type === 'image') return t.chat.imageMessage;
  return reply.content ?? '';
}

const HOVER_ACTION_CLASS =
  'rounded-md p-1 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 hover:bg-muted focus-visible:opacity-100';

function Bubble({
  message,
  mine,
  name,
  read,
  onRetry,
  onRecall,
  onReply,
  onReact,
  onReport,
  onLongPress,
  nameOf,
  meId,
}: {
  message: LocalMessage;
  mine: boolean;
  name: string | null;
  read: boolean;
  onRetry: (message: LocalMessage) => void;
  onRecall: (message: LocalMessage) => void;
  onReply: (message: LocalMessage) => void;
  onReact: (message: LocalMessage, emoji: string) => void;
  onReport: (message: LocalMessage) => void;
  onLongPress: (message: LocalMessage) => void;
  nameOf: (senderId: number | null) => string;
  meId: number;
}) {
  const isImage = message.type === 'image' && message.attachment !== null;
  const actionable = isActionable(message);
  const longPress = useLongPress(() => {
    if (actionable) onLongPress(message);
  });

  return (
    <div className={cn('group flex flex-col gap-1', mine ? 'items-end' : 'items-start')}>
      {name ? <span className="px-1 text-xs text-muted-foreground">{name}</span> : null}
      {/* 这一行占满整行宽度，气泡的最大宽度才是按消息区的宽度算，而不是按它自己 */}
      <div className={cn('flex w-full items-end gap-1', mine && 'flex-row-reverse')}>
        {/* 触屏上长按出操作层，所以不让系统选中文字（复制在操作层里）；有鼠标时照常可选 */}
        <div
          {...longPress}
          className="max-w-[82%] min-w-0 select-none [-webkit-touch-callout:none] md:max-w-[75%] mouse:select-text"
        >
          {isImage && message.attachment ? (
            <ImageAttachment attachment={message.attachment} pending={message.pending} />
          ) : (
            <div
              className={cn(
                'rounded-2xl px-3.5 py-2 text-[15px] leading-relaxed break-words whitespace-pre-wrap mouse:text-sm mouse:leading-normal',
                mine
                  ? 'rounded-br-md bg-primary text-primary-foreground'
                  : 'rounded-bl-md bg-muted text-foreground',
                message.pending && 'opacity-70',
              )}
            >
              {message.replyTo ? (
                <div
                  className={cn(
                    'mb-1.5 rounded-lg border-l-2 px-2 py-1 text-xs',
                    mine
                      ? 'border-primary-foreground/60 bg-primary-foreground/15'
                      : 'border-primary bg-background/60',
                  )}
                >
                  <p className="font-medium">{nameOf(message.replyTo.senderId)}</p>
                  <p className="line-clamp-2 opacity-80">{quotePreview(message.replyTo)}</p>
                </div>
              ) : null}
              {message.content}
            </div>
          )}
        </div>
        {actionable ? (
          // 悬停才出现的小图标只给有鼠标的设备；触屏上整块不渲染出来，免得点到看不见的按钮
          <div className={cn('hidden items-center gap-1 mouse:flex', mine && 'flex-row-reverse')}>
            <Popover>
              <PopoverTrigger
                title={t.chat.react}
                aria-label={t.chat.react}
                className={cn(HOVER_ACTION_CLASS, 'data-open:opacity-100')}
              >
                <SmilePlus className="size-3.5" />
              </PopoverTrigger>
              <PopoverContent
                side="top"
                align={mine ? 'end' : 'start'}
                className="w-auto flex-row gap-0.5 p-1"
              >
                {ALLOWED_REACTIONS.map((emoji) => (
                  <button
                    key={emoji}
                    type="button"
                    onClick={() => onReact(message, emoji)}
                    className="flex size-8 items-center justify-center rounded-md text-lg hover:bg-muted"
                  >
                    {emoji}
                  </button>
                ))}
              </PopoverContent>
            </Popover>
            <button
              type="button"
              onClick={() => onReply(message)}
              title={t.chat.reply}
              aria-label={t.chat.reply}
              className={HOVER_ACTION_CLASS}
            >
              <Reply className="size-3.5" />
            </button>
            {!mine && message.senderId !== null ? (
              <button
                type="button"
                onClick={() => onReport(message)}
                title={t.report.action}
                aria-label={t.report.action}
                className={HOVER_ACTION_CLASS}
              >
                <Flag className="size-3.5" />
              </button>
            ) : null}
            {canRecall(message, mine) ? (
              <button
                type="button"
                onClick={() => onRecall(message)}
                title={t.chat.recall}
                aria-label={t.chat.recall}
                className={HOVER_ACTION_CLASS}
              >
                <Undo2 className="size-3.5" />
              </button>
            ) : null}
          </div>
        ) : null}
      </div>
      {message.reactions.length > 0 ? (
        <div className={cn('flex flex-wrap gap-1', mine ? 'justify-end' : 'justify-start')}>
          {message.reactions.map((reaction) => {
            const reacted = reaction.userIds.includes(meId);
            return (
              <button
                key={reaction.emoji}
                type="button"
                onClick={() => onReact(message, reaction.emoji)}
                aria-pressed={reacted}
                className={cn(
                  'flex items-center gap-1 rounded-full border px-2.5 py-1 text-sm transition-colors mouse:px-2 mouse:py-0.5 mouse:text-xs',
                  reacted
                    ? 'border-primary bg-primary/10 text-foreground'
                    : 'border-border bg-background text-muted-foreground hover:bg-muted',
                )}
              >
                <span>{reaction.emoji}</span>
                <span>{reaction.count}</span>
              </button>
            );
          })}
        </div>
      ) : null}
      <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
        {message.failed ? (
          <>
            <span className="text-destructive">{isImage ? t.chat.imageFailed : t.chat.failed}</span>
            <button
              type="button"
              className="-my-2 py-2 underline underline-offset-2"
              onClick={() => onRetry(message)}
            >
              {t.chat.retry}
            </button>
          </>
        ) : message.pending ? (
          <span>{isImage ? t.chat.uploading : t.chat.sending}</span>
        ) : (
          <>
            <time dateTime={message.createdAt}>{formatMessageTime(message.createdAt)}</time>
            {read ? <span>{t.chat.read}</span> : null}
          </>
        )}
      </div>
    </div>
  );
}
