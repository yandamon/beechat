import { type ReactNode, useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { t } from '@/i18n/zh-CN';

export interface ConfirmOptions {
  title: string;
  description?: string;
  /** 确认按钮上写动作本身（“拉黑”“删除”），比“确定”更不容易点错 */
  confirmLabel: string;
  destructive?: boolean;
  onConfirm: () => void;
}

/**
 * 代替 window.confirm：手机上是底部弹层，桌面上是居中弹窗。
 *
 * 用法：`const confirm = useConfirm()`，要问的时候 `confirm.ask({...})`，再把 `confirm.element`
 * 渲染出来。在别的弹窗里用时，把 element 放进那个弹窗的内容里，这样才算嵌套，不会把外层弹窗关掉。
 */
export function useConfirm(): { ask: (options: ConfirmOptions) => void; element: ReactNode } {
  const [options, setOptions] = useState<ConfirmOptions | null>(null);
  const [open, setOpen] = useState(false);

  const ask = (next: ConfirmOptions) => {
    setOptions(next);
    setOpen(true);
  };

  const element = (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent showCloseButton={false}>
        {options ? (
          <>
            <DialogHeader>
              <DialogTitle>{options.title}</DialogTitle>
              {options.description ? (
                <DialogDescription>{options.description}</DialogDescription>
              ) : null}
            </DialogHeader>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                {t.common.cancel}
              </Button>
              <Button
                type="button"
                variant={options.destructive ? 'destructive' : 'default'}
                onClick={() => {
                  setOpen(false);
                  options.onConfirm();
                }}
              >
                {options.confirmLabel}
              </Button>
            </DialogFooter>
          </>
        ) : null}
      </DialogContent>
    </Dialog>
  );

  return { ask, element };
}
