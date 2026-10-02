import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { t } from '@/i18n/zh-CN';
import { cn } from '@/lib/utils';

export interface SheetAction {
  key: string;
  label: string;
  icon?: LucideIcon;
  destructive?: boolean;
  onSelect: () => void;
}

interface ActionSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** 弹层顶部的小标题，说明这些操作是针对谁的 */
  title: string;
  actions: SheetAction[];
  /** 放在操作列表上方的内容，比如一排表情 */
  children?: ReactNode;
  /**
   * 长按打开的弹层要传：这个时间点（毫秒时间戳）之前不理会“点在弹层外面”。
   * 长按后抬手的那一下有时会被浏览器当成一次点击落在遮罩上，弹层刚出来就被关掉。
   */
  ignoreOutsidePressBefore?: number;
}

/**
 * 一列操作的弹层。手机上没有悬停，挤成一排的小图标也不好点，
 * 所以把次要操作收进来：从底部滑出，每一行都有 48px 高。
 */
export function ActionSheet({
  open,
  onOpenChange,
  title,
  actions,
  children,
  ignoreOutsidePressBefore = 0,
}: ActionSheetProps) {
  return (
    <Dialog
      open={open}
      onOpenChange={(next, details) => {
        if (!next && details.reason === 'outside-press' && Date.now() < ignoreOutsidePressBefore) {
          return;
        }
        onOpenChange(next);
      }}
    >
      <DialogContent showCloseButton={false} className="gap-2 px-2 pt-3">
        <DialogTitle className="truncate px-3 text-center text-xs font-normal text-muted-foreground">
          {title}
        </DialogTitle>
        {children}
        <ul>
          {actions.map((action) => {
            const Icon = action.icon;
            return (
              <li key={action.key}>
                <button
                  type="button"
                  onClick={() => {
                    onOpenChange(false);
                    action.onSelect();
                  }}
                  className={cn(
                    'flex h-12 w-full items-center gap-3 rounded-xl px-3 text-left text-base outline-none focus-visible:bg-muted active:bg-muted mouse:h-10 mouse:text-sm mouse:hover:bg-muted',
                    action.destructive && 'text-destructive',
                  )}
                >
                  {Icon ? <Icon className="size-5 shrink-0" /> : null}
                  {action.label}
                </button>
              </li>
            );
          })}
        </ul>
        <button
          type="button"
          onClick={() => onOpenChange(false)}
          className="h-12 w-full rounded-xl bg-muted text-base font-medium outline-none focus-visible:ring-2 focus-visible:ring-ring/50 active:bg-muted/60 mouse:h-10 mouse:text-sm"
        >
          {t.common.cancel}
        </button>
      </DialogContent>
    </Dialog>
  );
}
