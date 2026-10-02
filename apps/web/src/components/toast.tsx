import { useToastStore } from '@/lib/toast';

/** 显示 showToast() 弹出的提示。全应用只挂一个，放在根布局里。 */
export function Toaster() {
  const message = useToastStore((state) => state.message);
  const seq = useToastStore((state) => state.seq);
  if (!message) return null;
  return (
    <div
      key={seq}
      role="status"
      aria-live="polite"
      // 比弹层（z-50）高一层；手机上要让开底部标签栏和安全区
      className="pointer-events-none fixed inset-x-0 bottom-[calc(env(safe-area-inset-bottom)+5rem)] z-60 flex justify-center px-4"
    >
      <span className="animate-in rounded-full bg-foreground px-4 py-2 text-sm text-background shadow-lg duration-200 fade-in-0 slide-in-from-bottom-2">
        {message}
      </span>
    </div>
  );
}
