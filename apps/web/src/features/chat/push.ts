import { pushApi } from '@/lib/api';

export const pushSupported =
  typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window;

/** 开发环境没有注册 Service Worker，这里拿不到就直接放弃，别在 ready 上一直等 */
async function getRegistration() {
  if (!pushSupported) return null;
  return (await navigator.serviceWorker.getRegistration()) ?? null;
}

/**
 * 桌面通知打开后，把这台设备登记到服务器；应用没开着时也能收到新消息提醒。
 * 服务器没配推送密钥时返回 false，什么都不做。
 */
export async function subscribeToPush(): Promise<boolean> {
  try {
    const registration = await getRegistration();
    if (!registration) return false;
    const { publicKey } = await pushApi.publicKey();
    if (!publicKey) return false;
    const subscription =
      (await registration.pushManager.getSubscription()) ??
      (await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: publicKey,
      }));
    const json = subscription.toJSON();
    if (!json.endpoint || !json.keys?.p256dh || !json.keys.auth) return false;
    await pushApi.subscribe({
      endpoint: json.endpoint,
      keys: { p256dh: json.keys.p256dh, auth: json.keys.auth },
    });
    return true;
  } catch {
    return false;
  }
}

/** 关掉通知或退出登录时：先让服务器删掉记录，再取消浏览器里的订阅 */
export async function unsubscribeFromPush(): Promise<void> {
  try {
    const registration = await getRegistration();
    if (!registration) return;
    const subscription = await registration.pushManager.getSubscription();
    if (!subscription) return;
    await pushApi.unsubscribe(subscription.endpoint).catch(() => undefined);
    await subscription.unsubscribe();
  } catch {
    // 推送只是锦上添花，失败不打扰用户
  }
}
