import { Bell, BellOff, Users, WifiOff } from 'lucide-react';
import { useEffect } from 'react';
import { Link, Outlet, useMatch } from 'react-router';
import { ConversationList } from '@/components/chat/conversation-list';
import { CreateGroupDialog } from '@/components/chat/create-group-dialog';
import { MobileTabBar } from '@/components/mobile-tab-bar';
import { buttonVariants } from '@/components/ui/button';
import { useMe } from '@/features/auth/use-auth';
import { subscribeToPush } from '@/features/chat/push';
import { useConversations, useFriendRequests } from '@/features/chat/queries';
import { useNotificationToggle } from '@/features/chat/use-notification-toggle';
import { useRealtimeSync } from '@/features/chat/use-realtime-sync';
import { t } from '@/i18n/zh-CN';
import { cn } from '@/lib/utils';
import { useConnectionStore } from '@/stores/connection';

/**
 * 登录后的主界面，先按手机写，再用 md: 扩成桌面的两栏。
 *
 * 手机：一次只显示一屏。“/” 是会话列表，“/friends”“/me” 是另外两个标签页，底部有标签栏；
 * 进入聊天（/c/:id）后全屏，标签栏收起，靠左上角的返回回到列表。
 * 桌面：左边固定一栏会话列表，右边是当前页面，没有标签栏。
 */
export function ChatLayout() {
  const me = useMe();
  const meId = me.data?.id ?? 0;
  useRealtimeSync(meId);

  const requests = useFriendRequests();
  const incomingCount = requests.data?.incoming.length ?? 0;
  const connection = useConnectionStore();
  const notifications = useNotificationToggle();
  // 开着通知的设备每次打开应用都确认一下推送订阅还在（浏览器可能让它过期）
  useEffect(() => {
    if (notifications.on) void subscribeToPush();
  }, [notifications.on]);
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
  const atList = useMatch({ path: '/', end: true }) !== null;

  return (
    <div className="relative flex min-h-0 flex-1 flex-col md:flex-row">
      {showOffline ? (
        <div
          role="status"
          className="absolute inset-x-0 top-0 z-20 flex items-center justify-center gap-2 bg-amber-500/90 px-4 pt-[calc(env(safe-area-inset-top)+0.375rem)] pb-1.5 text-xs font-medium text-black md:pt-1.5"
        >
          <WifiOff className="size-3.5" />
          {connection.status === 'connecting' ? t.chat.reconnecting : t.chat.disconnected}
        </div>
      ) : null}
      <aside
        className={cn(
          'min-h-0 flex-1 flex-col md:flex md:w-80 md:flex-none md:border-r md:border-border',
          atList ? 'flex' : 'hidden',
        )}
      >
        <div className="shrink-0 border-b border-border pt-safe md:pt-0">
          <div className="flex h-14 items-center justify-between pr-2 pl-4 md:h-12">
            <h1 className="flex items-center gap-2 text-lg font-semibold md:text-sm">
              <img src="/favicon.svg" alt="" className="size-7 rounded-md md:hidden" />
              {/* 手机上全局顶栏不显示，这里顺便当品牌标题；桌面上是“会话”这一栏的标题 */}
              <span className="md:hidden">{t.appName}</span>
              <span className="hidden md:inline">{t.chat.conversations}</span>
            </h1>
            <div className="flex items-center gap-1">
              {notifications.supported ? (
                <button
                  type="button"
                  onClick={() => void notifications.toggle()}
                  className={cn(
                    buttonVariants({ variant: 'ghost', size: 'icon' }),
                    'hidden md:inline-flex',
                  )}
                  aria-label={notifications.on ? t.chat.notificationsOn : t.chat.notificationsOff}
                  title={notifications.on ? t.chat.notificationsOn : t.chat.notificationsOff}
                  aria-pressed={notifications.on}
                >
                  {notifications.on ? <Bell /> : <BellOff />}
                </button>
              ) : null}
              <CreateGroupDialog />
              <Link
                to="/friends"
                className={cn(
                  buttonVariants({ variant: 'ghost', size: 'sm' }),
                  'relative hidden md:inline-flex',
                )}
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
        </div>
        <ConversationList />
      </aside>
      <section
        className={cn('min-h-0 min-w-0 flex-1 flex-col md:flex', atList ? 'hidden' : 'flex')}
      >
        <Outlet />
      </section>
      {inConversation ? null : (
        <MobileTabBar unreadCount={totalUnread} requestCount={incomingCount} />
      )}
    </div>
  );
}
