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
              <span className="text-sm text-muted-foreground">{me.data.displayName}</span>
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
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-8">
        <Outlet />
      </main>
    </div>
  );
}
