import { t } from '@/i18n/zh-CN';

export function EmptyChat() {
  return (
    <div className="hidden flex-1 items-center justify-center p-6 text-center md:flex">
      <p className="text-sm text-muted-foreground">{t.chat.selectConversation}</p>
    </div>
  );
}
