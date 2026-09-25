import type { ConversationView, MessageView } from '@beechat/shared';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { t } from '@/i18n/zh-CN';

export const notificationsSupported = typeof window !== 'undefined' && 'Notification' in window;

interface NotificationState {
  /** 用户是否想要桌面通知；浏览器权限另算 */
  enabled: boolean;
  setEnabled: (enabled: boolean) => void;
}

export const useNotificationStore = create<NotificationState>()(
  persist((set) => ({ enabled: false, setEnabled: (enabled) => set({ enabled }) }), {
    name: 'beechat-notifications',
  }),
);

/** 向浏览器申请权限；拿到后打开开关 */
export async function enableNotifications(): Promise<NotificationPermission> {
  if (!notificationsSupported) return 'denied';
  const permission =
    Notification.permission === 'default'
      ? await Notification.requestPermission()
      : Notification.permission;
  useNotificationStore.getState().setEnabled(permission === 'granted');
  return permission;
}

/** 页面不在前台或没开着这个会话时，用系统通知提醒一条新消息 */
export function notifyNewMessage(
  message: MessageView,
  conversation: ConversationView | undefined,
  senderName: string,
  onOpen: (conversationId: number) => void,
) {
  if (!notificationsSupported) return;
  if (!useNotificationStore.getState().enabled || Notification.permission !== 'granted') return;

  const title =
    conversation?.type === 'group'
      ? `${senderName} · ${conversation.name ?? t.chat.groupFallbackName}`
      : senderName;
  const body = message.type === 'image' ? t.chat.imageMessage : (message.content ?? '');
  const notification = new Notification(title, {
    body,
    icon: '/pwa-192.png',
    // 同一会话只保留最新一条通知
    tag: `conversation-${message.conversationId}`,
  });
  notification.onclick = () => {
    window.focus();
    onOpen(message.conversationId);
    notification.close();
  };
}
