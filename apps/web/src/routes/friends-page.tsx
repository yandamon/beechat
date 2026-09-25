import type { FriendRequestView, FriendView, UserSearchResult } from '@beechat/shared';
import { ChevronLeft } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router';
import { UserAvatar } from '@/components/user-avatar';
import { Button, buttonVariants } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useMe } from '@/features/auth/use-auth';
import {
  useFriendRequests,
  useFriends,
  useOpenConversation,
  useRemoveFriend,
  useRespondFriendRequest,
  useSearchUsers,
  useSendFriendRequest,
} from '@/features/chat/queries';
import { t } from '@/i18n/zh-CN';
import { useDebounce } from '@/lib/use-debounce';
import { cn } from '@/lib/utils';

export function FriendsPage() {
  return (
    <div className="flex h-full min-h-0 flex-1 flex-col">
      <header className="flex h-12 shrink-0 items-center gap-2 border-b border-border px-2 md:px-4">
        <Link
          to="/"
          aria-label={t.common.back}
          className={cn(buttonVariants({ variant: 'ghost', size: 'icon' }), 'md:hidden')}
        >
          <ChevronLeft />
        </Link>
        <h2 className="text-sm font-semibold">{t.friends.title}</h2>
      </header>
      <div className="min-h-0 flex-1 space-y-8 overflow-y-auto p-4 md:p-6">
        <SearchSection />
        <RequestsSection />
        <FriendsSection />
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
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder={t.friends.searchPlaceholder}
        aria-label={t.friends.searchPlaceholder}
        autoComplete="off"
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

  const incoming = requests.data?.incoming.find((request) => request.from.id === user.id);
  let action: React.ReactNode;
  switch (user.relation) {
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
      <UserAvatar name={user.displayName} seed={user.id} />
      <div className="min-w-0 flex-1">
        <p className="truncate font-medium">{user.displayName}</p>
        <p className="truncate text-xs text-muted-foreground">@{user.username}</p>
        {sendRequest.error ? (
          <p className="text-xs text-destructive">{sendRequest.error.message}</p>
        ) : null}
      </div>
      {action}
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
      <UserAvatar name={user.displayName} seed={user.id} />
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
  const onRemove = () => {
    if (window.confirm(t.friends.confirmRemove(friend.displayName))) remove.mutate(friend.id);
  };
  return (
    <li className="flex items-center gap-3 p-3">
      <UserAvatar name={friend.displayName} seed={friend.id} online={friend.online} />
      <div className="min-w-0 flex-1">
        <p className="truncate font-medium">{friend.displayName}</p>
        <p className="truncate text-xs text-muted-foreground">
          @{friend.username} · {friend.online ? t.chat.online : t.chat.offline}
        </p>
      </div>
      <div className="flex shrink-0 gap-2">
        <Button
          size="sm"
          onClick={() => open.mutate(friend.id)}
          disabled={open.isPending || !me.data}
        >
          {t.friends.message}
        </Button>
        <Button size="sm" variant="ghost" onClick={onRemove} disabled={remove.isPending}>
          {t.friends.remove}
        </Button>
      </div>
    </li>
  );
}
