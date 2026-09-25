import { Bell, BellOff, Users, WifiOff } from 'lucide-react';
import { useEffect } from 'react';
import { Link, Outlet, useMatch } from 'react-router';
import { ConversationList } from '@/components/chat/conversation-list';
import { CreateGroupDialog } from '@/components/chat/create-group-dialog';
import { buttonVariants } from '@/components/ui/button';
import { useMe } from '@/features/auth/use-auth';
import { useConversations, useFriendRequests } from '@/features/chat/queries';
import {
  enableNotifications,
  notificationsSupported,
  useNotificationStore,
} from '@/features/chat/notifications';
import { useRealtimeSync } from '@/features/chat/use-realtime-sync';
import { t } from '@/i18n/zh-CN';
import { cn } from '@/lib/utils';
import { useConnectionStore } from '@/stores/connection';

/** 登录后的主界面：左侧会话列表，右侧当前页面；手机上二选一显示 */
export function ChatLayout() {
  const me = useMe();
  const meId = me.data?.id ?? 0;
  useRealtimeSync(meId);

  const requests = useFriendRequests();
  const incomingCount = requests.data?.incoming.length ?? 0;
  const connection = useConnectionStore();
  const notifications = useNotificationStore();
  const notificationsOn =
    notificationsSupported && notifications.enabled && Notification.permission === 'granted';
  const toggleNotifications = async () => {
    if (notificationsOn) {
      notifications.setEnabled(false);
      return;
    }
    const permission = await enableNotifications();
    if (permission === 'denied') window.alert(t.chat.notificationsBlocked);
  };
  const showOffline = connection.everConnected && connection.status !== 'online';

  // 标签页标题带上总未读数
  const conversations = useConversations();
  // 免打扰的会话不计入标题里的未读数
  const totalUnread =
    conversations.data?.reduce(
      (sum, conversation) => sum + (conversation.muted ? 0 : conversation.unreadCount),
      0,
    ) ?? 0;
  useEffect(() => {
    document.title =
      totalUnread > 0 ? `(${t.chat.unreadBadge(totalUnread)}) ${t.appName}` : t.appName;
    return () => {
      document.title = t.appName;
    };
  }, [totalUnread]);
  const inConversation = useMatch('/c/:conversationId') !== null;
  const inFriends = useMatch('/friends') !== null;
  const showListOnMobile = !inConversation && !inFriends;

  return (
    <div className="relative flex h-[calc(100dvh-3.5rem)] min-h-0">
      {showOffline ? (
        <div
          role="status"
          className="absolute inset-x-0 top-0 z-20 flex items-center justify-center gap-2 bg-amber-500/90 px-4 py-1.5 text-xs font-medium text-black"
        >
          <WifiOff className="size-3.5" />
          {connection.status === 'connecting' ? t.chat.reconnecting : t.chat.disconnected}
        </div>
      ) : null}
      <aside
        className={cn(
          'w-full shrink-0 flex-col border-r border-border md:flex md:w-80',
          showListOnMobile ? 'flex' : 'hidden',
        )}
      >
        <div className="flex h-12 shrink-0 items-center justify-between border-b border-border px-2 pl-4">
          <h1 className="text-sm font-semibold">{t.chat.conversations}</h1>
          <div className="flex items-center gap-1">
            {notificationsSupported ? (
              <button
                type="button"
                onClick={() => void toggleNotifications()}
                className={cn(buttonVariants({ variant: 'ghost', size: 'icon' }))}
                aria-label={notificationsOn ? t.chat.notificationsOn : t.chat.notificationsOff}
                title={notificationsOn ? t.chat.notificationsOn : t.chat.notificationsOff}
                aria-pressed={notificationsOn}
              >
                {notificationsOn ? <Bell /> : <BellOff />}
              </button>
            ) : null}
            <CreateGroupDialog />
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
