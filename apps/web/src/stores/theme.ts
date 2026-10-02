import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type Theme = 'light' | 'dark' | 'system';

const darkQuery = window.matchMedia('(prefers-color-scheme: dark)');

function applyTheme(theme: Theme) {
  const dark = theme === 'dark' || (theme === 'system' && darkQuery.matches);
  document.documentElement.classList.toggle('dark', dark);
  // 手机浏览器的地址栏、安装后的状态栏跟着页面背景走；颜色和 index.html 里的首屏脚本一致
  document
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute('content', dark ? '#0a0a0a' : '#ffffff');
}

interface ThemeState {
  theme: Theme;
  setTheme: (theme: Theme) => void;
}

// 持久化键名 beechat-theme 与 index.html 里的首屏脚本保持一致
export const useThemeStore = create<ThemeState>()(
  persist(
    (set) => ({
      theme: 'system',
      setTheme: (theme) => {
        applyTheme(theme);
        set({ theme });
      },
    }),
    { name: 'beechat-theme' },
  ),
);

// “跟随系统”的用户在系统主题变化时随之切换
darkQuery.addEventListener('change', () => applyTheme(useThemeStore.getState().theme));
