import { t } from '@/i18n/zh-CN';
import { enableNotifications, notificationsSupported, useNotificationStore } from './notifications';
import { subscribeToPush, unsubscribeFromPush } from './push';

/** 新消息通知的开关：桌面侧栏的铃铛和手机“我”页面里的开关共用这一份逻辑 */
export function useNotificationToggle() {
  const enabled = useNotificationStore((state) => state.enabled);
  const setEnabled = useNotificationStore((state) => state.setEnabled);
  const on = notificationsSupported && enabled && Notification.permission === 'granted';

  const toggle = async () => {
    if (on) {
      setEnabled(false);
      void unsubscribeFromPush();
      return;
    }
    const permission = await enableNotifications();
    if (permission === 'denied') window.alert(t.chat.notificationsBlocked);
    if (permission === 'granted') void subscribeToPush();
  };

  return { supported: notificationsSupported, on, toggle };
}
