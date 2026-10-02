import { create } from 'zustand';

interface ToastState {
  message: string | null;
  /** 每次弹出加一，用作 key，连着弹两条时动画会重新播放 */
  seq: number;
}

export const useToastStore = create<ToastState>(() => ({ message: null, seq: 0 }));

const VISIBLE_MS = 1800;
let hideTimer: number | undefined;

/** 屏幕下方弹一条一两秒就消失的提示，给“已复制”这类不需要用户回应的反馈用 */
export function showToast(message: string) {
  window.clearTimeout(hideTimer);
  useToastStore.setState((state) => ({ message, seq: state.seq + 1 }));
  hideTimer = window.setTimeout(() => useToastStore.setState({ message: null }), VISIBLE_MS);
}
