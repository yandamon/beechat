import { cn } from '@/lib/utils';

interface UserAvatarProps {
  name: string;
  /** 用来挑一个稳定的背景色 */
  seed: number;
  online?: boolean;
  className?: string;
}

const HUES = [14, 36, 52, 92, 150, 178, 202, 230, 262, 292, 320, 345];

/** 没有头像图片时用名字首字显示；在线状态显示为右下角的小圆点 */
export function UserAvatar({ name, seed, online, className }: UserAvatarProps) {
  const hue = HUES[Math.abs(seed) % HUES.length] ?? 200;
  const initial = Array.from(name.trim())[0]?.toUpperCase() ?? '?';
  return (
    <span className={cn('relative inline-flex size-10 shrink-0', className)}>
      <span
        aria-hidden
        className="flex size-full items-center justify-center rounded-full text-sm font-semibold text-white"
        style={{ backgroundColor: `hsl(${hue} 55% 48%)` }}
      >
        {initial}
      </span>
      {online !== undefined ? (
        <span
          aria-hidden
          className={cn(
            'absolute right-0 bottom-0 size-3 rounded-full border-2 border-background',
            online ? 'bg-emerald-500' : 'bg-zinc-400',
          )}
        />
      ) : null}
    </span>
  );
}
