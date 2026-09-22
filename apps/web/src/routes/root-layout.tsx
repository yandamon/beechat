import { useEffect } from 'react';
import { Outlet } from 'react-router';
import { ThemeToggle } from '@/components/theme-toggle';
import { t } from '@/i18n/zh-CN';
import { connectSocket, disconnectSocket } from '@/stores/connection';

export function RootLayout() {
  useEffect(() => {
    connectSocket();
    return () => disconnectSocket();
  }, []);

  return (
    <div className="flex min-h-dvh flex-col bg-background text-foreground">
      <header className="flex h-14 items-center justify-between border-b border-border px-4">
        <div className="flex items-center gap-2 font-semibold">
          <img src="/favicon.svg" alt="" className="size-6 rounded-md" />
          <span>{t.appName}</span>
        </div>
        <ThemeToggle />
      </header>
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-8">
        <Outlet />
      </main>
    </div>
  );
}
