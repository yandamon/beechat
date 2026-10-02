import {
  type InviteCounts,
  type InviteStatus,
  type InviteView,
  LIMITS,
  createInvitesSchema,
} from '@beechat/shared';
import { Ban, ChevronLeft, Copy, Ellipsis, Link2, Plus } from 'lucide-react';
import { type FormEvent, useState } from 'react';
import { Link } from 'react-router';
import { ActionSheet } from '@/components/action-sheet';
import { useConfirm } from '@/components/confirm-dialog';
import { FormField } from '@/components/form-field';
import { showToast } from '@/lib/toast';
import { Button, buttonVariants } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import {
  type InviteFilter,
  useCreateInvites,
  useInvites,
  useRevokeInvite,
} from '@/features/admin/queries';
import { t } from '@/i18n/zh-CN';
import { copyToClipboard } from '@/lib/clipboard';
import { formatMessageTime } from '@/lib/format';
import { fieldErrorsOf } from '@/lib/forms';
import { useIsMouse } from '@/lib/use-pointer';
import { cn } from '@/lib/utils';

const FILTERS: InviteFilter[] = ['unused', 'used', 'revoked', 'expired', 'all'];

/** 用这个链接打开注册页，邀请码会自动填好 */
const inviteLink = (code: string) => `${window.location.origin}/register?code=${code}`;

async function copy(text: string) {
  showToast((await copyToClipboard(text)) ? t.common.copied : t.common.copyFailed);
}

/**
 * 后台的邀请码页：生成、查看、作废。每个邀请码只能注册一个账号。
 * 手机上从“我”里进来，是一个全屏的子页面；桌面上显示在右边一栏。
 */
export function AdminInvitesPage() {
  const [filter, setFilter] = useState<InviteFilter>('unused');
  const [createOpen, setCreateOpen] = useState(false);
  const invites = useInvites(filter);

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col">
      <header className="shrink-0 border-b border-border pt-safe md:pt-0">
        <div className="flex h-14 items-center gap-1 pr-3 pl-1 md:h-12 md:px-4">
          <Link
            to="/me"
            aria-label={t.common.back}
            className={cn(buttonVariants({ variant: 'ghost', size: 'icon-lg' }), 'md:hidden')}
          >
            <ChevronLeft className="size-6" />
          </Link>
          <h2 className="min-w-0 flex-1 truncate text-lg font-semibold md:text-sm">
            {t.admin.invites.title}
          </h2>
          <Button size="sm" onClick={() => setCreateOpen(true)}>
            <Plus />
            {t.admin.invites.create}
          </Button>
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
        <div className="mx-auto w-full max-w-3xl space-y-4 p-4 md:p-6">
          <p className="text-sm text-muted-foreground">{t.admin.invites.intro}</p>
          <FilterTabs value={filter} onChange={setFilter} counts={invites.data?.counts} />

          {invites.isPending ? (
            <p className="text-sm text-muted-foreground">{t.common.loading}</p>
          ) : invites.isError ? (
            <p className="text-sm text-destructive" role="alert">
              {invites.error.message}
            </p>
          ) : invites.data.invites.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              {t.admin.invites.empty}
            </p>
          ) : (
            <ul className={cn('space-y-2', invites.isPlaceholderData && 'opacity-60')}>
              {invites.data.invites.map((invite) => (
                <InviteCard key={invite.id} invite={invite} />
              ))}
            </ul>
          )}
        </div>
      </div>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-md">
          {/* 表单状态放在内层：每次打开都重新挂载，回到初始值 */}
          <CreateInvitesForm />
        </DialogContent>
      </Dialog>
    </div>
  );
}

function FilterTabs({
  value,
  onChange,
  counts,
}: {
  value: InviteFilter;
  onChange: (next: InviteFilter) => void;
  counts: InviteCounts | undefined;
}) {
  const countOf = (filter: InviteFilter) => {
    if (!counts) return null;
    if (filter !== 'all') return counts[filter];
    return counts.unused + counts.used + counts.revoked + counts.expired;
  };
  return (
    // 窄屏上放不下就横向滑动；负外边距让它滑到屏幕边缘，但不会把整页撑宽
    <div
      role="group"
      aria-label={t.admin.invites.filterLabel}
      className="-mx-4 flex [scrollbar-width:none] gap-2 overflow-x-auto px-4 pb-1 md:mx-0 md:flex-wrap md:px-0"
    >
      {FILTERS.map((filter) => {
        const count = countOf(filter);
        const active = filter === value;
        return (
          <button
            key={filter}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(filter)}
            className={cn(
              'flex h-9 shrink-0 items-center gap-1.5 rounded-full border px-3.5 text-sm whitespace-nowrap outline-none focus-visible:ring-2 focus-visible:ring-ring/50 mouse:h-8 mouse:px-3',
              active
                ? 'border-primary bg-primary text-primary-foreground'
                : 'border-border text-muted-foreground active:bg-muted mouse:hover:bg-muted',
            )}
          >
            {filter === 'all' ? t.admin.invites.all : t.admin.invites.status[filter]}
            {count !== null ? <span className="tabular-nums opacity-80">{count}</span> : null}
          </button>
        );
      })}
    </div>
  );
}

