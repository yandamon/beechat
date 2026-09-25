import { LIMITS } from '@beechat/shared';
import { ImagePlus, SendHorizontal } from 'lucide-react';
import {
  type ClipboardEvent,
  type FormEvent,
  type KeyboardEvent,
  useEffect,
  useRef,
  useState,
} from 'react';
import { EmojiPicker } from '@/components/chat/emoji-picker';
import { Button } from '@/components/ui/button';
import { t } from '@/i18n/zh-CN';
import { socket } from '@/lib/socket';

interface ComposerProps {
  conversationId: number;
  onSend: (content: string) => void;
  onSendImage: (file: File) => void;
  disabled?: boolean;
  disabledHint?: string;
}

const TYPING_IDLE_MS = 2_000;

export function Composer({
  conversationId,
  onSend,
  onSendImage,
  disabled,
  disabledHint,
}: ComposerProps) {
  const [value, setValue] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const caretRef = useRef<number | null>(null);
  const typingRef = useRef(false);
  const idleTimerRef = useRef<number | undefined>(undefined);

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

  // 输入框随内容长高，最多五行左右
  useEffect(() => {
    const element = textareaRef.current;
    if (!element) return;
    element.style.height = 'auto';
    element.style.height = `${Math.min(element.scrollHeight, 160)}px`;
  }, [value]);

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
      <p className="border-t border-border px-4 py-3 text-center text-sm text-muted-foreground">
        {disabledHint}
      </p>
    );
  }

  return (
    <form onSubmit={onSubmit} className="flex items-end gap-1 border-t border-border p-3">
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
        placeholder={t.chat.inputPlaceholder}
        aria-label={t.chat.inputPlaceholder}
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
        className="max-h-40 min-h-10 flex-1 resize-none rounded-xl border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
      />
      <Button type="submit" size="icon" aria-label={t.chat.send} disabled={!value.trim()}>
        <SendHorizontal />
      </Button>
    </form>
  );
}
