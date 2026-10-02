import { CircleUserRound, type LucideIcon, MessageCircle, Users } from 'lucide-react';
import { NavLink } from 'react-router';
import { t } from '@/i18n/zh-CN';
import { cn } from '@/lib/utils';

interface MobileTabBarProps {
  /** 未读消息总数，标在“会话”上 */
  unreadCount: number;
  /** 待处理的好友申请数，标在“好友”上 */
  requestCount: number;
}

interface Tab {
  to: string;
  label: string;
  icon: LucideIcon;
  badge: number;
}

/** 手机底部的标签栏：会话、好友、我。桌面两栏布局里不显示。 */
export function MobileTabBar({ unreadCount, requestCount }: MobileTabBarProps) {
  const tabs: Tab[] = [
    { to: '/', label: t.nav.chats, icon: MessageCircle, badge: unreadCount },
    { to: '/friends', label: t.nav.friends, icon: Users, badge: requestCount },
    { to: '/me', label: t.nav.me, icon: CircleUserRound, badge: 0 },
  ];

  return (
    <nav
      aria-label={t.nav.label}
      className="shrink-0 border-t border-border bg-background pb-safe md:hidden"
    >
      <ul className="flex h-14">
        {tabs.map(({ to, label, icon: Icon, badge }) => (
          <li key={to} className="flex-1">
            <NavLink
              to={to}
              end
              className={({ isActive }) =>
                cn(
                  'flex h-full flex-col items-center justify-center gap-0.5 text-[11px] outline-none focus-visible:bg-muted active:bg-muted/60',
                  isActive ? 'font-semibold text-foreground' : 'text-muted-foreground',
                )
              }
            >
              {({ isActive }) => (
                <>
                  <span className="relative">
                    <Icon className="size-6" strokeWidth={isActive ? 2.25 : 1.75} />
                    {badge > 0 ? (
                      <span className="absolute -top-1.5 left-3.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] leading-none font-semibold text-white">
                        {t.chat.unreadBadge(badge)}
                      </span>
                    ) : null}
                  </span>
                  {label}
                </>
              )}
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  );
}
