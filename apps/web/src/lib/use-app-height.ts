import { useEffect } from 'react';

/**
 * 把“看得见的那块屏幕”的高度写进 --app-height，整个应用按它定高，页面本身不滚动。
 *
 * 安卓靠 viewport 里的 interactive-widget=resizes-content 就够了：键盘弹出时页面跟着变矮。
 * iOS 不认这个设置，键盘弹出时布局视口不变，只有 visualViewport 变矮，还会把整页往上推，
 * 所以这里跟着 visualViewport 调高度，并把页面拉回顶部，让输入框正好贴在键盘上方。
 */
export function useAppHeight() {
  useEffect(() => {
    const viewport = window.visualViewport;
    if (!viewport) return;
    const root = document.documentElement;
    const apply = () => {
      // 双指放大时 visualViewport 也会变小，那不是键盘，别跟着缩
      if (Math.abs(viewport.scale - 1) > 0.01) return;
      root.style.setProperty('--app-height', `${viewport.height}px`);
      if (viewport.offsetTop > 0 || window.scrollY > 0) window.scrollTo(0, 0);
    };
    apply();
    viewport.addEventListener('resize', apply);
    viewport.addEventListener('scroll', apply);
    return () => {
      viewport.removeEventListener('resize', apply);
      viewport.removeEventListener('scroll', apply);
      root.style.removeProperty('--app-height');
    };
  }, []);
}
