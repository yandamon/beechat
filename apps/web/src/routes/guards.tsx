import { useEffect } from 'react';
import { Navigate, Outlet, useLocation } from 'react-router';
import { useMe } from '@/features/auth/use-auth';
import { t } from '@/i18n/zh-CN';
import { connectSocket, disconnectSocket } from '@/stores/connection';

function CenteredMessage({ children }: { children: string }) {
  return <p className="py-16 text-center text-sm text-muted-foreground">{children}</p>;
}

/** 只允许已登录用户访问；登录后才建立实时连接 */
export function RequireAuth() {
  const me = useMe();
  const location = useLocation();
  const userId = me.data?.id;

  useEffect(() => {
    if (!userId) return;
    connectSocket();
    return () => disconnectSocket();
  }, [userId]);

  if (me.isPending) return <CenteredMessage>{t.common.loading}</CenteredMessage>;
  if (me.isError) return <CenteredMessage>{t.common.loadFailed}</CenteredMessage>;
  if (!me.data) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  return <Outlet />;
}

/** 登录、注册页：已登录用户直接回首页 */
export function PublicOnly() {
  const me = useMe();
  if (me.isPending) return <CenteredMessage>{t.common.loading}</CenteredMessage>;
  if (me.data) return <Navigate to="/" replace />;
  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-8">
      <Outlet />
    </div>
  );
}
