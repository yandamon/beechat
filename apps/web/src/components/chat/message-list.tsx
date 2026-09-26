import { ALLOWED_REACTIONS, type AttachmentView, LIMITS } from '@beechat/shared';
import { Flag, Reply, SmilePlus, Undo2 } from 'lucide-react';
import { useLayoutEffect, useRef } from 'react';
import { Dialog, DialogContent, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import type { LocalMessage } from '@/features/chat/cache';
import { t } from '@/i18n/zh-CN';
import { formatMessageTime } from '@/lib/format';
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

/**
 * 消息列表：默认贴住底部，用户往上翻时不再自动滚动；
 * 滚到顶部附近加载更早的消息，并保持视口位置不跳。
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

  return (
    <div ref={listRef} onScroll={handleScroll} className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
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
                  nameOf={nameOf}
                  meId={meId}
                />
              )}
            </li>
          );
        })}
      </ol>
    </div>
  );
}

function SystemMessage({ content }: { content: string }) {
  return (
    <p className="py-1 text-center text-xs text-muted-foreground">
      <span className="rounded-full bg-muted px-3 py-1">{content}</span>
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
          className="block max-h-80 max-w-[280px] object-cover"
        />
      </DialogTrigger>
      <DialogContent
        showCloseButton
        className="max-w-[92vw] border-none bg-transparent p-0 shadow-none sm:max-w-[92vw]"
      >
        <DialogTitle className="sr-only">{t.chat.imageAlt}</DialogTitle>
        <img
          src={attachment.url}
          alt={t.chat.imageAlt}
          className="mx-auto max-h-[88vh] max-w-full rounded-lg object-contain"
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
  nameOf: (senderId: number | null) => string;
  meId: number;
}) {
  const isImage = message.type === 'image' && message.attachment !== null;
  const canRecall =
    mine &&
    !message.pending &&
    !message.failed &&
    message.id > 0 &&
    Date.now() - new Date(message.createdAt).getTime() < LIMITS.recallWindowMs;

  return (
    <div className={cn('group flex flex-col gap-1', mine ? 'items-end' : 'items-start')}>
      {name ? <span className="px-1 text-xs text-muted-foreground">{name}</span> : null}
      <div className={cn('flex max-w-full items-end gap-1', mine && 'flex-row-reverse')}>
        {isImage && message.attachment ? (
          <ImageAttachment attachment={message.attachment} pending={message.pending} />
        ) : (
          <div
            className={cn(
              'max-w-[75%] rounded-2xl px-3.5 py-2 text-sm break-words whitespace-pre-wrap',
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
        {!message.pending && !message.failed && message.id > 0 ? (
          <Popover>
            <PopoverTrigger
              title={t.chat.react}
              aria-label={t.chat.react}
              className="rounded-md p-1 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 hover:bg-muted focus-visible:opacity-100 data-open:opacity-100"
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
        ) : null}
        {!message.pending && !message.failed && message.id > 0 ? (
          <button
            type="button"
            onClick={() => onReply(message)}
            title={t.chat.reply}
            aria-label={t.chat.reply}
            className="rounded-md p-1 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 hover:bg-muted focus-visible:opacity-100"
          >
            <Reply className="size-3.5" />
          </button>
        ) : null}
        {!mine &&
        message.senderId !== null &&
        !message.pending &&
        !message.failed &&
        message.id > 0 ? (
          <button
            type="button"
            onClick={() => onReport(message)}
            title={t.report.action}
            aria-label={t.report.action}
            className="rounded-md p-1 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 hover:bg-muted focus-visible:opacity-100"
          >
            <Flag className="size-3.5" />
          </button>
        ) : null}
        {canRecall ? (
          <button
            type="button"
            onClick={() => onRecall(message)}
            title={t.chat.recall}
            aria-label={t.chat.recall}
            className="rounded-md p-1 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 hover:bg-muted focus-visible:opacity-100"
          >
            <Undo2 className="size-3.5" />
          </button>
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
                  'flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs transition-colors',
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
              className="underline underline-offset-2"
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
