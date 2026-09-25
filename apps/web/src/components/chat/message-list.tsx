import type { AttachmentView } from '@beechat/shared';
import { useLayoutEffect, useRef } from 'react';
import { Dialog, DialogContent, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import type { LocalMessage } from '@/features/chat/cache';
import { t } from '@/i18n/zh-CN';
import { formatMessageTime } from '@/lib/format';
import { cn } from '@/lib/utils';

interface MessageListProps {
  messages: LocalMessage[];
  meId: number;
  /** 群聊里给别人的消息标上名字；私聊不传 */
  senderName?: (senderId: number) => string;
  isPending: boolean;
  hasMore: boolean;
  isFetchingMore: boolean;
  onLoadMore: () => void;
  onRetry: (message: LocalMessage) => void;
}

/**
 * 消息列表：默认贴住底部，用户往上翻时不再自动滚动；
 * 滚到顶部附近加载更早的消息，并保持视口位置不跳。
 */
export function MessageList({
  messages,
  meId,
  senderName,
  isPending,
  hasMore,
  isFetchingMore,
  onLoadMore,
  onRetry,
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
          return (
            <li key={message.clientId}>
              {message.type === 'system' ? (
                <SystemMessage message={message} />
              ) : (
                <Bubble
                  message={message}
                  mine={mine}
                  name={showName && message.senderId !== null ? senderName(message.senderId) : null}
                  onRetry={onRetry}
                />
              )}
            </li>
          );
        })}
      </ol>
    </div>
  );
}

function SystemMessage({ message }: { message: LocalMessage }) {
  return (
    <p className="py-1 text-center text-xs text-muted-foreground">
      <span className="rounded-full bg-muted px-3 py-1">{message.content}</span>
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

function Bubble({
  message,
  mine,
  name,
  onRetry,
}: {
  message: LocalMessage;
  mine: boolean;
  name: string | null;
  onRetry: (message: LocalMessage) => void;
}) {
  const isImage = message.type === 'image' && message.attachment !== null;
  return (
    <div className={cn('flex flex-col gap-1', mine ? 'items-end' : 'items-start')}>
      {name ? <span className="px-1 text-xs text-muted-foreground">{name}</span> : null}
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
          {message.content}
        </div>
      )}
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
          <time dateTime={message.createdAt}>{formatMessageTime(message.createdAt)}</time>
        )}
      </div>
    </div>
  );
}
