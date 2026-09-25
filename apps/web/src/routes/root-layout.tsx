import { Outlet } from 'react-router';
import { ThemeToggle } from '@/components/theme-toggle';
import { Button } from '@/components/ui/button';
import { useLogout, useMe } from '@/features/auth/use-auth';
import { t } from '@/i18n/zh-CN';

export function RootLayout() {
  const me = useMe();
  const logout = useLogout();

  return (
    <div className="flex min-h-dvh flex-col bg-background text-foreground">
      <header className="flex h-14 items-center justify-between border-b border-border px-4">
        <div className="flex items-center gap-2 font-semibold">
          <img src="/favicon.svg" alt="" className="size-6 rounded-md" />
          <span>{t.appName}</span>
        </div>
        <div className="flex items-center gap-2">
          {me.data ? (
            <>
              <span className="text-sm text-muted-foreground">
                {me.data.displayName}
                {me.data.username === 'demo' ? (
                  <span className="ml-2 rounded-full bg-muted px-2 py-0.5 text-xs">
                    {t.auth.demoBadge}
                  </span>
                ) : null}
              </span>
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
      </header>
      <main className="flex min-h-0 flex-1 flex-col">
        <Outlet />
      </main>
    </div>
  );
}
