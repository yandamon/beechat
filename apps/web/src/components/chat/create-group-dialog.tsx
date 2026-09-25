import { createGroupConversationSchema } from '@beechat/shared';
import { UsersRound } from 'lucide-react';
import { type FormEvent, useState } from 'react';
import { FormField } from '@/components/form-field';
import { UserAvatar } from '@/components/user-avatar';
import { Button, buttonVariants } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
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
import { useCreateGroup, useFriends } from '@/features/chat/queries';
import { t } from '@/i18n/zh-CN';
import { fieldErrorsOf } from '@/lib/forms';
import { cn } from '@/lib/utils';

type Field = 'name' | 'memberIds';

export function CreateGroupDialog() {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [selected, setSelected] = useState<number[]>([]);
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<Field, string>>>({});
  const friends = useFriends();
  const createGroup = useCreateGroup();

  const toggle = (userId: number, checked: boolean) =>
    setSelected((current) =>
      checked ? [...new Set([...current, userId])] : current.filter((id) => id !== userId),
    );

  const reset = () => {
    setName('');
    setSelected([]);
    setFieldErrors({});
    createGroup.reset();
  };

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    const parsed = createGroupConversationSchema.safeParse({
      type: 'group',
      name,
      memberIds: selected,
    });
    if (!parsed.success) {
      setFieldErrors(fieldErrorsOf<Field>(parsed.error));
      return;
    }
    setFieldErrors({});
    try {
      await createGroup.mutateAsync({ name: parsed.data.name, memberIds: parsed.data.memberIds });
      setOpen(false);
      reset();
    } catch {
      /* 服务端错误由 createGroup.error 展示 */
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) reset();
      }}
    >
      <DialogTrigger
        className={buttonVariants({ variant: 'ghost', size: 'icon' })}
        aria-label={t.group.create}
        title={t.group.create}
      >
        <UsersRound />
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t.group.create}</DialogTitle>
          <DialogDescription>{t.group.createDescription}</DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-4" noValidate>
          <FormField id="group-name" label={t.group.name} error={fieldErrors.name}>
            <Input
              id="group-name"
              value={name}
              placeholder={t.group.namePlaceholder}
              onChange={(event) => setName(event.target.value)}
              autoFocus
            />
          </FormField>
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">{t.group.pickMembers}</span>
              <span className="text-xs text-muted-foreground">
                {t.group.selectedCount(selected.length)}
              </span>
            </div>
            {friends.isPending ? (
              <p className="text-sm text-muted-foreground">{t.common.loading}</p>
            ) : !friends.data || friends.data.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t.group.noFriendsToPick}</p>
            ) : (
              <ul className="max-h-64 divide-y divide-border overflow-y-auto rounded-xl border border-border">
                {friends.data.map((friend) => {
                  const checked = selected.includes(friend.id);
                  return (
                    <li key={friend.id}>
                      <label
                        className={cn(
                          'flex cursor-pointer items-center gap-3 px-3 py-2 hover:bg-muted/60',
                          checked && 'bg-muted/40',
                        )}
                      >
                        <Checkbox
                          checked={checked}
                          onCheckedChange={(value) => toggle(friend.id, value === true)}
                        />
                        <UserAvatar name={friend.displayName} seed={friend.id} className="size-8" />
                        <span className="min-w-0 flex-1 truncate text-sm">
                          {friend.displayName}
                        </span>
                      </label>
                    </li>
                  );
                })}
              </ul>
            )}
            {fieldErrors.memberIds ? (
              <p className="text-sm text-destructive" role="alert">
                {fieldErrors.memberIds}
              </p>
            ) : null}
          </div>
          {createGroup.error ? (
            <p className="text-sm text-destructive" role="alert">
              {createGroup.error.message}
            </p>
          ) : null}
          <DialogFooter>
            <Button type="submit" disabled={createGroup.isPending}>
              {createGroup.isPending ? t.common.submitting : t.group.createButton}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
