import type { PublicUser } from './user';

/** 我和某个用户的关系，供搜索结果决定显示哪个按钮 */
export type RelationStatus =
  'self' | 'friend' | 'pending_outgoing' | 'pending_incoming' | 'blocked' | 'none';

export interface UserSearchResult extends PublicUser {
  relation: RelationStatus;
}

export type FriendRequestStatus = 'pending' | 'accepted' | 'rejected';

export interface FriendRequestView {
  id: number;
  from: PublicUser;
  to: PublicUser;
  message: string | null;
  status: FriendRequestStatus;
  createdAt: string;
  respondedAt: string | null;
}

/** 我拉黑的人 */
export interface BlockedUserView extends PublicUser {
  blockedAt: string;
}

export interface FriendRequestsView {
  incoming: FriendRequestView[];
  outgoing: FriendRequestView[];
}

export interface FriendView extends PublicUser {
  online: boolean;
  lastSeenAt: string | null;
  /** 和这个好友的私聊会话，成为好友时就会创建 */
  conversationId: number | null;
  friendsSince: string;
}
