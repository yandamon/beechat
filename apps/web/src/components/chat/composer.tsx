import { LIMITS } from '@beechat/shared';
import { ImagePlus, SendHorizontal, X } from 'lucide-react';
import {
  type ClipboardEvent,
  type FormEvent,
  type KeyboardEvent,
  type SyntheticEvent,
  useEffect,
  useRef,
  useState,
} from 'react';
import { EmojiPicker } from '@/components/chat/emoji-picker';
import { Button } from '@/components/ui/button';
import { t } from '@/i18n/zh-CN';
import { socket } from '@/lib/socket';
import { useIsMouse } from '@/lib/use-pointer';

export interface QuoteBar {
  name: string;
  preview: string;
}

interface ComposerProps {
  conversationId: number;
  onSend: (content: string) => void;
  onSendImage: (file: File) => void;
  /** 正在回复的消息；有值时输入框上方显示引用条 */
  quote?: QuoteBar | null;
  onCancelQuote?: () => void;
  disabled?: boolean;
  disabledHint?: string;
}

const TYPING_IDLE_MS = 2_000;

/** 按下时不让按钮抢走焦点：手机上输入框一失焦键盘就收起来，发一条消息键盘跳一次 */
const keepFocus = (event: SyntheticEvent) => event.preventDefault();

export function Composer({
  conversationId,
  onSend,
  onSendImage,
  quote,
  onCancelQuote,
  disabled,
  disabledHint,
}: ComposerProps) {
  const [value, setValue] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const caretRef = useRef<number | null>(null);
  const typingRef = useRef(false);
  const idleTimerRef = useRef<number | undefined>(undefined);
  // 有鼠标（也就有实体键盘）时回车发送；触屏上回车换行，发送靠右边的按钮
  const isMouse = useIsMouse();
  const placeholder = isMouse ? t.chat.inputPlaceholder : t.chat.inputPlaceholderShort;

  const stopTyping = () => {
    window.clearTimeout(idleTimerRef.current);
    if (!typingRef.current) return;
    typingRef.current = false;
    socket.emit('typing:stop', { conversationId });
  };

  const noteTyping = () => {
    if (!typingRef.current) {
      typingRef.current = true;
      socket.emit('typing:start', { conversationId });
    }
    window.clearTimeout(idleTimerRef.current);
    idleTimerRef.current = window.setTimeout(stopTyping, TYPING_IDLE_MS);
  };

  // 切换会话或离开页面时收回“正在输入”
  useEffect(() => stopTyping, [conversationId]); // eslint-disable-line react-hooks/exhaustive-deps

  // 选择回复后把焦点放回输入框
  useEffect(() => {
    if (quote) textareaRef.current?.focus();
  }, [quote]);

  // 输入框随内容长高：桌面最多五行左右，手机上矮一些，给消息多留点地方
  useEffect(() => {
    const element = textareaRef.current;
    if (!element) return;
    const max = isMouse ? 160 : 128;
    element.style.height = 'auto';
    // scrollHeight 不含边框，而高度是按 border-box 算的，差的这两像素会逼出一条滚动条
    const wanted = element.scrollHeight + (element.offsetHeight - element.clientHeight);
    element.style.height = `${Math.min(wanted, max)}px`;
    element.style.overflowY = wanted > max ? 'auto' : 'hidden';
  }, [value, isMouse]);

  const rememberCaret = () => {
    caretRef.current = textareaRef.current?.selectionStart ?? null;
  };

  /** 把表情插到光标处；选择器打开时输入框已失焦，所以用记下的光标位置 */
  const insertAtCaret = (text: string) => {
    const position = caretRef.current ?? value.length;
    const next = value.slice(0, position) + text + value.slice(position);
    setValue(next);
    noteTyping();
    const caret = position + text.length;
    caretRef.current = caret;
    // 触屏上连着点几个表情时不要每次都把键盘叫出来盖住选择器
    if (!isMouse) return;
    requestAnimationFrame(() => {
      const element = textareaRef.current;
      if (!element) return;
      element.focus();
      element.setSelectionRange(caret, caret);
    });
  };

  const submit = () => {
    const content = value.trim();
    if (!content || disabled) return;
    onSend(content);
    setValue('');
    caretRef.current = 0;
    stopTyping();
    textareaRef.current?.focus();
  };

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    submit();
  };

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (!isMouse) return;
    // 中文输入法候选词确认时也是 Enter，此时 isComposing 为 true，不能当作发送
    if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      submit();
    }
  };

  // 粘贴截图直接当图片发送
  const onPaste = (event: ClipboardEvent<HTMLTextAreaElement>) => {
    const image = Array.from(event.clipboardData.files).find((file) =>
      file.type.startsWith('image/'),
    );
    if (!image) return;
    event.preventDefault();
    onSendImage(image);
  };

  if (disabled) {
    return (
      <p className="border-t border-border px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] text-center text-sm text-muted-foreground">
        {disabledHint}
      </p>
    );
  }

  return (
    <form
      onSubmit={onSubmit}
      className="shrink-0 border-t border-border px-2 pt-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] md:p-3"
    >
      {quote ? (
        <div className="mb-2 flex items-center gap-2 rounded-lg border-l-2 border-primary bg-muted/60 py-1.5 pr-1 pl-3 text-xs">
          <div className="min-w-0 flex-1">
            <p className="font-medium text-primary">{t.chat.replyingTo(quote.name)}</p>
            <p className="truncate text-muted-foreground">{quote.preview}</p>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            onClick={onCancelQuote}
            aria-label={t.chat.cancelReply}
            className="text-muted-foreground"
          >
            <X />
          </Button>
        </div>
      ) : null}
      <div className="flex items-end gap-0.5 md:gap-1">
        <EmojiPicker onPick={insertAtCaret} />
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) onSendImage(file);
            event.target.value = '';
          }}
        />
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label={t.chat.image}
          title={t.chat.image}
          onClick={() => fileInputRef.current?.click()}
        >
          <ImagePlus />
        </Button>
        <textarea
          ref={textareaRef}
          value={value}
          rows={1}
          maxLength={LIMITS.messageText.max}
          placeholder={placeholder}
          aria-label={placeholder}
          enterKeyHint={isMouse ? 'send' : 'enter'}
          onChange={(event) => {
            setValue(event.target.value);
            caretRef.current = event.target.selectionStart;
            noteTyping();
          }}
          onSelect={rememberCaret}
          onKeyUp={rememberCaret}
          onClick={rememberCaret}
          onKeyDown={onKeyDown}
          onPaste={onPaste}
          // 字号不小于 16px，iOS 才不会在聚焦时自动放大页面
          className="mx-1 max-h-40 min-h-10 flex-1 resize-none rounded-2xl border border-input bg-background px-3.5 py-[7px] text-base leading-6 outline-none focus-visible:ring-2 focus-visible:ring-ring/50 mouse:min-h-8 mouse:rounded-xl mouse:px-3 mouse:py-1.5 mouse:text-sm mouse:leading-5"
        />
        <Button
          type="submit"
          size="icon"
          aria-label={t.chat.send}
          disabled={!value.trim()}
          onPointerDown={keepFocus}
          onMouseDown={keepFocus}
        >
          <SendHorizontal />
        </Button>
      </div>
    </form>
  );
}
