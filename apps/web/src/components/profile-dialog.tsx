import type { PublicUser } from '@beechat/shared';
import { type FormEvent, useRef, useState } from 'react';
import { FormField } from '@/components/form-field';
import { UserAvatar } from '@/components/user-avatar';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { useDeleteAccount, useLogoutAll, useUpdateProfile } from '@/features/auth/use-auth';
import { uploadImage } from '@/features/chat/upload';
import { t } from '@/i18n/zh-CN';
import { cn } from '@/lib/utils';

interface ProfileDialogProps {
  user: PublicUser;
}

/** 点头部的名字打开：改头像、改显示名、退出所有设备 */
export function ProfileDialog({ user }: ProfileDialogProps) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(user.displayName);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const update = useUpdateProfile();
  const logoutAll = useLogoutAll();
  const deleteAccount = useDeleteAccount();
  const [deleting, setDeleting] = useState(false);
  const [deletePassword, setDeletePassword] = useState('');
  const isDemo = user.username === 'demo';

  const onAvatarPicked = async (file: File) => {
    setUploading(true);
    setError(null);
    try {
      const uploaded = await uploadImage(file, 'avatar');
      await update.mutateAsync({ avatarKey: uploaded.key });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t.common.loadFailed);
    } finally {
      setUploading(false);
    }
  };

  const onSaveName = (event: FormEvent) => {
    event.preventDefault();
    const trimmed = name.trim();
    if (!trimmed || trimmed === user.displayName) return;
    update.mutate({ displayName: trimmed });
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) {
          setName(user.displayName);
          setError(null);
        }
      }}
    >
      <DialogTrigger
        className="flex items-center gap-2 rounded-md px-2 py-1 text-sm hover:bg-muted"
        aria-label={t.profile.title}
        title={t.profile.title}
      >
        <UserAvatar
          name={user.displayName}
          seed={user.id}
          src={user.avatarUrl}
          className="size-7"
        />
        <span className="max-w-32 truncate">{user.displayName}</span>
        {isDemo ? (
          <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
            {t.auth.demoBadge}
          </span>
        ) : null}
      </DialogTrigger>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>{t.profile.title}</DialogTitle>
          <DialogDescription>@{user.username}</DialogDescription>
        </DialogHeader>

        <div className="flex items-center gap-4">
          <UserAvatar
            name={user.displayName}
            seed={user.id}
            src={user.avatarUrl}
            className={cn('size-20', uploading && 'opacity-60')}
          />
          <div className="flex flex-col gap-2">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) void onAvatarPicked(file);
                event.target.value = '';
              }}
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={uploading}
              onClick={() => fileInputRef.current?.click()}
            >
              {uploading ? t.chat.uploading : t.profile.changeAvatar}
            </Button>
            {user.avatarUrl ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={uploading || update.isPending}
                onClick={() => update.mutate({ avatarKey: null })}
              >
                {t.profile.removeAvatar}
              </Button>
            ) : null}
          </div>
        </div>

        <form onSubmit={onSaveName} className="space-y-3">
          <FormField
            id="display-name"
            label={t.profile.displayName}
            hint={t.profile.displayNameHint}
          >
            <Input
              id="display-name"
              value={name}
              maxLength={30}
              onChange={(event) => setName(event.target.value)}
            />
          </FormField>
          <Button
            type="submit"
            variant="outline"
            disabled={update.isPending || !name.trim() || name.trim() === user.displayName}
          >
            {t.common.save}
          </Button>
        </form>

        {!isDemo ? (
          <section className="space-y-2 rounded-xl border border-destructive/40 p-3">
            <p className="text-sm font-medium text-destructive">{t.profile.dangerZone}</p>
            <p className="text-xs text-muted-foreground">{t.profile.deleteHint}</p>
            {deleting ? (
              <form
                className="space-y-2"
                onSubmit={(event) => {
                  event.preventDefault();
                  deleteAccount.mutate(deletePassword);
                }}
              >
                <Input
                  type="password"
                  autoComplete="current-password"
                  placeholder={t.profile.deletePassword}
                  aria-label={t.profile.deletePassword}
                  value={deletePassword}
                  onChange={(event) => setDeletePassword(event.target.value)}
                />
                <div className="flex gap-2">
                  <Button
                    type="submit"
                    variant="destructive"
                    size="sm"
                    disabled={deleteAccount.isPending || deletePassword.length < 8}
                  >
                    {t.profile.deleteConfirm}
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setDeleting(false);
                      setDeletePassword('');
                    }}
                  >
                    {t.common.cancel}
                  </Button>
                </div>
                {deleteAccount.error ? (
                  <p className="text-sm text-destructive" role="alert">
                    {deleteAccount.error.message}
                  </p>
                ) : null}
              </form>
            ) : (
              <Button type="button" variant="outline" size="sm" onClick={() => setDeleting(true)}>
                {t.profile.deleteStart}
              </Button>
            )}
          </section>
        ) : null}

        {error || update.error ? (
          <p className="text-sm text-destructive" role="alert">
            {error ?? update.error?.message}
          </p>
        ) : null}

        <DialogFooter className="flex-col items-stretch gap-1 sm:flex-col">
          <Button
            type="button"
            variant="destructive"
            disabled={logoutAll.isPending}
            onClick={() => logoutAll.mutate()}
          >
            {t.profile.logoutAll}
          </Button>
          <p className="text-center text-xs text-muted-foreground">{t.profile.logoutAllHint}</p>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
