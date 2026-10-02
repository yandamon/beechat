import { ChevronRight, Monitor, Moon, Sun } from 'lucide-react';
import { useState } from 'react';
import { ProfileDialog } from '@/components/profile-dialog';
import { UserAvatar } from '@/components/user-avatar';
import { Button } from '@/components/ui/button';
import { useLogout, useMe } from '@/features/auth/use-auth';
import { useNotificationToggle } from '@/features/chat/use-notification-toggle';
import { t } from '@/i18n/zh-CN';
import { cn } from '@/lib/utils';
import { type Theme, useThemeStore } from '@/stores/theme';

const THEMES: { value: Theme; icon: typeof Sun }[] = [
  { value: 'light', icon: Sun },
  { value: 'dark', icon: Moon },
  { value: 'system', icon: Monitor },
];

/** 手机上的“我”标签页：资料、主题、通知、退出。桌面上这些在全局顶栏里。 */
export function MePage() {
  const me = useMe();
  const logout = useLogout();
  const [profileOpen, setProfileOpen] = useState(false);
  const theme = useThemeStore((state) => state.theme);
  const setTheme = useThemeStore((state) => state.setTheme);
  const notifications = useNotificationToggle();

  const user = me.data;
  if (!user) return null;
  const isDemo = user.username === 'demo';

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col">
      <header className="shrink-0 border-b border-border pt-safe md:pt-0">
        <div className="flex h-14 items-center px-4 md:h-12">
          <h2 className="text-lg font-semibold md:text-sm">{t.me.title}</h2>
        </div>
      </header>
      <div className="min-h-0 flex-1 space-y-6 overflow-y-auto overscroll-contain p-4 md:p-6">
        <button
          type="button"
          onClick={() => setProfileOpen(true)}
          className="flex w-full items-center gap-4 rounded-2xl border border-border p-4 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring/50 active:bg-muted mouse:hover:bg-muted/60"
        >
          <UserAvatar
            name={user.displayName}
            seed={user.id}
            src={user.avatarUrl}
            className="size-16"
          />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-lg font-semibold">{user.displayName}</span>
            <span className="block truncate text-sm text-muted-foreground">@{user.username}</span>
            {isDemo ? (
              <span className="mt-1 inline-block rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                {t.auth.demoBadge}
              </span>
            ) : null}
          </span>
          <span className="flex shrink-0 items-center text-sm text-muted-foreground">
            {t.me.editProfile}
            <ChevronRight className="size-4" />
          </span>
        </button>
        <ProfileDialog user={user} open={profileOpen} onOpenChange={setProfileOpen} />

        <section>
          <h3 className="mb-2 px-1 text-sm font-medium text-muted-foreground">{t.me.settings}</h3>
          <div className="divide-y divide-border rounded-2xl border border-border">
            {/* 窄屏上标题在上、三个选项平分一整行；宽一点再排成一行 */}
            <div className="flex flex-col gap-2 px-4 py-3 sm:min-h-14 sm:flex-row sm:items-center sm:justify-between sm:py-2">
              <span className="text-base whitespace-nowrap">{t.me.theme}</span>
              <div
                role="group"
                aria-label={t.me.theme}
                className="grid grid-cols-3 rounded-xl bg-muted p-1 text-sm"
              >
                {THEMES.map(({ value, icon: Icon }) => (
                  <button
                    key={value}
                    type="button"
                    aria-pressed={theme === value}
                    onClick={() => setTheme(value)}
                    className={cn(
                      'flex h-9 items-center justify-center gap-1 rounded-lg px-1.5 whitespace-nowrap outline-none focus-visible:ring-2 focus-visible:ring-ring/50',
                      theme === value
                        ? 'bg-background font-medium text-foreground shadow-sm'
                        : 'text-muted-foreground',
                    )}
                  >
                    {/* 320px 宽的屏幕上三个选项放不下图标，只留文字 */}
                    <Icon className="hidden size-4 shrink-0 min-[360px]:block" />
                    {t.theme[value]}
                  </button>
                ))}
              </div>
            </div>
            {notifications.supported ? (
              <button
                type="button"
                role="switch"
                aria-checked={notifications.on}
                onClick={() => void notifications.toggle()}
                className="flex min-h-14 w-full items-center justify-between gap-3 px-4 py-2 text-left outline-none focus-visible:bg-muted active:bg-muted"
              >
                <span>
                  <span className="block text-base">{t.me.notifications}</span>
                  <span className="block text-xs text-muted-foreground">
                    {t.me.notificationsHint}
                  </span>
                </span>
                <span
                  aria-hidden
                  className={cn(
                    'flex h-7 w-12 shrink-0 items-center rounded-full p-0.5 transition-colors',
                    notifications.on ? 'bg-emerald-500' : 'bg-input',
                  )}
                >
                  <span
                    className={cn(
                      'size-6 rounded-full bg-white shadow-sm transition-transform',
                      notifications.on && 'translate-x-5',
                    )}
                  />
                </span>
              </button>
            ) : null}
          </div>
        </section>

        <Button
          variant="outline"
          size="lg"
          className="w-full"
          onClick={() => logout.mutate()}
          disabled={logout.isPending}
        >
          {t.common.logout}
        </Button>
        <p className="pb-2 text-center text-xs text-muted-foreground">
          {t.appName} · {t.tagline}
        </p>
      </div>
    </div>
  );
}
