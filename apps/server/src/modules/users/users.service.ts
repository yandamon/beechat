import type { RelationStatus, UpdateProfileInput, UserSearchResult } from '@beechat/shared';
import { and, eq, ilike, inArray, or } from 'drizzle-orm';
import type { AppContext } from '../../context';
import { friendRequests, friendships, type User, users } from '../../db/schema';
import { toPublicUser } from '../../lib/views';
import { requireCompletedUpload } from '../uploads/uploads.service';

const escapeLike = (value: string) => value.replace(/[\\%_]/g, (char) => `\\${char}`);

/** 按用户名模糊搜索，最多 20 条，并附带我和每个人的关系 */
export async function searchUsers(
  ctx: AppContext,
  meId: number,
  query: string,
): Promise<UserSearchResult[]> {
  const { db } = ctx;
  const rows = await db
    .select()
    .from(users)
    .where(ilike(users.username, `%${escapeLike(query.toLowerCase())}%`))
    .orderBy(users.username)
    .limit(20);

  const otherIds = rows.map((row) => row.id).filter((id) => id !== meId);
  const relations = new Map<number, RelationStatus>();

  if (otherIds.length > 0) {
    const friendRows = await db
      .select({ friendId: friendships.friendId, status: friendships.status })
      .from(friendships)
      .where(and(eq(friendships.userId, meId), inArray(friendships.friendId, otherIds)));
    for (const row of friendRows) {
      relations.set(row.friendId, row.status === 'blocked' ? 'blocked' : 'friend');
    }

    const pendingRows = await db
      .select({ fromUserId: friendRequests.fromUserId, toUserId: friendRequests.toUserId })
      .from(friendRequests)
      .where(
        and(
          eq(friendRequests.status, 'pending'),
          or(
            and(eq(friendRequests.fromUserId, meId), inArray(friendRequests.toUserId, otherIds)),
            and(eq(friendRequests.toUserId, meId), inArray(friendRequests.fromUserId, otherIds)),
          ),
        ),
      );
    for (const row of pendingRows) {
      const otherId = row.fromUserId === meId ? row.toUserId : row.fromUserId;
      if (relations.get(otherId) === 'blocked') continue;
      relations.set(otherId, row.fromUserId === meId ? 'pending_outgoing' : 'pending_incoming');
    }
  }

  return rows.map((row) => ({
    ...toPublicUser(row),
    relation: row.id === meId ? 'self' : (relations.get(row.id) ?? 'none'),
  }));
}

/** 修改显示名或头像；头像必须是本人已完成的 avatar 类型上传 */
export async function updateProfile(
  ctx: AppContext,
  me: User,
  input: UpdateProfileInput,
): Promise<User> {
  const patch: { displayName?: string; avatarKey?: string | null } = {};
  if (input.displayName !== undefined) patch.displayName = input.displayName;
  if (input.avatarKey !== undefined) {
    if (input.avatarKey !== null) {
      await requireCompletedUpload(ctx.db, input.avatarKey, me.id, 'avatar');
    }
    patch.avatarKey = input.avatarKey;
  }
  if (Object.keys(patch).length === 0) return me;
  const [updated] = await ctx.db.update(users).set(patch).where(eq(users.id, me.id)).returning();
  return updated ?? me;
}
