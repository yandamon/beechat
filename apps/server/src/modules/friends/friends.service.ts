import type {
  BlockedUserView,
  FriendRequestView,
  FriendRequestsView,
  FriendView,
} from '@beechat/shared';
import { and, desc, eq, inArray, or } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import type { AppContext } from '../../context';
import type { DbLike } from '../../db/client';
import {
  conversations,
  type FriendRequest,
  friendRequests,
  friendships,
  type User,
  users,
} from '../../db/schema';
import { isUniqueViolation } from '../../lib/db-errors';
import { AppError } from '../../lib/errors';
import { toPublicUser } from '../../lib/views';
import { userRoom } from '../../realtime/rooms';
import {
  directKeyOf,
  getConversationView,
  getOrCreateDirectConversation,
  joinUserSockets,
} from '../conversations/conversations.service';
import { insertSystemMessage } from '../conversations/messages.service';
import { areFriends, hasBlocked } from './friends.repo';

const fromUser = alias(users, 'from_user');
const toUser = alias(users, 'to_user');

interface RequestRow {
  request: FriendRequest;
  from: User;
  to: User;
}

function toRequestView(row: RequestRow): FriendRequestView {
  return {
    id: row.request.id,
    from: toPublicUser(row.from),
    to: toPublicUser(row.to),
    message: row.request.message,
    status: row.request.status,
    createdAt: row.request.createdAt.toISOString(),
    respondedAt: row.request.respondedAt?.toISOString() ?? null,
  };
}

function toFriendView(
  ctx: AppContext,
  user: User,
  conversationId: number | null,
  friendsSince: Date,
): FriendView {
  return {
    ...toPublicUser(user),
    online: ctx.presence.isOnline(user.id),
    lastSeenAt: user.lastSeenAt?.toISOString() ?? null,
    conversationId,
    friendsSince: friendsSince.toISOString(),
  };
}

async function loadRequest(db: DbLike, requestId: number): Promise<RequestRow | null> {
  const [row] = await db
    .select({ request: friendRequests, from: fromUser, to: toUser })
    .from(friendRequests)
    .innerJoin(fromUser, eq(fromUser.id, friendRequests.fromUserId))
    .innerJoin(toUser, eq(toUser.id, friendRequests.toUserId))
    .where(eq(friendRequests.id, requestId))
    .limit(1);
  return row ?? null;
}

export async function createFriendRequest(
  ctx: AppContext,
  me: User,
  input: { userId: number; message?: string },
): Promise<FriendRequestView> {
  const { db, io } = ctx;
  if (input.userId === me.id) throw new AppError(400, '不能添加自己为好友', 'SELF_REQUEST');

  const [target] = await db.select().from(users).where(eq(users.id, input.userId)).limit(1);
  if (!target) throw new AppError(404, '用户不存在', 'USER_NOT_FOUND');
  if (await areFriends(db, me.id, target.id)) {
    throw new AppError(409, '你们已经是好友了', 'ALREADY_FRIENDS');
  }
  if (await hasBlocked(db, me.id, target.id)) {
    throw new AppError(400, '你已拉黑对方，先解除拉黑', 'BLOCKED_BY_ME');
  }
  // 被对方拉黑时不透露原因
  if (await hasBlocked(db, target.id, me.id)) {
    throw new AppError(403, '无法添加该用户', 'BLOCKED');
  }

  const [pending] = await db
    .select()
    .from(friendRequests)
    .where(
      and(
        eq(friendRequests.status, 'pending'),
        or(
          and(eq(friendRequests.fromUserId, me.id), eq(friendRequests.toUserId, target.id)),
          and(eq(friendRequests.fromUserId, target.id), eq(friendRequests.toUserId, me.id)),
        ),
      ),
    )
    .limit(1);
  if (pending) {
    if (pending.fromUserId === me.id) {
      throw new AppError(409, '已经发送过申请，等对方处理', 'REQUEST_PENDING');
    }
    throw new AppError(409, '对方已向你发送申请，去处理一下吧', 'REQUEST_INCOMING');
  }

  let request: FriendRequest | undefined;
  try {
    [request] = await db
      .insert(friendRequests)
      .values({ fromUserId: me.id, toUserId: target.id, message: input.message || null })
      .returning();
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new AppError(409, '已经发送过申请，等对方处理', 'REQUEST_PENDING');
    }
    throw error;
  }
  if (!request) throw new Error('insert returned no row');

  const view = toRequestView({ request, from: me, to: target });
  io.to(userRoom(target.id)).emit('friend:request', view);
  return view;
}

