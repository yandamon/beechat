import { LIMITS, REPORT_REASONS, type ReportReason } from '@beechat/shared';
import { type FormEvent, useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useReport } from '@/features/chat/queries';
import { t } from '@/i18n/zh-CN';

export interface ReportTarget {
  userId: number;
  name: string;
  /** 举报具体某条消息时带上 */
  messageId?: number;
  /** 被举报消息的摘要，只用于展示 */
  preview?: string;
}

interface ReportDialogProps {
  target: ReportTarget | null;
  onClose: () => void;
}

/** 举报某个用户或某条消息；提交后只提示已收到，不会通知对方 */
export function ReportDialog({ target, onClose }: ReportDialogProps) {
  const [reason, setReason] = useState<ReportReason>('harassment');
  const [detail, setDetail] = useState('');
  const report = useReport();

  const close = () => {
    onClose();
    report.reset();
    setReason('harassment');
    setDetail('');
  };
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!target) return;
    const trimmed = detail.trim();
    report.mutate({
      targetUserId: target.userId,
      messageId: target.messageId,
      reason,
      detail: trimmed.length > 0 ? trimmed : undefined,
    });
  };

  return (
    <Dialog
      open={target !== null}
      onOpenChange={(open) => {
        if (!open) close();
      }}
    >
      <DialogContent showCloseButton>
        {target === null ? null : report.isSuccess ? (
          <>
            <DialogHeader>
              <DialogTitle>{t.report.title(target.name)}</DialogTitle>
              <DialogDescription>{t.report.done}</DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button type="button" onClick={close}>
                {t.report.close}
              </Button>
            </DialogFooter>
          </>
        ) : (
          <form onSubmit={submit} className="space-y-4">
            <DialogHeader>
              <DialogTitle>{t.report.title(target.name)}</DialogTitle>
              <DialogDescription>{t.report.description}</DialogDescription>
            </DialogHeader>
            {target.preview ? (
              <p className="line-clamp-3 rounded-lg bg-muted px-3 py-2 text-sm break-words">
                {target.preview}
              </p>
            ) : null}
            <fieldset className="space-y-2">
              <legend className="mb-1 text-sm font-medium">{t.report.reasonLabel}</legend>
              {REPORT_REASONS.map((value) => (
                <label key={value} className="flex items-center gap-2 text-sm">
                  <input
                    type="radio"
                    name="reason"
                    value={value}
                    checked={reason === value}
                    onChange={() => setReason(value)}
                    className="accent-primary"
                  />
                  {t.report.reasons[value]}
                </label>
              ))}
            </fieldset>
            <textarea
              value={detail}
              onChange={(event) => setDetail(event.target.value)}
              maxLength={LIMITS.reportDetail.max}
              rows={3}
              placeholder={t.report.detailPlaceholder}
              aria-label={t.report.detailPlaceholder}
              className="w-full resize-none rounded-lg border border-input bg-transparent px-3 py-2 text-sm outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring"
            />
            {report.error ? (
              <p className="text-sm text-destructive">{report.error.message}</p>
            ) : null}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={close}>
                {t.report.cancel}
              </Button>
              <Button type="submit" disabled={report.isPending}>
                {report.isPending ? t.report.submitting : t.report.submit}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
