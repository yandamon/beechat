import { Monitor, Moon, Sun } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { t } from '@/i18n/zh-CN';
import { type Theme, useThemeStore } from '@/stores/theme';

const ORDER: readonly Theme[] = ['light', 'dark', 'system'];
const ICONS = { light: Sun, dark: Moon, system: Monitor } as const;

export function ThemeToggle() {
  const theme = useThemeStore((state) => state.theme);
  const setTheme = useThemeStore((state) => state.setTheme);
  const Icon = ICONS[theme];
  const next = ORDER[(ORDER.indexOf(theme) + 1) % ORDER.length] ?? 'system';

  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={() => setTheme(next)}
      aria-label={t.theme.toggle}
      title={`${t.theme.toggle}：${t.theme[theme]}`}
    >
      <Icon />
    </Button>
  );
}
