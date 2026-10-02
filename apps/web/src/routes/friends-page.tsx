import type {
  BlockedUserView,
  FriendRequestView,
  FriendView,
  UserSearchResult,
} from '@beechat/shared';
import { Ban, Ellipsis, UserRoundX } from 'lucide-react';
import { useState } from 'react';
import { ActionSheet } from '@/components/action-sheet';
import { useConfirm } from '@/components/confirm-dialog';
import { UserAvatar } from '@/components/user-avatar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useMe } from '@/features/auth/use-auth';
import {
  useBlockUser,
  useBlocked,
  useFriendRequests,
  useFriends,
  useOpenConversation,
  useRemoveFriend,
  useRespondFriendRequest,
  useSearchUsers,
  useSendFriendRequest,
  useUnblockUser,
} from '@/features/chat/queries';
import { t } from '@/i18n/zh-CN';
import { useDebounce } from '@/lib/use-debounce';

export function FriendsPage() {
  return (
    <div className="flex h-full min-h-0 flex-1 flex-col">
      <header className="shrink-0 border-b border-border pt-safe md:pt-0">
        <div className="flex h-14 items-center px-4 md:h-12">
          <h2 className="text-lg font-semibold md:text-sm">{t.friends.title}</h2>
        </div>
      </header>
      <div className="min-h-0 flex-1 space-y-8 overflow-y-auto overscroll-contain p-4 md:p-6">
        <SearchSection />
        <RequestsSection />
        <FriendsSection />
        <BlockedSection />
      </div>
    </div>
  );
}

function SectionTitle({ children }: { children: string }) {
  return <h3 className="mb-3 text-sm font-medium text-muted-foreground">{children}</h3>;
}

function SearchSection() {
  const [query, setQuery] = useState('');
  const debounced = useDebounce(query);
  const results = useSearchUsers(debounced);
  return (
    <section>
      <Input
        type="search"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder={t.friends.searchPlaceholder}
        aria-label={t.friends.searchPlaceholder}
        autoComplete="off"
        autoCapitalize="none"
        autoCorrect="off"
        spellCheck={false}
        enterKeyHint="search"
      />
      <p className="mt-2 text-xs text-muted-foreground">{t.friends.searchHint}</p>
      {debounced.trim() ? (
        <ul className="mt-3 divide-y divide-border rounded-xl border border-border">
          {results.isPending ? (
            <li className="p-3 text-sm text-muted-foreground">{t.friends.searching}</li>
          ) : results.isError ? (
            <li className="p-3 text-sm text-destructive">{results.error.message}</li>
          ) : results.data.length === 0 ? (
            <li className="p-3 text-sm text-muted-foreground">{t.friends.noResults}</li>
          ) : (
            results.data.map((user) => <SearchResultRow key={user.id} user={user} />)
          )}
        </ul>
      ) : null}
    </section>
  );
}

function SearchResultRow({ user }: { user: UserSearchResult }) {
  const sendRequest = useSendFriendRequest();
  const open = useOpenConversation();
  const requests = useFriendRequests();
  const respond = useRespondFriendRequest();
  const unblock = useUnblockUser();

  const incoming = requests.data?.incoming.find((request) => request.from.id === user.id);
  let action: React.ReactNode;
  switch (user.relation) {
    case 'blocked':
      action = (
        <Button
          size="sm"
          variant="outline"
          onClick={() => unblock.mutate(user.id)}
          disabled={unblock.isPending}
        >
          {t.friends.unblock}
        </Button>
      );
      break;
    case 'self':
      action = <span className="text-xs text-muted-foreground">{t.friends.self}</span>;
      break;
    case 'friend':
      action = (
        <Button
          size="sm"
          variant="outline"
          onClick={() => open.mutate(user.id)}
          disabled={open.isPending}
        >
          {t.friends.message}
        </Button>
      );
      break;
    case 'pending_outgoing':
      action = <span className="text-xs text-muted-foreground">{t.friends.requested}</span>;
      break;
    case 'pending_incoming':
      action = incoming ? (
        <Button
          size="sm"
          onClick={() => respond.mutate({ id: incoming.id, accept: true })}
          disabled={respond.isPending}
        >
          {t.friends.accept}
        </Button>
      ) : (
        <span className="text-xs text-muted-foreground">{t.friends.waiting}</span>
      );
      break;
    default:
      action = (
        <Button
          size="sm"
          onClick={() => sendRequest.mutate({ userId: user.id })}
          disabled={sendRequest.isPending}
        >
          {t.friends.add}
        </Button>
      );
  }

  return (
    <li className="flex items-center gap-3 p-3">
      <UserAvatar name={user.displayName} seed={user.id} src={user.avatarUrl} />
      <div className="min-w-0 flex-1">
        <p className="truncate font-medium">{user.displayName}</p>
        <p className="truncate text-xs text-muted-foreground">@{user.username}</p>
        {sendRequest.error ? (
          <p className="text-xs text-destructive">{sendRequest.error.message}</p>
        ) : null}
      </div>
      <div className="shrink-0">{action}</div>
    </li>
  );
}

