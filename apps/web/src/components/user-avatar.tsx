import { cn } from '@/lib/utils';

interface UserAvatarProps {
  name: string;
  /** 用来挑一个稳定的背景色 */
  seed: number;
  /** 有头像图片时显示图片，否则显示名字首字 */
  src?: string | null;
  online?: boolean;
  className?: string;
}

const HUES = [14, 36, 52, 92, 150, 178, 202, 230, 262, 292, 320, 345];

export function UserAvatar({ name, seed, src, online, className }: UserAvatarProps) {
  const hue = HUES[Math.abs(seed) % HUES.length] ?? 200;
  const initial = Array.from(name.trim())[0]?.toUpperCase() ?? '?';
  return (
    <span className={cn('relative inline-flex size-10 shrink-0', className)}>
      {src ? (
        <img
          src={src}
          alt=""
          className="size-full rounded-full object-cover"
          loading="lazy"
          draggable={false}
        />
      ) : (
        <span
          aria-hidden
          className="flex size-full items-center justify-center rounded-full text-sm font-semibold text-white"
          style={{ backgroundColor: `hsl(${hue} 55% 48%)` }}
        >
          {initial}
        </span>
      )}
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
