import type { ConversationView } from '@beechat/shared';
import { Info } from 'lucide-react';
import { type FormEvent, useState } from 'react';
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
import {
  useAddMembers,
  useFriends,
  useRemoveMember,
  useRenameGroup,
} from '@/features/chat/queries';
import { t } from '@/i18n/zh-CN';
import { cn } from '@/lib/utils';

interface GroupInfoDialogProps {
  conversation: ConversationView;
  meId: number;
}

export function GroupInfoDialog({ conversation, meId }: GroupInfoDialogProps) {
  const [open, setOpen] = useState(false);
  const isOwner = conversation.members.find((member) => member.id === meId)?.role === 'owner';
  const groupName = conversation.name ?? t.chat.groupFallbackName;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        className={buttonVariants({ variant: 'ghost', size: 'icon' })}
        aria-label={t.group.info}
        title={t.group.info}
      >
        <Info />
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{groupName}</DialogTitle>
          <DialogDescription>{t.chat.memberCount(conversation.members.length)}</DialogDescription>
        </DialogHeader>
        <div className="max-h-[60vh] space-y-6 overflow-y-auto">
          {isOwner ? <RenameForm conversation={conversation} /> : null}
          <MembersSection conversation={conversation} meId={meId} isOwner={isOwner} />
          <InviteSection conversation={conversation} />
        </div>
        <DialogFooter>
          <LeaveButton conversation={conversation} meId={meId} onLeft={() => setOpen(false)} />
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function RenameForm({ conversation }: { conversation: ConversationView }) {
  const [name, setName] = useState(conversation.name ?? '');
  const rename = useRenameGroup(conversation.id);
  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    const trimmed = name.trim();
    if (!trimmed || trimmed === conversation.name) return;
    rename.mutate(trimmed);
  };
  return (
    <form onSubmit={onSubmit} className="space-y-2">
      <label htmlFor="group-rename" className="text-sm font-medium">
        {t.group.rename}
      </label>
      <div className="flex gap-2">
        <Input
          id="group-rename"
          value={name}
          onChange={(event) => setName(event.target.value)}
          maxLength={30}
        />
        <Button
          type="submit"
          variant="outline"
          disabled={rename.isPending || !name.trim() || name.trim() === conversation.name}
        >
          {t.common.save}
        </Button>
      </div>
      {rename.error ? <p className="text-sm text-destructive">{rename.error.message}</p> : null}
    </form>
  );
}

function MembersSection({
  conversation,
  meId,
  isOwner,
}: {
  conversation: ConversationView;
  meId: number;
  isOwner: boolean;
}) {
  const remove = useRemoveMember(conversation.id, meId);
  return (
    <section>
      <h3 className="mb-2 text-sm font-medium">{t.group.members}</h3>
      <ul className="divide-y divide-border rounded-xl border border-border">
        {conversation.members.map((member) => (
          <li key={member.id} className="flex items-center gap-3 px-3 py-2">
            <UserAvatar
              name={member.displayName}
              seed={member.id}
              src={member.avatarUrl}
              className="size-8"
            />
            <span className="min-w-0 flex-1 truncate text-sm">
              {member.displayName}
              {member.id === meId ? (
                <span className="ml-1 text-xs text-muted-foreground">({t.chat.me})</span>
              ) : null}
            </span>
            {member.role === 'owner' ? (
              <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                {t.group.owner}
              </span>
            ) : null}
            {isOwner && member.id !== meId ? (
              <Button
                size="sm"
                variant="ghost"
                disabled={remove.isPending}
                onClick={() => {
                  if (window.confirm(t.group.confirmKick(member.displayName))) {
                    remove.mutate(member.id);
                  }
                }}
              >
                {t.group.kick}
              </Button>
            ) : null}
          </li>
        ))}
      </ul>
      {remove.error ? (
        <p className="mt-2 text-sm text-destructive">{remove.error.message}</p>
      ) : null}
    </section>
  );
}

function InviteSection({ conversation }: { conversation: ConversationView }) {
  const friends = useFriends();
  const [selected, setSelected] = useState<number[]>([]);
  const addMembers = useAddMembers(conversation.id);
  const memberIds = new Set(conversation.members.map((member) => member.id));
  const candidates = (friends.data ?? []).filter((friend) => !memberIds.has(friend.id));

  const toggle = (userId: number, checked: boolean) =>
    setSelected((current) =>
      checked ? [...new Set([...current, userId])] : current.filter((id) => id !== userId),
    );

  return (
    <section>
      <h3 className="mb-2 text-sm font-medium">{t.group.invite}</h3>
      {candidates.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t.group.noOneToInvite}</p>
      ) : (
        <>
          <ul className="max-h-48 divide-y divide-border overflow-y-auto rounded-xl border border-border">
            {candidates.map((friend) => {
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
                    <span className="min-w-0 flex-1 truncate text-sm">{friend.displayName}</span>
                  </label>
                </li>
              );
            })}
          </ul>
          <div className="mt-2 flex items-center justify-between">
            <span className="text-xs text-muted-foreground">
              {t.group.selectedCount(selected.length)}
            </span>
            <Button
              size="sm"
              variant="outline"
              disabled={selected.length === 0 || addMembers.isPending}
              onClick={() =>
                addMembers.mutate(selected, {
                  onSuccess: () => setSelected([]),
                })
              }
            >
              {t.group.inviteConfirm}
            </Button>
          </div>
          {addMembers.error ? (
            <p className="mt-2 text-sm text-destructive">{addMembers.error.message}</p>
          ) : null}
        </>
      )}
    </section>
  );
}

function LeaveButton({
  conversation,
  meId,
  onLeft,
}: {
  conversation: ConversationView;
  meId: number;
  onLeft: () => void;
}) {
  const remove = useRemoveMember(conversation.id, meId);
  return (
    <Button
      variant="destructive"
      disabled={remove.isPending}
      onClick={() => {
        if (window.confirm(t.group.confirmLeave(conversation.name ?? t.chat.groupFallbackName))) {
          remove.mutate(meId, { onSuccess: onLeft });
        }
      }}
    >
      {t.group.leave}
    </Button>
  );
}