const STATUS_STYLES: Record<InviteStatus, string> = {
  unused: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400',
  used: 'bg-muted text-muted-foreground',
  revoked: 'bg-destructive/10 text-destructive',
  expired: 'bg-amber-500/15 text-amber-700 dark:text-amber-400',
};

function InviteCard({ invite }: { invite: InviteView }) {
  const revoke = useRevokeInvite();
  const confirm = useConfirm();
  const [menuOpen, setMenuOpen] = useState(false);
  const usable = invite.status === 'unused';
  const texts = t.admin.invites;

  const onRevoke = () =>
    confirm.ask({
      title: texts.revokeTitle,
      description: texts.confirmRevoke(invite.code),
      confirmLabel: texts.revoke,
      destructive: true,
      onConfirm: () => revoke.mutate(invite.id),
    });

  return (
    <li className="rounded-xl border border-border p-3">
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <code className="font-mono text-base font-semibold tracking-wider">{invite.code}</code>
            <span
              className={cn(
                'rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap',
                STATUS_STYLES[invite.status],
              )}
            >
              {texts.status[invite.status]}
            </span>
          </div>
          {invite.note ? <p className="text-sm break-words">{invite.note}</p> : null}
          <div className="space-y-0.5 text-xs text-muted-foreground">
            <p>
              {texts.createdAt(
                formatMessageTime(invite.createdAt),
                invite.createdBy?.displayName ?? null,
              )}
            </p>
            {invite.usedBy && invite.usedAt ? (
              <p>
                {texts.usedBy(
                  invite.usedBy.username,
                  formatMessageTime(invite.usedAt),
                  invite.usedBy.id === null,
                )}
              </p>
            ) : null}
            {invite.revokedAt && invite.status === 'revoked' ? (
              <p>{texts.revokedAt(formatMessageTime(invite.revokedAt))}</p>
            ) : null}
            {invite.expiresAt && (invite.status === 'unused' || invite.status === 'expired') ? (
              <p>
                {invite.status === 'expired'
                  ? texts.expiredAt(formatMessageTime(invite.expiresAt))
                  : texts.expiresAt(formatMessageTime(invite.expiresAt))}
              </p>
            ) : null}
          </div>
        </div>
        {usable ? (
          <>
            {/* 宽屏上三个操作直接摆出来；窄一点就收进“更多” */}
            <div className="hidden shrink-0 items-center gap-1 lg:flex">
              <Button
                size="sm"
                variant="outline"
                onClick={() => void copy(inviteLink(invite.code))}
              >
                <Link2 />
                {texts.copyLink}
              </Button>
              <Button size="sm" variant="ghost" onClick={() => void copy(invite.code)}>
                <Copy />
                {texts.copyCode}
              </Button>
              <Button size="sm" variant="ghost" onClick={onRevoke} disabled={revoke.isPending}>
                {texts.revoke}
              </Button>
            </div>
            <Button
              size="icon-sm"
              variant="ghost"
              className="shrink-0 lg:hidden"
              aria-label={t.common.more}
              onClick={() => setMenuOpen(true)}
            >
              <Ellipsis />
            </Button>
          </>
        ) : null}
      </div>
      {revoke.error ? (
        <p className="mt-2 text-sm text-destructive" role="alert">
          {revoke.error.message}
        </p>
      ) : null}
      {usable ? (
        <ActionSheet
          open={menuOpen}
          onOpenChange={setMenuOpen}
          title={invite.code}
          actions={[
            {
              key: 'link',
              label: texts.copyLink,
              icon: Link2,
              onSelect: () => void copy(inviteLink(invite.code)),
            },
            {
              key: 'code',
              label: texts.copyCode,
              icon: Copy,
              onSelect: () => void copy(invite.code),
            },
            {
              key: 'revoke',
              label: texts.revoke,
              icon: Ban,
              destructive: true,
              onSelect: onRevoke,
            },
          ]}
        />
      ) : null}
      {confirm.element}
    </li>
  );
}

