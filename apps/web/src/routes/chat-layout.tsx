import { Users } from 'lucide-react';
import { Link, Outlet, useMatch } from 'react-router';
import { ConversationList } from '@/components/chat/conversation-list';
import { buttonVariants } from '@/components/ui/button';
import { useMe } from '@/features/auth/use-auth';
import { useFriendRequests } from '@/features/chat/queries';
import { useRealtimeSync } from '@/features/chat/use-realtime-sync';
import { t } from '@/i18n/zh-CN';
import { cn } from '@/lib/utils';

/** 登录后的主界面：左侧会话列表，右侧当前页面；手机上二选一显示 */
export function ChatLayout() {
  const me = useMe();
  const meId = me.data?.id ?? 0;
  useRealtimeSync(meId);

  const requests = useFriendRequests();
  const incomingCount = requests.data?.incoming.length ?? 0;
  const inConversation = useMatch('/c/:conversationId') !== null;
  const inFriends = useMatch('/friends') !== null;
  const showListOnMobile = !inConversation && !inFriends;

  return (
    <div className="flex h-[calc(100dvh-3.5rem)] min-h-0">
      <aside
        className={cn(
          'w-full shrink-0 flex-col border-r border-border md:flex md:w-80',
          showListOnMobile ? 'flex' : 'hidden',
        )}
      >
        <div className="flex h-12 shrink-0 items-center justify-between border-b border-border px-4">
          <h1 className="text-sm font-semibold">{t.chat.conversations}</h1>
          <Link
            to="/friends"
            className={cn(buttonVariants({ variant: 'ghost', size: 'sm' }), 'relative')}
          >
            <Users />
            {t.chat.friends}
            {incomingCount > 0 ? (
              <span className="absolute -top-1 -right-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-semibold text-white">
                {incomingCount}
              </span>
            ) : null}
          </Link>
        </div>
        <ConversationList />
      </aside>
      <section
        className={cn('min-w-0 flex-1 flex-col md:flex', showListOnMobile ? 'hidden' : 'flex')}
      >
        <Outlet />
      </section>
    </div>
  );
}
