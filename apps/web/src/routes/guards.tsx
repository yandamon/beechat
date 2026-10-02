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
    // 外壳本身不滚动，登录注册页在这一层里滚；键盘弹出、屏幕矮的时候表单还能滑到
    <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
      <div className="mx-auto w-full max-w-3xl px-4 pt-8 pb-[max(2rem,env(safe-area-inset-bottom))]">
        <Outlet />
      </div>
    </div>
  );
}

/** 后台页面：不是管理员就送回首页。接口本身也会拒绝，这里只是不让人看到空壳页面。 */
export function RequireAdmin() {
  const me = useMe();
  if (me.data?.role !== 'admin') return <Navigate to="/" replace />;
  return <Outlet />;
}