type Field = 'count' | 'note';
/** null 表示不过期，其余是天数 */
const EXPIRY_OPTIONS: (number | null)[] = [null, 7, 30, 90];

function CreateInvitesForm() {
  const create = useCreateInvites();
  const isMouse = useIsMouse();
  const [count, setCount] = useState('1');
  const [note, setNote] = useState('');
  const [expiresInDays, setExpiresInDays] = useState<number | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<Field, string>>>({});
  const texts = t.admin.invites;

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    const parsed = createInvitesSchema.safeParse({
      count: Number(count),
      note,
      expiresInDays: expiresInDays ?? undefined,
    });
    if (!parsed.success) {
      setFieldErrors(fieldErrorsOf<Field>(parsed.error));
      return;
    }
    setFieldErrors({});
    create.mutate(parsed.data);
  };

  // 生成成功后同一个弹层里直接展示结果，方便马上复制了发给对方
  if (create.data) {
    const codes = create.data.invites.map((invite) => invite.code);
    const single = codes.length === 1;
    return (
      <>
        <DialogHeader>
          <DialogTitle>{texts.createdTitle(codes.length)}</DialogTitle>
          <DialogDescription>{texts.createdDescription}</DialogDescription>
        </DialogHeader>
        <ul className="max-h-64 divide-y divide-border overflow-y-auto overscroll-contain rounded-xl border border-border">
          {codes.map((code) => (
            <li key={code} className="flex min-h-12 items-center justify-between gap-2 px-3 py-1">
              <code className="font-mono text-base font-semibold tracking-wider">{code}</code>
              {single ? null : (
                <Button size="sm" variant="ghost" onClick={() => void copy(inviteLink(code))}>
                  <Link2 />
                  {texts.copyLinkShort}
                </Button>
              )}
            </li>
          ))}
        </ul>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => void copy(codes.join('\n'))}>
            <Copy />
            {single ? texts.copyCode : texts.copyAllCodes}
          </Button>
          <Button type="button" onClick={() => void copy(codes.map(inviteLink).join('\n'))}>
            <Link2 />
            {single ? texts.copyLink : texts.copyAllLinks}
          </Button>
        </DialogFooter>
      </>
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4" noValidate>
      <DialogHeader>
        <DialogTitle>{texts.createTitle}</DialogTitle>
        <DialogDescription>{texts.intro}</DialogDescription>
      </DialogHeader>
      <FormField
        id="invite-count"
        label={texts.count}
        hint={texts.countHint(LIMITS.inviteBatch.max)}
        error={fieldErrors.count}
      >
        <Input
          id="invite-count"
          type="number"
          inputMode="numeric"
          min={1}
          max={LIMITS.inviteBatch.max}
          value={count}
          onChange={(event) => setCount(event.target.value)}
          autoFocus={isMouse}
        />
      </FormField>
      <FormField id="invite-note" label={texts.note} hint={texts.noteHint} error={fieldErrors.note}>
        <Input
          id="invite-note"
          value={note}
          maxLength={LIMITS.inviteNote.max}
          placeholder={texts.notePlaceholder}
          enterKeyHint="done"
          onChange={(event) => setNote(event.target.value)}
        />
      </FormField>
      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">{texts.expiry}</legend>
        <div className="grid grid-cols-4 gap-2">
          {EXPIRY_OPTIONS.map((days) => (
            <button
              key={days ?? 'never'}
              type="button"
              aria-pressed={expiresInDays === days}
              onClick={() => setExpiresInDays(days)}
              className={cn(
                'h-10 rounded-lg border text-sm whitespace-nowrap outline-none focus-visible:ring-2 focus-visible:ring-ring/50 mouse:h-8',
                expiresInDays === days
                  ? 'border-primary bg-primary text-primary-foreground'
                  : 'border-border active:bg-muted mouse:hover:bg-muted',
              )}
            >
              {days === null ? texts.never : texts.days(days)}
            </button>
          ))}
        </div>
      </fieldset>
      {create.error ? (
        <p className="text-sm text-destructive" role="alert">
          {create.error.message}
        </p>
      ) : null}
      <DialogFooter>
        <Button type="submit" disabled={create.isPending}>
          {create.isPending ? t.common.submitting : texts.submit}
        </Button>
      </DialogFooter>
    </form>
  );
}