export async function listFriendRequests(
  ctx: AppContext,
  meId: number,
): Promise<FriendRequestsView> {
  const rows = await ctx.db
    .select({ request: friendRequests, from: fromUser, to: toUser })
    .from(friendRequests)
    .innerJoin(fromUser, eq(fromUser.id, friendRequests.fromUserId))
    .innerJoin(toUser, eq(toUser.id, friendRequests.toUserId))
    .where(
      and(
        eq(friendRequests.status, 'pending'),
        or(eq(friendRequests.toUserId, meId), eq(friendRequests.fromUserId, meId)),
      ),
    )
    .orderBy(desc(friendRequests.createdAt));
  const views = rows.map(toRequestView);
  return {
    incoming: views.filter((view) => view.to.id === meId),
    outgoing: views.filter((view) => view.from.id === meId),
  };
}

/** 接受或拒绝好友申请。接受时建立双向好友关系并创建私聊会话。 */
export async function respondFriendRequest(
  ctx: AppContext,
  me: User,
  requestId: number,
  accept: boolean,
): Promise<FriendRequestView> {
  const { db, io } = ctx;
  const row = await loadRequest(db, requestId);
  if (!row || row.request.toUserId !== me.id) {
    throw new AppError(404, '申请不存在', 'REQUEST_NOT_FOUND');
  }
  if (row.request.status !== 'pending') {
    throw new AppError(409, '这条申请已经处理过了', 'REQUEST_HANDLED');
  }
  const respondedAt = new Date();

  if (!accept) {
    const [updated] = await db
      .update(friendRequests)
      .set({ status: 'rejected', respondedAt })
      .where(eq(friendRequests.id, requestId))
      .returning();
    if (!updated) throw new Error('update returned no row');
    return toRequestView({ ...row, request: updated });
  }

  const requester = row.from;
  const { updated, conversationId } = await db.transaction(async (tx) => {
    const [updatedRequest] = await tx
      .update(friendRequests)
      .set({ status: 'accepted', respondedAt })
      .where(eq(friendRequests.id, requestId))
      .returning();
    if (!updatedRequest) throw new Error('update returned no row');
    await tx
      .insert(friendships)
      .values([
        { userId: me.id, friendId: requester.id },
        { userId: requester.id, friendId: me.id },
      ])
      .onConflictDoUpdate({
        target: [friendships.userId, friendships.friendId],
        set: { status: 'friend' },
      });
    const conversation = await getOrCreateDirectConversation(tx, me.id, requester.id);
    await insertSystemMessage(tx, conversation.id, '你们已经成为好友，打个招呼吧');
    return { updated: updatedRequest, conversationId: conversation.id };
  });

  joinUserSockets(io, me.id, conversationId);
  joinUserSockets(io, requester.id, conversationId);
  const [myView, requesterView] = await Promise.all([
    getConversationView(ctx, me.id, conversationId),
    getConversationView(ctx, requester.id, conversationId),
  ]);
  io.to(userRoom(me.id)).emit(
    'friend:accepted',
    toFriendView(ctx, requester, conversationId, respondedAt),
  );
  io.to(userRoom(requester.id)).emit(
    'friend:accepted',
    toFriendView(ctx, me, conversationId, respondedAt),
  );
  if (myView) io.to(userRoom(me.id)).emit('conversation:updated', myView);
  if (requesterView) io.to(userRoom(requester.id)).emit('conversation:updated', requesterView);

  return toRequestView({ ...row, request: updated });
}

