/// <reference lib="webworker" />
import { clientsClaim } from 'workbox-core';
import {
  cleanupOutdatedCaches,
  createHandlerBoundToURL,
  precacheAndRoute,
} from 'workbox-precaching';
import { NavigationRoute, registerRoute } from 'workbox-routing';

declare const self: ServiceWorkerGlobalScope;

/** 服务端 PushService 发出的内容 */
interface PushPayload {
  title: string;
  body: string;
  url: string;
  tag: string;
}

// 应用壳：构建时注入的文件清单；接口、socket 和上传的图片一律走网络
precacheAndRoute(self.__WB_MANIFEST);
cleanupOutdatedCaches();
registerRoute(
  new NavigationRoute(createHandlerBoundToURL('/index.html'), {
    denylist: [/^\/api\//, /^\/socket\.io\//, /^\/uploads\//],
  }),
);

// 有新版本时立刻接管，和 registerSW({ immediate: true }) 配合实现自动更新
void self.skipWaiting();
clientsClaim();

self.addEventListener('push', (event) => {
  if (!event.data) return;
  let payload: PushPayload;
  try {
    payload = event.data.json() as PushPayload;
  } catch {
    return;
  }
  event.waitUntil(
    self.registration.showNotification(payload.title, {
      body: payload.body,
      icon: '/pwa-192.png',
      badge: '/pwa-192.png',
      tag: payload.tag,
      data: { url: payload.url },
    }),
  );
});

// 点通知：已经开着应用就切过去，否则新开一个窗口
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = (event.notification.data as { url?: string } | undefined)?.url ?? '/';
  event.waitUntil(
    (async () => {
      const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      const existing = clients.find(
        (client) => new URL(client.url).origin === self.location.origin,
      );
      if (existing) {
        await existing.focus();
        await existing.navigate(url);
        return;
      }
      await self.clients.openWindow(url);
    })(),
  );
});
