import { type MouseEvent, type PointerEvent, useRef, useSyncExternalStore } from 'react';

/** 和 index.css 里的 mouse 变体是同一个条件：主要输入设备是鼠标或触控板 */
const MOUSE_QUERY = '(hover: hover) and (pointer: fine)';

/** 不是鼠标设备就按触屏处理：长按代替悬停，回车换行而不是发送 */
export function isMouseDevice() {
  return typeof window !== 'undefined' && window.matchMedia(MOUSE_QUERY).matches;
}

function subscribe(onChange: () => void) {
  const query = window.matchMedia(MOUSE_QUERY);
  query.addEventListener('change', onChange);
  return () => query.removeEventListener('change', onChange);
}

export function useIsMouse() {
  return useSyncExternalStore(subscribe, isMouseDevice, () => true);
}

const LONG_PRESS_MS = 450;
const MOVE_TOLERANCE_PX = 10;

/**
 * 触屏上的长按。手指按住不动超过约半秒触发；期间一滑动（比如在滚动列表）就取消。
 * 鼠标不触发，桌面上右键菜单也保持原样。返回的事件处理函数直接展开到元素上。
 */
export function useLongPress(onLongPress: () => void) {
  const timerRef = useRef<number | undefined>(undefined);
  const startRef = useRef<{ x: number; y: number } | null>(null);
  const firedRef = useRef(false);

  const cancel = () => {
    window.clearTimeout(timerRef.current);
    timerRef.current = undefined;
    startRef.current = null;
  };

  return {
    onPointerDown: (event: PointerEvent) => {
      if (event.pointerType === 'mouse') return;
      firedRef.current = false;
      startRef.current = { x: event.clientX, y: event.clientY };
      window.clearTimeout(timerRef.current);
      timerRef.current = window.setTimeout(() => {
        firedRef.current = true;
        startRef.current = null;
        if ('vibrate' in navigator) navigator.vibrate(10);
        onLongPress();
      }, LONG_PRESS_MS);
    },
    onPointerMove: (event: PointerEvent) => {
      const start = startRef.current;
      if (!start) return;
      if (Math.hypot(event.clientX - start.x, event.clientY - start.y) > MOVE_TOLERANCE_PX) {
        cancel();
      }
    },
    onPointerUp: cancel,
    onPointerCancel: cancel,
    onPointerLeave: cancel,
    // 安卓上长按会弹出系统的上下文菜单，拦掉；桌面右键不受影响
    onContextMenu: (event: MouseEvent) => {
      if (!isMouseDevice()) event.preventDefault();
    },
    // 长按触发后抬手还会补一个 click，别让它再去打开图片之类的东西
    onClickCapture: (event: MouseEvent) => {
      if (!firedRef.current) return;
      firedRef.current = false;
      event.preventDefault();
      event.stopPropagation();
    },
  };
}