export async function listFriends(ctx: AppContext, meId: number): Promise<FriendView[]> {
  const { db } = ctx;
  const rows = await db
    .select({ friend: users, since: friendships.createdAt })
    .from(friendships)
    .innerJoin(users, eq(users.id, friendships.friendId))
    .where(and(eq(friendships.userId, meId), eq(friendships.status, 'friend')))
    .orderBy(users.displayName, users.id);
  if (rows.length === 0) return [];

  const directKeys = rows.map((row) => directKeyOf(meId, row.friend.id));
  const conversationRows = await db
    .select({ id: conversations.id, directKey: conversations.directKey })
    .from(conversations)
    .where(inArray(conversations.directKey, directKeys));
  const conversationByKey = new Map(conversationRows.map((row) => [row.directKey, row.id]));

  return rows.map((row) =>
    toFriendView(
      ctx,
      row.friend,
      conversationByKey.get(directKeyOf(meId, row.friend.id)) ?? null,
      row.since,
    ),
  );
}

/** 删除好友：双向关系都删掉，会话与历史保留但不能再发消息 */
export async function removeFriend(ctx: AppContext, meId: number, friendId: number) {
  const { db, io } = ctx;
  const deleted = await db
    .delete(friendships)
    .where(
      or(
        and(eq(friendships.userId, meId), eq(friendships.friendId, friendId)),
        and(eq(friendships.userId, friendId), eq(friendships.friendId, meId)),
      ),
    )
    .returning({ userId: friendships.userId });
  if (deleted.length === 0) throw new AppError(404, '你们不是好友', 'NOT_FRIENDS');
  io.to(userRoom(meId)).emit('friend:removed', { userId: friendId });
  io.to(userRoom(friendId)).emit('friend:removed', { userId: meId });
}

/** 拉黑：解除好友关系，记一条 blocked 行；对方只会看到不再是好友 */
export async function blockUser(ctx: AppContext, meId: number, targetId: number) {
  const { db, io } = ctx;
  if (targetId === meId) throw new AppError(400, '不能拉黑自己', 'SELF_BLOCK');
  const [target] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.id, targetId))
    .limit(1);
  if (!target) throw new AppError(404, '用户不存在', 'USER_NOT_FOUND');
  await db.transaction(async (tx) => {
    await tx
      .delete(friendships)
      .where(and(eq(friendships.userId, targetId), eq(friendships.friendId, meId)));
    await tx
      .insert(friendships)
      .values({ userId: meId, friendId: targetId, status: 'blocked' })
      .onConflictDoUpdate({
        target: [friendships.userId, friendships.friendId],
        set: { status: 'blocked' },
      });
    // 双方之间未处理的申请一并作废
    await tx
      .delete(friendRequests)
      .where(
        and(
          eq(friendRequests.status, 'pending'),
          or(
            and(eq(friendRequests.fromUserId, meId), eq(friendRequests.toUserId, targetId)),
            and(eq(friendRequests.fromUserId, targetId), eq(friendRequests.toUserId, meId)),
          ),
        ),
      );
  });
  io.to(userRoom(meId)).emit('friend:removed', { userId: targetId });
  io.to(userRoom(targetId)).emit('friend:removed', { userId: meId });
}

/** 解除拉黑后不会自动恢复好友，需要重新申请 */
export async function unblockUser(ctx: AppContext, meId: number, targetId: number) {
  const deleted = await ctx.db
    .delete(friendships)
    .where(
      and(
        eq(friendships.userId, meId),
        eq(friendships.friendId, targetId),
        eq(friendships.status, 'blocked'),
      ),
    )
    .returning({ userId: friendships.userId });
  if (deleted.length === 0) throw new AppError(404, '没有拉黑这个用户', 'NOT_BLOCKED');
}

export async function listBlocked(ctx: AppContext, meId: number): Promise<BlockedUserView[]> {
  const rows = await ctx.db
    .select({ user: users, blockedAt: friendships.createdAt })
    .from(friendships)
    .innerJoin(users, eq(users.id, friendships.friendId))
    .where(and(eq(friendships.userId, meId), eq(friendships.status, 'blocked')))
    .orderBy(desc(friendships.createdAt));
  return rows.map((row) => ({ ...toPublicUser(row.user), blockedAt: row.blockedAt.toISOString() }));
}