function RequestsSection() {
  const requests = useFriendRequests();
  const respond = useRespondFriendRequest();
  const incoming = requests.data?.incoming ?? [];
  const outgoing = requests.data?.outgoing ?? [];
  if (incoming.length === 0 && outgoing.length === 0) return null;

  return (
    <section className="space-y-6">
      {incoming.length > 0 ? (
        <div>
          <SectionTitle>{t.friends.incomingTitle}</SectionTitle>
          <ul className="divide-y divide-border rounded-xl border border-border">
            {incoming.map((request) => (
              <RequestRow key={request.id} request={request} user={request.from}>
                <Button
                  size="sm"
                  onClick={() => respond.mutate({ id: request.id, accept: true })}
                  disabled={respond.isPending}
                >
                  {t.friends.accept}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => respond.mutate({ id: request.id, accept: false })}
                  disabled={respond.isPending}
                >
                  {t.friends.reject}
                </Button>
              </RequestRow>
            ))}
          </ul>
        </div>
      ) : null}
      {outgoing.length > 0 ? (
        <div>
          <SectionTitle>{t.friends.outgoingTitle}</SectionTitle>
          <ul className="divide-y divide-border rounded-xl border border-border">
            {outgoing.map((request) => (
              <RequestRow key={request.id} request={request} user={request.to}>
                <span className="text-xs text-muted-foreground">{t.friends.waiting}</span>
              </RequestRow>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}

function RequestRow({
  request,
  user,
  children,
}: {
  request: FriendRequestView;
  user: FriendRequestView['from'];
  children: React.ReactNode;
}) {
  return (
    <li className="flex items-center gap-3 p-3">
      <UserAvatar name={user.displayName} seed={user.id} src={user.avatarUrl} />
      <div className="min-w-0 flex-1">
        <p className="truncate font-medium">{user.displayName}</p>
        <p className="truncate text-xs text-muted-foreground">
          @{user.username}
          {request.message ? ` · ${t.friends.note(request.message)}` : ''}
        </p>
      </div>
      <div className="flex shrink-0 gap-2">{children}</div>
    </li>
  );
}

function FriendsSection() {
  const friends = useFriends();
  return (
    <section>
      <SectionTitle>{t.friends.listTitle}</SectionTitle>
      {friends.isPending ? (
        <p className="text-sm text-muted-foreground">{t.common.loading}</p>
      ) : friends.isError ? (
        <p className="text-sm text-destructive">{t.common.loadFailed}</p>
      ) : friends.data.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t.friends.empty}</p>
      ) : (
        <ul className="divide-y divide-border rounded-xl border border-border">
          {friends.data.map((friend) => (
            <FriendRow key={friend.id} friend={friend} />
          ))}
        </ul>
      )}
    </section>
  );
}

function FriendRow({ friend }: { friend: FriendView }) {
  const me = useMe();
  const open = useOpenConversation();
  const remove = useRemoveFriend();
  const block = useBlockUser();
  const confirm = useConfirm();
  const [menuOpen, setMenuOpen] = useState(false);

  const onRemove = () =>
    confirm.ask({
      title: t.friends.removeTitle,
      description: t.friends.confirmRemove(friend.displayName),
      confirmLabel: t.friends.remove,
      destructive: true,
      onConfirm: () => remove.mutate(friend.id),
    });
  const onBlock = () =>
    confirm.ask({
      title: t.friends.block,
      description: t.friends.confirmBlock(friend.displayName),
      confirmLabel: t.friends.block,
      destructive: true,
      onConfirm: () => block.mutate(friend.id),
    });

  return (
    <li className="flex items-center gap-3 p-3">
      <UserAvatar
        name={friend.displayName}
        seed={friend.id}
        src={friend.avatarUrl}
        online={friend.online}
      />
      <div className="min-w-0 flex-1">
        <p className="truncate font-medium">{friend.displayName}</p>
        <p className="truncate text-xs text-muted-foreground">
          @{friend.username} · {friend.online ? t.chat.online : t.chat.offline}
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-1 md:gap-2">
        <Button
          size="sm"
          onClick={() => open.mutate(friend.id)}
          disabled={open.isPending || !me.data}
        >
          {t.friends.message}
        </Button>
        {/* 宽屏上删除和拉黑直接摆出来；手机上一行放不下，收进“更多” */}
        <Button
          size="sm"
          variant="ghost"
          className="hidden md:inline-flex"
          onClick={onRemove}
          disabled={remove.isPending}
        >
          {t.friends.remove}
        </Button>
        <Button
          size="sm"
          variant="ghost"
          className="hidden md:inline-flex"
          onClick={onBlock}
          disabled={block.isPending}
        >
          {t.friends.block}
        </Button>
        <Button
          size="icon-sm"
          variant="ghost"
          className="md:hidden"
          aria-label={t.common.more}
          onClick={() => setMenuOpen(true)}
        >
          <Ellipsis />
        </Button>
      </div>
      <ActionSheet
        open={menuOpen}
        onOpenChange={setMenuOpen}
        title={friend.displayName}
        actions={[
          {
            key: 'remove',
            label: t.friends.removeTitle,
            icon: UserRoundX,
            destructive: true,
            onSelect: onRemove,
          },
          { key: 'block', label: t.friends.block, icon: Ban, destructive: true, onSelect: onBlock },
        ]}
      />
      {confirm.element}
    </li>
  );
}

function BlockedSection() {
  const blocked = useBlocked();
  const unblock = useUnblockUser();
  if (!blocked.data || blocked.data.length === 0) return null;
  return (
    <section>
      <SectionTitle>{t.friends.blockedTitle}</SectionTitle>
      <ul className="divide-y divide-border rounded-xl border border-border">
        {blocked.data.map((user: BlockedUserView) => (
          <li key={user.id} className="flex items-center gap-3 p-3">
            <UserAvatar name={user.displayName} seed={user.id} src={user.avatarUrl} />
            <div className="min-w-0 flex-1">
              <p className="truncate font-medium">{user.displayName}</p>
              <p className="truncate text-xs text-muted-foreground">@{user.username}</p>
            </div>
            <Button
              size="sm"
              variant="outline"
              className="shrink-0"
              onClick={() => unblock.mutate(user.id)}
              disabled={unblock.isPending}
            >
              {t.friends.unblock}
            </Button>
          </li>
        ))}
      </ul>
    </section>
  );
}
