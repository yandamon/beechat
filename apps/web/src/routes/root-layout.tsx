import { Ticket } from 'lucide-react';
import { Link, Outlet } from 'react-router';
import { ProfileButton } from '@/components/profile-dialog';
import { ThemeToggle } from '@/components/theme-toggle';
import { Toaster } from '@/components/toast';
import { Button, buttonVariants } from '@/components/ui/button';
import { useLogout, useMe } from '@/features/auth/use-auth';
import { t } from '@/i18n/zh-CN';
import { useAppHeight } from '@/lib/use-app-height';
import { cn } from '@/lib/utils';

/**
 * 整个应用的外壳：高度跟着可见视口走（见 useAppHeight），页面本身不滚动，
 * 滚动只发生在列表、消息区这些内部区域里，键盘弹出时输入框才能稳稳贴在键盘上方。
 */
export function RootLayout() {
  const me = useMe();
  const logout = useLogout();
  useAppHeight();
  // 登录后手机上不显示这条全局顶栏：每个页面有自己的标题栏，资料和退出放在“我”里。
  // 还在确认登录状态时也先不显示，免得闪一下。
  const hideOnMobile = me.isPending || Boolean(me.data);

  return (
    <div className="flex h-(--app-height) flex-col overflow-hidden bg-background text-foreground">
      <header
        className={cn(
          'shrink-0 border-b border-border pt-safe',
          hideOnMobile ? 'hidden md:block' : 'block',
        )}
      >
        <div className="flex h-14 items-center justify-between px-4">
          <div className="flex items-center gap-2 font-semibold">
            <img src="/favicon.svg" alt="" className="size-6 rounded-md" />
            <span>{t.appName}</span>
          </div>
          <div className="flex items-center gap-1">
            {me.data ? (
              <>
                {me.data.role === 'admin' ? (
                  <Link
                    to="/admin/invites"
                    className={buttonVariants({ variant: 'ghost', size: 'sm' })}
                  >
                    <Ticket />
                    {t.admin.invites.title}
                  </Link>
                ) : null}
                <ProfileButton user={me.data} />
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => logout.mutate()}
                  disabled={logout.isPending}
                >
                  {t.common.logout}
                </Button>
              </>
            ) : null}
            <ThemeToggle />
          </div>
        </div>
      </header>
      <main className="flex min-h-0 flex-1 flex-col">
        <Outlet />
      </main>
      <Toaster />
    </div>
  );
}
